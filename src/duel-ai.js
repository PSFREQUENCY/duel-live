// Opponent AI. Scores the legal actions the engine offers -- it never reaches
// into duel state to invent a move the rules would not allow.

import { cardOf, effectiveStats, legalActions, other } from "./duel-engine.js";
import { monstersOn } from "./duel-state.js";
import { getDuelist } from "./duelists.js";

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
    if (card.effect?.op === "destroyFoeBackrow") return state.sides[other(side)].backrow.filter(Boolean).length * 90;
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

export function chooseAction(state, side = state.activeSide, rng = Math.random) {
  const actions = legalActions(state, side);
  if (!actions.length) return null;
  const style = styleOf(state, side);
  const scored = actions.map((action) => ({
    action,
    score: (action.type === "attack" ? scoreAttack : scorePlay)(state, side, action, style)
      + rng() * 40,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0].action : null;
}

export function chooseTrapResponse(state, rng = Math.random) {
  const pending = state.pending;
  if (!pending || pending.kind !== "trapWindow") return null;
  const side = pending.side;
  const style = styleOf(state, side);
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
