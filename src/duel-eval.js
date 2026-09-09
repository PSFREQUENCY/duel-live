// Static evaluation, and a one-ply search over it.
//
// The opponent used to score its own legal actions with no idea what happened
// next, which is why it would attack into an obvious trap. Applying an action
// and looking at the reply it invites is enough to stop that, without a search
// tree.

import { cardOf, effectiveStats, legalActions, other } from "./duel-engine.js";
import { monstersOn, resetUidCounter, uidCounterValue } from "./duel-state.js";
import { getDuelist } from "./duelists.js";

/**
 * Temperament as weights on the terms, not as a script. An aggressive duelist
 * values the life point race and discounts card advantage; a control duelist
 * does the opposite. The search then does the work and the personality survives.
 */
export const WEIGHTS = {
  aggro:   { life: 1.5, board: 1.0, cards: 0.4, set: 0.2 },
  control: { life: 0.7, board: 1.1, cards: 1.3, set: 0.9 },
  swingy:  { life: 1.2, board: 1.0, cards: 0.7, set: 0.6 },
  tempo:   { life: 1.0, board: 1.2, cards: 0.9, set: 0.7 },
};

export const weightsFor = (state, side) =>
  WEIGHTS[getDuelist(state.sides[side].duelistId)?.strategy] ?? WEIGHTS.tempo;

const boardPresence = (state, side) =>
  monstersOn(state, side).reduce((sum, inst) => {
    const stats = effectiveStats(state, side, inst);
    // A monster in defence is worth its wall, not its sword.
    return sum + (inst.position === "attack" ? stats.atk : stats.def * 0.8);
  }, 0);

/** How good this position is for `side`, in arbitrary but consistent units. */
export function evaluate(state, side, weights = weightsFor(state, side)) {
  const foe = other(side);
  if (state.winner === side) return 1e6;
  if (state.winner === foe) return -1e6;

  const life = (state.sides[side].lp - state.sides[foe].lp) / 100;
  const board = (boardPresence(state, side) - boardPresence(state, foe)) / 100;
  const cards = (state.sides[side].hand.length + monstersOn(state, side).length)
    - (state.sides[foe].hand.length + monstersOn(state, foe).length);
  // A face-down card is worth something even when it is a bluff.
  const set = state.sides[side].backrow.filter(Boolean).length
    - state.sides[foe].backrow.filter(Boolean).length;

  return life * weights.life + board * weights.board + cards * weights.cards + set * weights.set;
}

/**
 * Apply an action, let the opponent take their single best reply, and evaluate
 * what is left. Deliberately one ply: enough to see a lethal counter-attack,
 * cheap enough to run inside a turn.
 */
export function lookahead(state, side, action, apply, { replies = 6 } = {}) {
  // Searching must leave no trace. Effects that create cards -- Scapegoat's
  // tokens -- draw ids from a shared counter, and a hypothetical branch that
  // burned ids made the real duel unreproducible from its seed.
  const uidMark = uidCounterValue();
  try {
    return search(state, side, action, apply, replies);
  } finally {
    resetUidCounter(uidMark);
  }
}

function search(state, side, action, apply, replies) {
  let after;
  try {
    after = apply(state, action).state;
  } catch {
    return null;   // an action the engine refuses is worth nothing
  }
  // A pending choice is not a position to evaluate; take the action at face value.
  if (after.pending) return evaluate(after, side);

  const foe = other(side);
  const foeWeights = weightsFor(after, foe);
  const foeActions = legalActions(after, foe).slice(0, replies);
  if (!foeActions.length) return evaluate(after, side);

  let worst = Infinity;
  for (const reply of foeActions) {
    let replied;
    try {
      replied = apply(after, reply).state;
    } catch {
      continue;
    }
    // Score from our side, assuming they take whatever is best for them.
    const theirGain = evaluate(replied, foe, foeWeights);
    const ourScore = evaluate(replied, side) - theirGain * 0.15;
    if (ourScore < worst) worst = ourScore;
  }
  return worst === Infinity ? evaluate(after, side) : worst;
}
