// What an attack will actually do, before it is declared.
//
// Undo is impossible in this game, so a preview is what replaces it. Every
// number here comes from the same functions the engine uses to resolve the
// battle, so the preview cannot promise something the engine will not deliver.

import { getCard } from "./cards/index.js";
import { effectiveStats, monstersOn, other } from "./duel-state.js";

/**
 * The outcome of an attack, worked out the way resolveBattle works it out.
 * Returns null when the attack is not legal.
 */
export function previewAttack(state, side, attackerUid, targetUid = null) {
  const attacker = monstersOn(state, side).find((m) => m.uid === attackerUid);
  if (!attacker) return null;
  const foe = other(side);
  const atk = effectiveStats(state, side, attacker).atk;
  const attackerName = getCard(attacker.cardId).name;

  if (!targetUid) {
    return {
      kind: "direct", attackerName, atk,
      damage: atk, damageTo: foe,
      verdict: `${atk} damage, straight through`,
      tone: "good",
    };
  }

  const defender = monstersOn(state, foe).find((m) => m.uid === targetUid);
  if (!defender) return null;

  // A face-down target is a gamble: its defence is not known until it flips.
  if (defender.faceDown) {
    return {
      kind: "unknown", attackerName, atk, defenderName: "Face-down card",
      verdict: "Face-down — its defence is unknown until it flips",
      tone: "risky",
    };
  }

  const stats = effectiveStats(state, foe, defender);
  const inDefence = defender.position === "defense";
  const wall = inDefence ? stats.def : stats.atk;
  const defenderName = getCard(defender.cardId).name;
  const base = { kind: "clash", attackerName, atk, defenderName, wall, inDefence };

  if (atk > wall) {
    return inDefence
      ? { ...base, verdict: `${defenderName} destroyed, no damage`, tone: "good" }
      : { ...base, damage: atk - wall, damageTo: foe,
        verdict: `${defenderName} destroyed, ${atk - wall} damage`, tone: "good" };
  }
  if (atk < wall) {
    const backlash = wall - atk;
    return inDefence
      ? { ...base, damage: backlash, damageTo: side,
        verdict: `Blocked — ${backlash} damage back at you`, tone: "bad" }
      : { ...base, damage: backlash, damageTo: side, losesAttacker: true,
        verdict: `${attackerName} destroyed, ${backlash} damage back at you`, tone: "bad" };
  }
  return inDefence
    ? { ...base, verdict: "Nothing happens — equal values", tone: "neutral" }
    : { ...base, losesAttacker: true, verdict: "Both destroyed", tone: "neutral" };
}

/** True when the attack would end the duel in the attacker's favour. */
export function isLethal(state, side, preview) {
  if (!preview?.damage || preview.damageTo === side) return false;
  return state.sides[preview.damageTo].lp <= preview.damage;
}
