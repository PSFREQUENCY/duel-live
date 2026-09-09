// The continuing effects in play right now, as something a player can read.
//
// Derived from engine state rather than tracked separately, so a counter can
// never disagree with the rule it is counting.

import { DUELISTS } from "./duelists.js";

/**
 * Everything currently constraining play, from the point of view of `viewer`.
 * `turnsLeft` is null for effects that last until something removes them.
 */
export function activeEffects(state, viewer = "player") {
  const out = [];
  const nameOf = (side) => DUELISTS[state.sides[side].duelistId].name;

  for (const side of ["player", "opponent"]) {
    const s = state.sides[side];

    if (s.lockAttacksTurns > 0) {
      out.push({
        id: `swords-${side}`,
        label: "Swords of Revealing Light",
        // The counter lives on whoever is locked; the card belongs to the other.
        detail: `${nameOf(side)} cannot attack`,
        turnsLeft: s.lockAttacksTurns,
        against: side === viewer,
      });
    }
    if (s.virusTurns > 0) {
      out.push({
        id: `virus-${side}`,
        label: "Crush Card Virus",
        detail: `${nameOf(side)} loses monsters with ${s.virusThreshold}+ ATK`,
        turnsLeft: s.virusTurns,
        against: side === viewer,
      });
    }
    if (s.hats) {
      out.push({
        id: `hats-${side}`,
        label: "Magical Hats",
        detail: `Next attack on ${nameOf(side)} has a 1 in ${s.hats.odds} chance to connect`,
        turnsLeft: null,
        against: side !== viewer,
      });
    }
  }

  if (state.gravityBindLevel) {
    out.push({
      id: "gravity-bind",
      label: "Gravity Bind",
      detail: `Level ${state.gravityBindLevel}+ monsters cannot attack`,
      turnsLeft: null,
      against: true,
    });
  }

  for (const side of ["player", "opponent"]) {
    for (const inst of state.sides[side].monsters) {
      if (inst?.bound) {
        out.push({
          id: `bound-${inst.uid}`,
          label: "Spellbinding Circle",
          detail: `A monster ${nameOf(side)} controls cannot attack`,
          turnsLeft: null,
          against: side === viewer,
        });
      }
    }
  }
  return out;
}

/** A short badge for the board, or null when nothing is in play. */
export function effectSummary(state, viewer = "player") {
  const effects = activeEffects(state, viewer);
  if (!effects.length) return null;
  const counted = effects.filter((e) => e.turnsLeft !== null);
  const soonest = counted.length ? Math.min(...counted.map((e) => e.turnsLeft)) : null;
  return { count: effects.length, soonest, effects };
}
