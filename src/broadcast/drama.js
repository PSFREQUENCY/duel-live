// How much this moment is worth, 0..1.
//
// Everything here is a number the engine already emits. The point of scoring at
// all is variance: an episode is not evenly paced, and a reel that gives a
// turn-three normal summon the same three shots and the same hold as a lethal
// fusion attack is a slideshow no matter how good the clips are.

const clamp01 = (n) => Math.max(0, Math.min(1, n));

const STARTING_LP = 8000;

// Who just took the hit. `damage` events name the side that lost the points;
// an attack names the side that threw it, so the target is the other one.
function struck(event, state) {
  const side = event.type === "damage" ? event.side
    : event.side === "player" ? "opponent" : "player";
  return state?.sides?.[side] ?? null;
}

export function dramaFor(event, state) {
  // The end of a duel is the top of the scale by definition.
  if (event.type === "win") return 1;

  const damage = event.damage ?? event.amount ?? 0;
  const target = struck(event, state);
  // The state is read after the event resolved, so these are the numbers the
  // viewer is about to see rather than the ones they just left behind.
  const lpFraction = target ? target.lp / (state?.startingLp ?? STARTING_LP) : 1;
  // Lethal has to be caused by this event. Reading it off state.winner scores
  // every event in a finished duel as lethal, which flattens the whole curve.
  const lethal = damage > 0 && target !== null && target.lp <= 0;
  const marquee = event.how === "fusion" || (event.type === "activate" && event.reveal === true);

  return clamp01(
    0.15
    + 0.35 * clamp01(damage / 4000)
    + 0.25 * (lethal ? 1 : 0)
    + 0.15 * (lpFraction < 0.25 ? 1 : 0)
    + 0.10 * (marquee ? 1 : 0),
  );
}

/** 1..4 shots. A routine beat gets one; the duel's biggest moment gets four. */
export const shotBudget = (drama) => 1 + Math.round(clamp01(drama) * 3);

/** 0.8x..1.7x. Holds stretch with the moment, which is most of the pacing. */
export const holdMultiplier = (drama) => 0.8 + clamp01(drama) * 0.9;
