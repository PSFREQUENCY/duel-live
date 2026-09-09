// Opponent AI. Scores the legal actions the engine offers -- it never reaches
// into duel state to invent a move the rules would not allow.

import {
  applyAction, cardOf, defaultTributes, effectiveStats, gravityBindLevel,
  legalActions, other,
} from "./duel-engine.js";
import { monstersOn } from "./duel-state.js";
import { getDuelist } from "./duelists.js";
import { CARDS } from "./cards/index.js";
import { autoTargets, targetSpecFor } from "./duel-targets.js";
import { legalResponses } from "./duel-chain.js";
import { evaluate, lookahead } from "./duel-eval.js";

const CARDS_BY_NAME = Object.fromEntries(Object.values(CARDS).map((c) => [c.name, c]));

const TEMPERAMENT = {
  aggro:  { trade: 1.4, board: 0.9, hold: 0.4, trapBias: 0.55 },
  control:{ trade: 0.9, board: 1.2, hold: 1.0, trapBias: 0.85 },
  swingy: { trade: 1.2, board: 1.0, hold: 0.6, trapBias: 0.75 },
  tempo:  { trade: 1.1, board: 1.1, hold: 0.7, trapBias: 0.7 },
};

const styleOf = (state, side) => TEMPERAMENT[getDuelist(state.sides[side].duelistId).strategy] ?? TEMPERAMENT.tempo;

function scoreAttack(state, side, action, style) {
  const foe = other(side);
  const attacker = monstersOn(state, side).find((m) => m.uid === action.uid);
  const atk = effectiveStats(state, side, attacker).atk;
  if (!action.targetUid) return 900 + atk / 10;
  const defender = monstersOn(state, foe).find((m) => m.uid === action.targetUid);
  const wall = defender.faceDown
    ? 1500
    : effectiveStats(state, foe, defender)[defender.position === "attack" ? "atk" : "def"];
  if (atk > wall) return 600 + (defender.position === "attack" ? (atk - wall) * style.trade : 120);
  if (atk === wall) return defender.position === "attack" ? 200 : -50;
  return -400 - (wall - atk);
}

function scorePlay(state, side, action, style) {
  const s = state.sides[side];
  const inst = [...s.hand, ...monstersOn(state, side)].find((c) => c.uid === action.uid);
  const card = inst ? cardOf(inst) : null;
  if (!card) return 0;
  const ace = getDuelist(s.duelistId).ace;

  if (action.type === "summon") {
    const board = monstersOn(state, side).length;
    const bias = card.id === ace ? 400 : 0;
    return 300 + card.atk / 6 + bias + board * style.board * 10;
  }
  if (action.type === "set") return 180 + card.def / 8;
  if (action.type === "activate") {
    if (card.effect?.op === "fusionSummon") return 700;
    if (card.effect?.op === "summonFromDeck" || card.effect?.op === "summonFromHand") return 640;
    if (card.effect?.op === "revive") return 520;
    if (card.effect?.op === "destroyAllMonsters") {
      const mine = monstersOn(state, side).length;
      const theirs = monstersOn(state, other(side)).length;
      return theirs > mine ? 480 : -100;
    }
    if (card.effect?.op === "destroyFoeBackrow" || card.effect?.op === "bounceAllBackrow") {
      const foeBackrow = state.sides[other(side)].backrow.filter(Boolean);
      // A face-up lock is the thing most worth spending removal on: sitting
      // under Gravity Bind is how a duel grinds to a halt.
      const locked = gravityBindLevel(state) > 0;
      return foeBackrow.length * 90 + (locked ? 900 : 0);
    }
    if (card.sub === "equip") return 260;
    return 210;
  }
  if (action.type === "setBackrow") return 150 * style.trapBias + (card.kind === "trap" ? 60 : 0);
  if (action.type === "position") {
    const stats = effectiveStats(state, side, inst);
    return stats.def > stats.atk && inst.position === "attack" ? 120 : -60;
  }
  return 0;
}

/**
 * Pick a move.
 *
 * The heuristic scorer proposes; a one-ply lookahead over the top few then
 * checks what each invites in reply. That is what stops the opponent walking a
 * monster into a counter-attack it could already see.
 */
export function chooseAction(state, side = state.activeSide, rng = Math.random, {
  depth = 1, branch = 5,
} = {}) {
  const actions = legalActions(state, side);
  if (!actions.length) return null;
  const style = styleOf(state, side);

  const scored = actions.map((action) => ({
    action,
    score: (action.type === "attack" ? scoreAttack : scorePlay)(state, side, action, style)
      + rng() * 40,
  })).sort((a, b) => b.score - a.score);

  if (depth <= 0) return scored[0].score > 0 ? scored[0].action : null;

  // Only the shortlist is searched; the rest were not going to be played anyway.
  const shortlist = scored.filter((entry) => entry.score > 0).slice(0, branch);
  if (!shortlist.length) return null;
  if (shortlist.length === 1) return shortlist[0].action;

  const base = evaluate(state, side);
  let best = null;
  for (const entry of shortlist) {
    const after = lookahead(state, side, entry.action, applyAction);
    if (after === null) continue;
    // Blend: the heuristic knows about card intent, the search about consequences.
    const merged = (after - base) * 10 + entry.score * 0.15;
    if (!best || merged > best.merged) best = { merged, action: entry.action };
  }
  return best?.action ?? shortlist[0].action;
}

/** The AI points an effect where the engine would by default. */
export function chooseTargets(state) {
  const pending = state.pending;
  if (!pending || pending.kind !== "target") return null;
  const card = CARDS_BY_NAME[pending.card];
  const spec = card ? targetSpecFor(card) : null;
  return spec ? autoTargets(state, pending.side, spec, card) : [];
}

/** The AI spends tributes the same way the engine would by default. */
export function chooseTributes(state) {
  const pending = state.pending;
  if (!pending || pending.kind !== "tribute") return null;
  return defaultTributes(state, pending.side, pending.need);
}

/**
 * Answer an open chain. Reads the same legality list the interface does, so the
 * opponent can never play something a player could not.
 */
export function chooseChainResponse(state, rng = Math.random) {
  const chain = state.chain;
  if (!chain) return null;
  const side = chain.respondingSide;
  const options = legalResponses(state, side);
  if (!options.length) return null;
  const style = styleOf(state, side);

  const threat = chainThreat(state, chain, side);
  // Answering a chain costs a card; only do it when there is something to answer.
  if (threat < 500 && rng() > style.trapBias / 2) return null;

  const ranked = options
    .map((option) => ({ option, score: responseValue(state, side, option, chain, threat) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.option.uid ?? null;
}

// How much damage the thing being answered would do if it went through.
function chainThreat(state, chain, side) {
  const trigger = chain.trigger;
  if (!trigger) return 0;
  if (trigger.kind === "attack") {
    const attacker = monstersOn(state, trigger.attackerSide)
      .find((m) => m.uid === trigger.attackerUid);
    if (!attacker) return 0;
    const incoming = effectiveStats(state, trigger.attackerSide, attacker).atk;
    const defender = monstersOn(state, side).find((m) => m.uid === trigger.defenderUid);
    return defender
      ? Math.max(0, incoming - effectiveStats(state, side, defender)[
        defender.position === "attack" ? "atk" : "def"])
      : incoming;
  }
  if (trigger.kind === "summon") {
    const summoned = monstersOn(state, trigger.summonedSide)
      .find((m) => m.uid === trigger.summonedUid);
    return summoned ? effectiveStats(state, trigger.summonedSide, summoned).atk : 0;
  }
  return 0;
}

function responseValue(state, side, option, chain, threat) {
  const card = CARDS_BY_NAME[option.name];
  const effect = card?.effect ?? {};
  // Never flip a card that cannot do anything to what it is answering.
  if (effect.op === "destroySummoned") {
    const trigger = chain.trigger;
    if (trigger?.kind !== "summon" || threat < (effect.minAtk ?? 0)) return 0;
  }
  if (effect.op === "crushVirus" && !crushVirusFodder(state, side).length) return 0;
  if (effect.op === "destroyFoeBackrow" && !state.sides[other(side)].backrow.some(Boolean)) return 0;
  // A higher Spell Speed answers more, so it is worth more on a live chain.
  return trapValue(card, threat) + (chain.links.length ? option.spellSpeed * 40 : 0);
}

export function chooseTrapResponse(state, rng = Math.random) {
  const pending = state.pending;
  if (!pending || pending.kind !== "trapWindow") return null;
  const side = pending.side;
  const style = styleOf(state, side);

  // A summon window has no attacker; the threat is what just arrived.
  if (pending.trigger === "onSummon") return chooseSummonResponse(state, pending, style, rng);

  const attacker = monstersOn(state, other(side)).find((m) => m.uid === pending.resume.attackerUid);
  if (!attacker) return null;
  const incoming = effectiveStats(state, other(side), attacker).atk;
  const defender = monstersOn(state, side).find((m) => m.uid === pending.resume.defenderUid);
  const threat = defender
    ? Math.max(0, incoming - effectiveStats(state, side, defender)[defender.position === "attack" ? "atk" : "def"])
    : incoming;
  if (threat < 500 && rng() > style.trapBias / 2) return null;
  const ranked = pending.options
    .map((uid) => state.sides[side].backrow.find((c) => c && c.uid === uid))
    .filter(Boolean)
    .sort((a, b) => trapValue(cardOf(b), threat) - trapValue(cardOf(a), threat));
  return ranked[0]?.uid ?? null;
}

// Spend a summon-triggered trap on a monster worth answering, not on a token.
function chooseSummonResponse(state, pending, style, rng) {
  const { summonedSide, summonedUid } = pending.resume;
  const summoned = monstersOn(state, summonedSide).find((m) => m.uid === summonedUid);
  if (!summoned) return null;
  const threat = effectiveStats(state, summonedSide, summoned).atk;
  if (threat < 1500 && rng() > style.trapBias / 2) return null;

  const usable = pending.options
    .map((uid) => state.sides[pending.side].backrow.find((c) => c && c.uid === uid))
    .filter(Boolean)
    .filter((inst) => canPaySummonTrap(state, pending.side, cardOf(inst), summoned, threat));
  return usable.sort((a, b) => trapValue(cardOf(b), threat) - trapValue(cardOf(a), threat))[0]?.uid ?? null;
}

// Do not flip a trap that cannot do anything to what was just summoned.
function canPaySummonTrap(state, side, card, summoned, threat) {
  const effect = card.effect ?? {};
  if (effect.op === "destroySummoned") return threat >= (effect.minAtk ?? 0);
  if (effect.op === "crushVirus") return crushVirusFodder(state, side).length > 0;
  if (effect.op === "destroyFoeBackrow") return state.sides[other(side)].backrow.some(Boolean);
  return true;
}

/** Crush Card Virus is paid by tributing a DARK monster with 1000 or less ATK. */
export function crushVirusFodder(state, side) {
  return monstersOn(state, side).filter((inst) => {
    const card = cardOf(inst);
    return card.attribute === "DARK" && effectiveStats(state, side, inst).atk <= 1000;
  });
}

function trapValue(card, threat) {
  const op = card.effect?.op;
  if (op === "destroyAttackers") return 1000;
  if (op === "reflectAttack") return 900 + threat / 10;
  if (op === "ringOfDestruction") return 700;
  if (op === "negateBattle") return 500;
  if (op === "modifyAtk" || op === "bindMonster") return 450;
  if (op === "diceBuff") return 300;
  return 200;
}
