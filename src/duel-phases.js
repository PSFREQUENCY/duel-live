// The phase machine.
//
// Modelled as an explicit transition table rather than conditionals scattered
// through the engine, so the legal shape of a turn is one readable thing that
// tests can assert against.

export const PHASES = ["draw", "standby", "main1", "battle", "main2", "end"];

export const PHASE_LABELS = {
  draw: "Draw", standby: "Standby", main1: "Main 1",
  battle: "Battle", main2: "Main 2", end: "End",
};

/**
 * Legal moves out of each phase.
 *
 * There is deliberately no `main1 → main2` edge. Skipping the Battle Phase
 * forfeits the second Main Phase, which is what makes "attack now or set up
 * first" a real decision rather than a free choice.
 */
export const TRANSITIONS = {
  draw: [{ to: "standby", auto: true }],
  standby: [{ to: "main1", auto: true }],
  main1: [
    { to: "battle", when: "canEnterBattlePhase" },
    { to: "end", label: "Skip battle and end the turn" },
  ],
  battle: [{ to: "main2" }],
  main2: [{ to: "end" }],
  end: [{ to: "draw", endsTurn: true }],
};

/**
 * The player who goes first conducts no Battle Phase on the opening turn.
 */
export function canEnterBattlePhase(state) {
  return state.turn > 1;
}

const GUARDS = { canEnterBattlePhase };

/** Where a duel can legally go from here, with the reason when it cannot. */
export function nextPhases(state) {
  return (TRANSITIONS[state.phase] ?? []).map((edge) => ({
    ...edge,
    allowed: edge.when ? GUARDS[edge.when](state) : true,
  }));
}

export function canTransition(state, to) {
  return nextPhases(state).some((edge) => edge.to === to && edge.allowed);
}

/** The phase a duel moves to on its own, or null when the player must choose. */
export function autoAdvance(state) {
  const auto = (TRANSITIONS[state.phase] ?? []).find((edge) => edge.auto);
  return auto?.to ?? null;
}

/** Main 2 is reachable only through the Battle Phase. */
export const isReachable = (from, to) =>
  (TRANSITIONS[from] ?? []).some((edge) => edge.to === to);
