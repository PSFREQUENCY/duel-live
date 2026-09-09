// The rules engine. It owns every outcome in a duel; the cinema layer only ever
// renders the events it emits. Actions are pure: apply* clones before mutating.

import { getCard } from "./cards/index.js";
import {
  applyEffect, dealDamage, findFusion, placeMonster, sendToGraveyard,
} from "./duel-effects.js";
import { autoTargets, needsChoice, targetOptions, targetSpecFor } from "./duel-targets.js";
import {
  cardOf, createDuel, drawInto, effectiveStats, emptyBackrowZone, emptyMonsterZone,
  monstersOn, mulberry32, other, SIDES,
} from "./duel-state.js";

export { createDuel, SIDES, other, effectiveStats, cardOf };

const PHASES = ["draw", "main1", "battle", "end"];
const clone = (state) => structuredClone(state);

function rngFor(state) {
  return () => {
    state.rngCalls += 1;
    return mulberry32(state.seed + state.rngCalls * 7919)();
  };
}

function newCtx(state, extra = {}) {
  return { events: [], rng: rngFor(state), negateAttack: false, endBattlePhase: false, ...extra };
}

export function tributesRequired(card) {
  if (card.level >= 7) return 2;
  if (card.level >= 5) return 1;
  return 0;
}

function tributeValue(state, side, inst) {
  const card = cardOf(inst);
  return card.doubleTributeFor ? 2 : 1;
}

export function canNormalSummon(state, side, uid) {
  const s = state.sides[side];
  const inst = s.hand.find((c) => c.uid === uid);
  if (!inst) return false;
  const card = cardOf(inst);
  if (card.kind !== "monster" || card.fusion || card.noNormalSummon) return false;
  if (s.normalSummonUsed || emptyMonsterZone(state, side) < 0) return false;
  const need = tributesRequired(card);
  const available = monstersOn(state, side).reduce((sum, m) => sum + tributeValue(state, side, m), 0);
  return available >= need;
}

// ---------------------------------------------------------------- actions ---

function isFusionMaterial(state, side, inst) {
  return state.sides[side].extra.some((f) => getCard(f.cardId).fusion.includes(inst.cardId));
}

/** How the AI, or an auto-resolve, would spend tributes: weakest first, but
 * never eating a live fusion material while an ordinary body is available. */
export function defaultTributes(state, side, need) {
  const cost = (m) => effectiveStats(state, side, m).atk + (isFusionMaterial(state, side, m) ? 10000 : 0);
  const fodder = monstersOn(state, side).sort((a, b) => cost(a) - cost(b));
  const chosen = [];
  let left = need;
  while (left > 0 && fodder.length) {
    const victim = fodder.shift();
    left -= tributeValue(state, side, victim);
    chosen.push(victim.uid);
  }
  return chosen;
}

/** Does the chosen set cover the cost? Kaiser Sea Horse counts as two. */
export function tributesCover(state, side, uids, need) {
  const field = monstersOn(state, side);
  const chosen = uids.map((uid) => field.find((m) => m.uid === uid)).filter(Boolean);
  if (chosen.length !== uids.length) return false;
  return chosen.reduce((sum, m) => sum + tributeValue(state, side, m), 0) >= need;
}

function payTributes(state, side, uids, ctx) {
  const field = monstersOn(state, side);
  for (const uid of uids) {
    const victim = field.find((m) => m.uid === uid);
    if (victim) sendToGraveyard(state, side, victim, ctx, "tribute");
  }
}

function completeSummon(state, side, inst, action, ctx) {
  const s = state.sides[side];
  s.normalSummonUsed = true;
  const position = action.set ? "defense" : (action.position ?? "attack");
  placeMonster(state, side, inst, ctx, { position, how: action.set ? "set" : "normal" });
  if (action.set) {
    const zone = s.monsters.indexOf(inst);
    s.monsters[zone].faceDown = true;
    ctx.events[ctx.events.length - 1].faceDown = true;
  }
  if (s.virusTurns > 0 && effectiveStats(state, side, inst).atk >= s.virusThreshold) {
    sendToGraveyard(state, side, inst, ctx, "crushVirus");
  }
}

function actSummon(state, side, action, ctx) {
  const s = state.sides[side];
  const inst = s.hand.splice(s.hand.findIndex((c) => c.uid === action.uid), 1)[0];
  const need = tributesRequired(cardOf(inst));

  if (need > 0) {
    const chosen = action.tributes ?? null;
    // With more monsters than the cost demands, which ones go is the player's
    // decision, not the engine's -- so ask instead of picking for them.
    const candidates = monstersOn(state, side);
    if (!chosen && candidates.length > need) {
      state.pending = {
        kind: "tribute", side, summonUid: inst.uid, need,
        card: cardOf(inst).name,
        options: candidates.map((m) => m.uid),
        set: Boolean(action.set),
      };
      s.hand.push(inst);
      return;
    }
    const tributes = chosen ?? defaultTributes(state, side, need);
    if (!tributesCover(state, side, tributes, need)) { s.hand.push(inst); return; }
    payTributes(state, side, tributes, ctx);
  }
  completeSummon(state, side, inst, action, ctx);
}

/** Finish an activation the player paused to choose targets for. */
export function respondToTarget(state, uids) {
  const next = clone(state);
  const pending = next.pending;
  if (!pending || pending.kind !== "target") return { state: next, events: [] };
  const chosen = uids ?? [];
  // An optional pick may be empty; a required one may not be under-filled.
  if (!pending.optional && chosen.length !== pending.need) return { state: next, events: [] };

  next.pending = null;
  const ctx = newCtx(next);
  const side = pending.side;
  const s = next.sides[side];
  const held = s.hand.find((c) => c.uid === pending.activateUid)
    ?? s.backrow.find((c) => c && c.uid === pending.activateUid);
  if (!held) return { state: next, events: ctx.events };
  const card = cardOf(held);
  actActivateResolved(next, side, { uid: pending.activateUid, targets: chosen }, ctx, targetSpecFor(card), card);
  checkWin(next, ctx);
  return { state: next, events: ctx.events };
}

/** Finish a summon the player paused to choose tributes for. */
export function respondToTribute(state, uids) {
  const next = clone(state);
  const pending = next.pending;
  if (!pending || pending.kind !== "tribute") return { state: next, events: [] };
  const { side, summonUid, need } = pending;
  if (!tributesCover(next, side, uids, need)) return { state: next, events: [] };

  next.pending = null;
  const ctx = newCtx(next);
  const s = next.sides[side];
  const inst = s.hand.splice(s.hand.findIndex((c) => c.uid === summonUid), 1)[0];
  if (!inst) return { state: next, events: ctx.events };
  payTributes(next, side, uids, ctx);
  completeSummon(next, side, inst, { set: pending.set }, ctx);
  checkWin(next, ctx);
  return { state: next, events: ctx.events };
}

function actSetBackrow(state, side, action, ctx) {
  const s = state.sides[side];
  const zone = emptyBackrowZone(state, side);
  if (zone < 0) return;
  const inst = s.hand.splice(s.hand.findIndex((c) => c.uid === action.uid), 1)[0];
  inst.faceDown = true;
  s.backrow[zone] = inst;
  ctx.events.push({ type: "set", side, kind: cardOf(inst).kind });
}

function actActivate(state, side, action, ctx) {
  const s = state.sides[side];
  const card = cardOf(
    s.hand.find((c) => c.uid === action.uid) ?? s.backrow.find((c) => c && c.uid === action.uid) ?? {},
  );
  // Where the card points is the player's decision, so ask before resolving --
  // but only when there is more than one thing it could point at.
  const spec = targetSpecFor(card);
  if (spec && !action.targets && !spec.after && needsChoice(state, side, spec, card)) {
    state.pending = {
      kind: "target", side, activateUid: action.uid, card: card.name,
      prompt: spec.prompt, need: spec.count, optional: Boolean(spec.optional),
      options: targetOptionsFor(state, side, card),
    };
    return;
  }
  actActivateResolved(state, side, action, ctx, spec, card);
}

export function targetOptionsFor(state, side, card) {
  const spec = targetSpecFor(card);
  return spec ? targetOptions(state, side, spec, card) : [];
}

function actActivateResolved(state, side, action, ctx, spec, card) {
  const s = state.sides[side];
  const fromHand = s.hand.findIndex((c) => c.uid === action.uid);
  const inst = fromHand >= 0 ? s.hand.splice(fromHand, 1)[0] : s.backrow.find((c) => c && c.uid === action.uid);
  if (!inst) return;
  ctx.events.push({ type: "activate", side, card: card.name, art: card.art, text: card.text });
  ctx.targets = action.targets ?? (spec && !spec.after ? autoTargets(state, side, spec, card) : null);
  if (card.sub === "equip") {
    const zone = fromHand >= 0 ? emptyBackrowZone(state, side) : s.backrow.indexOf(inst);
    if (zone < 0) return;
    s.backrow[zone] = inst;
    inst.faceDown = false;
    const host = monstersOn(state, side).find((m) => equipFits(state, side, m, card)) ?? monstersOn(state, side)[0];
    if (host) host.equips.push(inst.uid);
    return;
  }
  applyEffect(state, side, card.effect, ctx);
  if (fromHand >= 0) s.graveyard.push(inst);
  else if (card.sub !== "continuous") {
    s.backrow[s.backrow.indexOf(inst)] = null;
    s.graveyard.push(inst);
  } else inst.faceDown = false;
}

function equipFits(state, side, inst, equipCard) {
  const req = equipCard.effect?.requires;
  if (!req) return true;
  const card = cardOf(inst);
  if (req.attribute) return card.attribute === req.attribute;
  if (req.type) return card.type === req.type;
  if (req.name) return card.name === req.name || card.treatedAs === req.name;
  return true;
}

export function requirementMet(state, side, card) {
  const req = card.effect?.requires;
  if (!req || typeof req !== "string") return true;
  return monstersOn(state, side).some((m) => m.cardId === req && !m.faceDown);
}

export function canChangePosition(state, side, inst) {
  return positionBlockedBecause(inst) === null;
}

/**
 * Why a monster cannot change position, or null when it can. A monster changes
 * position once per turn, so it cannot be flipped back and forth to dodge an
 * attack after the fact -- but a blocked click should say so rather than
 * appearing to do nothing.
 */
export function positionBlockedBecause(inst) {
  if (!inst) return "no monster there";
  if (inst.summonedThisTurn) return "it came down this turn";
  if (inst.hasAttacked) return "it already attacked";
  if (inst.positionChanged) return "it already changed position this turn";
  return null;
}

function actPosition(state, side, action, ctx) {
  const inst = monstersOn(state, side).find((m) => m.uid === action.uid);
  if (!canChangePosition(state, side, inst)) return;
  const wasFaceDown = inst.faceDown;
  inst.position = inst.position === "attack" ? "defense" : "attack";
  inst.faceDown = false;
  inst.positionChanged = true;
  ctx.events.push({
    type: "position", side, card: cardOf(inst).name,
    position: inst.position, flipped: wasFaceDown,
  });
}

// ----------------------------------------------------------------- battle ---

export function canAttack(state, side, inst) {
  const s = state.sides[side];
  if (state.phase !== "battle" || state.activeSide !== side) return false;
  if (inst.hasAttacked || inst.faceDown || inst.position !== "attack" || inst.bound) return false;
  if (s.lockAttacksTurns > 0) return false;
  if (state.gravityBindLevel && cardOf(inst).level >= state.gravityBindLevel) return false;
  return true;
}

function resolveBattle(state, side, attacker, defender, ctx) {
  const foe = other(side);
  const a = effectiveStats(state, side, attacker).atk;
  if (!defender) {
    dealDamage(state, foe, a, ctx, "direct");
    ctx.events.push({ type: "directAttack", side, card: cardOf(attacker).name, damage: a });
    return;
  }
  if (defender.faceDown) {
    defender.faceDown = false;
    ctx.events.push({ type: "flip", side: foe, card: cardOf(defender).name });
  }
  const d = effectiveStats(state, foe, defender);
  const wall = defender.position === "attack" ? d.atk : d.def;
  ctx.events.push({
    type: "clash", side, attacker: cardOf(attacker).name, defender: cardOf(defender).name,
    attackerAtk: a, defenderValue: wall, defenderPosition: defender.position,
  });
  if (a > wall) {
    sendToGraveyard(state, foe, defender, ctx, "battle");
    if (defender.position === "attack") dealDamage(state, foe, a - wall, ctx, "battle");
  } else if (a < wall) {
    if (defender.position === "attack") sendToGraveyard(state, side, attacker, ctx, "battle");
    dealDamage(state, side, wall - a, ctx, "battle");
    if (cardOf(defender).reflectBattleDamage) dealDamage(state, foe, wall - a, ctx, "amazoness");
  } else if (defender.position === "attack") {
    sendToGraveyard(state, foe, defender, ctx, "battle");
    sendToGraveyard(state, side, attacker, ctx, "battle");
  }
}

function actAttack(state, side, action, ctx) {
  const attacker = monstersOn(state, side).find((m) => m.uid === action.uid);
  if (!attacker || !canAttack(state, side, attacker)) return;
  const foe = other(side);
  const targets = monstersOn(state, foe);
  const defender = action.targetUid ? targets.find((m) => m.uid === action.targetUid) : (targets[0] ?? null);
  attacker.hasAttacked = true;
  ctx.events.push({ type: "declare", side, card: cardOf(attacker).name, target: defender ? cardOf(defender).name : "direct" });

  const window = trapWindow(state, foe, "onAttack");
  if (window.length && !ctx.skipTrapWindow) {
    state.pending = {
      kind: "trapWindow", side: foe, options: window.map((c) => c.uid),
      resume: { action, attackerUid: attacker.uid, defenderUid: defender?.uid ?? null },
    };
    return;
  }
  if (state.sides[foe].hats && targets.length) {
    const hit = ctx.rng() < 1 / state.sides[foe].hats.odds;
    ctx.events.push({ type: "hats", side: foe, hit });
    state.sides[foe].hats = null;
    if (!hit) return;
  }
  resolveBattle(state, side, attacker, defender, ctx);
}

export function trapWindow(state, side, trigger) {
  return state.sides[side].backrow.filter((inst) => {
    if (!inst || !inst.faceDown) return false;
    const card = cardOf(inst);
    return card.kind === "trap" && card.trigger === trigger;
  });
}

// ------------------------------------------------------------- turn cycle ---

function endOfTurnCleanup(state, ctx) {
  for (const side of SIDES) {
    const s = state.sides[side];
    for (const inst of monstersOn(state, side)) {
      if (inst.tempUntilEndOfTurn) { inst.atkMod = 0; inst.defMod = 0; inst.tempUntilEndOfTurn = false; }
      if (inst.borrowedFrom) {
        s.monsters[s.monsters.indexOf(inst)] = null;
        const home = state.sides[inst.borrowedFrom];
        const zone = home.monsters.indexOf(null);
        delete inst.borrowedFrom;
        if (zone >= 0) home.monsters[zone] = inst; else home.graveyard.push(inst);
      }
    }
    while (s.hand.length > 6) sendToGraveyard(state, side, s.hand.pop(), ctx, "handLimit");
  }
}

function startTurn(state, ctx) {
  const side = state.activeSide;
  const s = state.sides[side];
  s.normalSummonUsed = false;
  s.lockAttacksTurns = Math.max(0, s.lockAttacksTurns - 1);
  s.virusTurns = Math.max(0, s.virusTurns - 1);
  for (const inst of monstersOn(state, side)) {
    inst.hasAttacked = false;
    inst.summonedThisTurn = false;
    inst.positionChanged = false;
    inst.bound = false;
  }
  ctx.events.push({ type: "phase", phase: "draw", side, turn: state.turn });
  const card = drawInto(s);
  if (!card) { finish(state, other(side), "deckout", ctx); return; }
  ctx.events.push({ type: "draw", side, card: cardOf(card).name, uid: card.uid });
  state.phase = "main1";
}

function finish(state, winner, reason, ctx) {
  state.winner = winner;
  state.winReason = reason;
  ctx.events.push({ type: "win", side: winner, reason });
}

function checkWin(state, ctx) {
  if (state.winner) return;
  for (const side of SIDES) {
    if (state.sides[side].lp <= 0) finish(state, other(side), "lifePoints", ctx);
  }
}

export function endTurn(state) {
  const next = clone(state);
  const ctx = newCtx(next);
  endOfTurnCleanup(next, ctx);
  next.activeSide = other(next.activeSide);
  next.turn += 1;
  next.phase = "draw";
  startTurn(next, ctx);
  checkWin(next, ctx);
  return { state: next, events: ctx.events };
}

export function setPhase(state, phase) {
  if (!PHASES.includes(phase)) throw new Error(`Unknown phase: ${phase}`);
  const next = clone(state);
  next.phase = phase;
  return { state: next, events: [{ type: "phase", phase, side: next.activeSide, turn: next.turn }] };
}

const HANDLERS = {
  summon: actSummon, set: actSummon, setBackrow: actSetBackrow,
  activate: actActivate, position: actPosition, attack: actAttack,
};

export function applyAction(state, action) {
  const next = clone(state);
  if (next.winner) return { state: next, events: [] };
  const ctx = newCtx(next);
  const handler = HANDLERS[action.type];
  if (!handler) throw new Error(`Unknown action: ${action.type}`);
  handler(next, action.side ?? next.activeSide, action, ctx);
  checkWin(next, ctx);
  return { state: next, events: ctx.events };
}

export function respondToTrapWindow(state, choiceUid) {
  const next = clone(state);
  const pending = next.pending;
  if (!pending || pending.kind !== "trapWindow") return { state: next, events: [] };
  next.pending = null;
  const ctx = newCtx(next);
  const side = pending.side;
  const attackerSide = other(side);
  const attacker = monstersOn(next, attackerSide).find((m) => m.uid === pending.resume.attackerUid);
  const defender = monstersOn(next, side).find((m) => m.uid === pending.resume.defenderUid) ?? null;

  if (choiceUid) {
    const inst = next.sides[side].backrow.find((c) => c && c.uid === choiceUid);
    if (inst) {
      const card = cardOf(inst);
      inst.faceDown = false;
      ctx.events.push({ type: "activate", side, card: card.name, art: card.art, text: card.text, reveal: true });
      applyEffect(next, side, card.effect, Object.assign(ctx, { target: attacker }));
      if (card.sub !== "continuous") {
        next.sides[side].backrow[next.sides[side].backrow.indexOf(inst)] = null;
        next.sides[side].graveyard.push(inst);
      }
    }
  }
  if (!ctx.negateAttack && attacker && next.sides[attackerSide].monsters.includes(attacker)) {
    resolveBattle(next, attackerSide, attacker, defender, ctx);
  }
  if (ctx.endBattlePhase) next.phase = "end";
  checkWin(next, ctx);
  return { state: next, events: ctx.events };
}

// ------------------------------------------------------------ legal moves ---

export function legalActions(state, side = state.activeSide) {
  if (state.winner || state.pending) return [];
  const s = state.sides[side];
  const out = [];
  if (state.phase === "main1") {
    for (const inst of s.hand) {
      const card = cardOf(inst);
      if (card.kind === "monster") {
        if (canNormalSummon(state, side, inst.uid)) {
          out.push({ type: "summon", uid: inst.uid, label: `Summon ${card.name}` });
          out.push({ type: "set", uid: inst.uid, set: true, label: `Set ${card.name}` });
        }
      } else if (card.kind === "spell") {
        if (playableSpell(state, side, inst)) out.push({ type: "activate", uid: inst.uid, label: `Activate ${card.name}` });
        if (emptyBackrowZone(state, side) >= 0) out.push({ type: "setBackrow", uid: inst.uid, label: `Set ${card.name}` });
      } else if (emptyBackrowZone(state, side) >= 0) {
        out.push({ type: "setBackrow", uid: inst.uid, label: `Set ${card.name}` });
      }
    }
    for (const inst of monstersOn(state, side)) {
      if (!canChangePosition(state, side, inst)) continue;
      const label = inst.faceDown
        ? "Flip face-up in Attack Position"
        : inst.position === "attack"
          ? `Switch ${cardOf(inst).name} to Defence`
          : `Switch ${cardOf(inst).name} to Attack`;
      out.push({ type: "position", uid: inst.uid, label });
    }
  }
  if (state.phase === "battle") {
    const targets = monstersOn(state, other(side));
    for (const inst of monstersOn(state, side)) {
      if (!canAttack(state, side, inst)) continue;
      if (!targets.length) out.push({ type: "attack", uid: inst.uid, label: `${cardOf(inst).name} attacks directly` });
      for (const target of targets) {
        out.push({ type: "attack", uid: inst.uid, targetUid: target.uid, label: `${cardOf(inst).name} → ${cardOf(target).name}` });
      }
    }
  }
  return out;
}

function playableSpell(state, side, inst) {
  const card = cardOf(inst);
  if (!requirementMet(state, side, card)) return false;
  const s = state.sides[side];
  if (card.effect.op === "fusionSummon") {
    const pool = [...s.hand, ...monstersOn(state, side)].filter((c) => cardOf(c).kind === "monster");
    return Boolean(findFusion(pool.map((c) => c.cardId), s.extra));
  }
  if (card.effect.op === "revive") {
    return [...s.graveyard, ...state.sides[other(side)].graveyard].some((c) => cardOf(c).kind === "monster")
      && emptyMonsterZone(state, side) >= 0;
  }
  if (card.effect.op === "takeControl") return monstersOn(state, other(side)).length > 0 && s.lp > card.effect.cost;
  if (card.sub === "equip") return monstersOn(state, side).some((m) => equipFits(state, side, m, card));
  if (card.effect.op === "tokens" || card.effect.op === "summonFromDeck") return emptyMonsterZone(state, side) >= 0;
  if (card.effect.op === "destroyFoeBackrow") return state.sides[other(side)].backrow.some(Boolean);
  return true;
}
