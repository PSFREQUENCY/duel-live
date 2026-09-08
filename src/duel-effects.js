// Effect op dispatcher. Every Spell/Trap in src/cards resolves through this
// table, so new cards are data changes rather than engine branches.

import { getCard } from "./cards/index.js";
import {
  cardOf, drawInto, effectiveStats, emptyMonsterZone, makeInstance,
  matchesName, monstersOn, other,
} from "./duel-state.js";

const emit = (ctx, event) => ctx.events.push(event);

function sendToGraveyard(state, side, inst, ctx, cause = "effect") {
  const s = state.sides[side];
  const mZone = s.monsters.indexOf(inst);
  if (mZone >= 0) s.monsters[mZone] = null;
  const bZone = s.backrow.indexOf(inst);
  if (bZone >= 0) s.backrow[bZone] = null;
  s.graveyard.push(inst);
  emit(ctx, { type: "destroy", side, uid: inst.uid, card: cardOf(inst).name, cause });
}
export { sendToGraveyard };

export function dealDamage(state, side, amount, ctx, cause) {
  if (amount <= 0) return;
  const s = state.sides[side];
  s.lp = Math.max(0, s.lp - amount);
  emit(ctx, { type: "damage", side, amount, lp: s.lp, cause });
}

function placeMonster(state, side, inst, ctx, { position = "attack", how = "special" } = {}) {
  const zone = emptyMonsterZone(state, side);
  if (zone < 0) return false;
  inst.position = position;
  inst.faceDown = false;
  inst.summonedThisTurn = true;
  inst.hasAttacked = false;
  state.sides[side].monsters[zone] = inst;
  const stats = effectiveStats(state, side, inst);
  emit(ctx, { type: "summon", side, uid: inst.uid, card: cardOf(inst).name, how, position, ...stats });
  return true;
}
export { placeMonster };

function pullFromAnywhere(state, side, uid) {
  for (const s of [state.sides.player, state.sides.opponent]) {
    for (const pool of ["hand", "graveyard", "extra"]) {
      const i = s[pool].findIndex((c) => c.uid === uid);
      if (i >= 0) return s[pool].splice(i, 1)[0];
    }
    const m = s.monsters.findIndex((c) => c && c.uid === uid);
    if (m >= 0) { const c = s.monsters[m]; s.monsters[m] = null; return c; }
  }
  return null;
}

export function findFusion(materialIds, extra) {
  return extra.find((inst) => {
    const need = getCard(inst.cardId).fusion.slice();
    const have = materialIds.slice();
    return need.every((id) => {
      const i = have.indexOf(id);
      if (i < 0) return false;
      have.splice(i, 1);
      return true;
    });
  }) ?? null;
}

const OPS = {
  draw(state, side, effect, ctx) {
    for (let i = 0; i < effect.count; i += 1) {
      const card = drawInto(state.sides[side]);
      if (card) emit(ctx, { type: "draw", side, card: cardOf(card).name });
    }
    const toss = effect.discard ?? 0;
    for (let i = 0; i < toss; i += 1) {
      const hand = state.sides[side].hand;
      const worst = hand.reduce((a, b) => (cardOf(a).atk ?? 0) <= (cardOf(b).atk ?? 0) ? a : b, hand[0]);
      if (worst) sendToGraveyard(state, side, hand.splice(hand.indexOf(worst), 1)[0], ctx, "discard");
    }
  },

  destroyAllMonsters(state, side, effect, ctx) {
    for (const s of ["player", "opponent"]) {
      for (const inst of monstersOn(state, s)) sendToGraveyard(state, s, inst, ctx, "darkHole");
    }
  },

  destroyFoeBackrow(state, side, effect, ctx) {
    const foe = other(side);
    let left = effect.limit ?? 99;
    for (const inst of state.sides[foe].backrow.filter(Boolean)) {
      if (left <= 0) break;
      if (effect.only && cardOf(inst).kind !== effect.only) continue;
      sendToGraveyard(state, foe, inst, ctx, "backrowWipe");
      left -= 1;
    }
  },

  bounceAllBackrow(state, side, effect, ctx) {
    for (const s of ["player", "opponent"]) {
      const sd = state.sides[s];
      sd.backrow.forEach((inst, i) => {
        if (!inst) return;
        sd.backrow[i] = null;
        inst.faceDown = false;
        sd.hand.push(inst);
        emit(ctx, { type: "bounce", side: s, card: cardOf(inst).name });
      });
    }
  },

  revive(state, side, effect, ctx) {
    const pool = [...state.sides[side].graveyard, ...state.sides[other(side)].graveyard]
      .filter((c) => cardOf(c).kind === "monster");
    const best = pool.sort((a, b) => cardOf(b).atk - cardOf(a).atk)[0];
    if (!best) return;
    placeMonster(state, side, pullFromAnywhere(state, side, best.uid), ctx, { how: "reborn" });
  },

  tokens(state, side, effect, ctx) {
    for (let i = 0; i < effect.count; i += 1) {
      if (emptyMonsterZone(state, side) < 0) break;
      const token = makeInstance("sheepToken", state.sides[side].duelistId);
      placeMonster(state, side, token, ctx, { position: "defense", how: "token" });
    }
  },

  swapAtkDef(state, side, effect, ctx) {
    for (const s of ["player", "opponent"]) {
      for (const inst of monstersOn(state, s)) {
        const card = cardOf(inst);
        inst.atkMod += card.def - card.atk;
        inst.defMod += card.atk - card.def;
        inst.tempUntilEndOfTurn = true;
      }
    }
    emit(ctx, { type: "fieldShift", side, label: "Shield & Sword" });
  },

  lockAttacks(state, side, effect, ctx) {
    state.sides[other(side)].lockAttacksTurns = effect.turns;
    emit(ctx, { type: "fieldShift", side, label: "Swords of Revealing Light" });
  },

  gravityBind(state, side, effect, ctx) {
    state.gravityBindLevel = effect.minLevel;
    emit(ctx, { type: "fieldShift", side, label: "Gravity Bind" });
  },

  magicalHats(state, side, effect, ctx) {
    state.sides[side].hats = { odds: 4 };
    emit(ctx, { type: "fieldShift", side, label: "Magical Hats" });
  },

  modifyAtk(state, side, effect, ctx) {
    const targets = effect.target === "attackers"
      ? monstersOn(state, other(side)).filter((m) => m.position === "attack")
      : [ctx.target].filter(Boolean);
    for (const inst of targets) {
      const owner = state.sides.player.monsters.includes(inst) ? "player" : "opponent";
      const { atk } = effectiveStats(state, owner, inst);
      inst.atkMod -= Math.round(atk * (1 - effect.factor));
      inst.tempUntilEndOfTurn = true;
      emit(ctx, { type: "statChange", side: owner, uid: inst.uid, card: cardOf(inst).name });
    }
  },

  bindMonster(state, side, effect, ctx) {
    if (!ctx.target) return;
    ctx.target.bound = true;
    ctx.target.atkMod += effect.atk;
    emit(ctx, { type: "statChange", side: other(side), uid: ctx.target.uid, card: cardOf(ctx.target).name });
  },

  diceBuff(state, side, effect, ctx) {
    const roll = 1 + Math.floor(ctx.rng() * 6);
    const target = effect.side === "self" ? side : other(side);
    for (const inst of monstersOn(state, target)) {
      inst.atkMod += roll * effect.per;
      inst.tempUntilEndOfTurn = true;
    }
    emit(ctx, { type: "dice", side, roll, delta: roll * effect.per, target });
  },

  equip(state, side, effect, ctx) { /* bonus is read from the backrow slot itself */ },

  takeControl(state, side, effect, ctx) {
    if (effect.cost) dealDamage(state, side, effect.cost, ctx, "cost");
    const foe = other(side);
    const prize = monstersOn(state, foe).sort((a, b) => effectiveStats(state, foe, b).atk - effectiveStats(state, foe, a).atk)[0];
    if (!prize || emptyMonsterZone(state, side) < 0) return;
    state.sides[foe].monsters[state.sides[foe].monsters.indexOf(prize)] = null;
    prize.borrowedFrom = foe;
    placeMonster(state, side, prize, ctx, { how: "control" });
  },

  summonFromDeck(state, side, effect, ctx) {
    const deck = state.sides[side].deck;
    const i = deck.findIndex((c) => c.cardId === effect.cardId);
    if (i < 0) return;
    placeMonster(state, side, deck.splice(i, 1)[0], ctx, { how: "special" });
  },

  summonFromHand(state, side, effect, ctx) {
    const hand = state.sides[side].hand;
    let left = effect.count;
    for (const inst of hand.filter((c) => cardOf(c).type === effect.type).slice(0, effect.count)) {
      if (left <= 0 || emptyMonsterZone(state, side) < 0) break;
      hand.splice(hand.indexOf(inst), 1);
      placeMonster(state, side, inst, ctx, { how: "flute" });
      left -= 1;
    }
  },

  fusionSummon(state, side, effect, ctx) {
    const s = state.sides[side];
    const pool = [...s.hand, ...monstersOn(state, side)].filter((c) => cardOf(c).kind === "monster");
    const target = findFusion(pool.map((c) => c.cardId), s.extra);
    if (!target) return;
    for (const id of getCard(target.cardId).fusion) {
      const inst = pool.find((c) => c.cardId === id && !c.consumed);
      if (!inst) continue;
      inst.consumed = true;
      const hi = s.hand.indexOf(inst);
      if (hi >= 0) s.hand.splice(hi, 1);
      sendToGraveyard(state, side, inst, ctx, "fusionMaterial");
    }
    s.extra.splice(s.extra.indexOf(target), 1);
    placeMonster(state, side, target, ctx, { how: "fusion" });
    emit(ctx, { type: "fusion", side, card: cardOf(target).name });
  },

  destroyAttackers(state, side, effect, ctx) {
    for (const inst of monstersOn(state, other(side)).filter((m) => m.position === "attack")) {
      sendToGraveyard(state, other(side), inst, ctx, "mirrorForce");
    }
    ctx.negateAttack = true;
  },

  reflectAttack(state, side, effect, ctx) {
    if (!ctx.target) return;
    const foe = other(side);
    dealDamage(state, foe, effectiveStats(state, foe, ctx.target).atk, ctx, "magicCylinder");
    ctx.negateAttack = true;
  },

  negateBattle(state, side, effect, ctx) {
    ctx.negateAttack = true;
    ctx.endBattlePhase = Boolean(effect.endBattlePhase);
    if (effect.thenEquipAtk) {
      const mine = monstersOn(state, side)[0];
      if (mine) mine.atkMod += effect.thenEquipAtk;
    }
  },

  ringOfDestruction(state, side, effect, ctx) {
    const target = ctx.target ?? monstersOn(state, other(side))[0];
    if (!target) return;
    const owner = state.sides[side].monsters.includes(target) ? side : other(side);
    const { atk } = effectiveStats(state, owner, target);
    sendToGraveyard(state, owner, target, ctx, "ringOfDestruction");
    dealDamage(state, "player", atk, ctx, "ring");
    dealDamage(state, "opponent", atk, ctx, "ring");
    ctx.negateAttack = true;
  },

  destroySummoned(state, side, effect, ctx) {
    const target = ctx.target;
    if (!target) return;
    const owner = other(side);
    if (effectiveStats(state, owner, target).atk < effect.minAtk) return;
    sendToGraveyard(state, owner, target, ctx, "trapHole");
  },

  crushVirus(state, side, effect, ctx) {
    const foe = other(side);
    state.sides[foe].virusTurns = effect.turns;
    state.sides[foe].virusThreshold = effect.threshold;
    for (const inst of monstersOn(state, foe)) {
      if (effectiveStats(state, foe, inst).atk >= effect.threshold) {
        sendToGraveyard(state, foe, inst, ctx, "crushVirus");
      }
    }
    emit(ctx, { type: "fieldShift", side, label: "Crush Card Virus" });
  },
};

export function applyEffect(state, side, effect, ctx) {
  const op = OPS[effect.op];
  if (!op) throw new Error(`Unimplemented effect op: ${effect.op}`);
  op(state, side, effect, ctx);
  return ctx;
}

export const SUPPORTED_OPS = Object.keys(OPS);
