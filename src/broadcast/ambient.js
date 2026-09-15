// The ambient lane: what is on screen when the duel is waiting for someone.
//
// This is the part with no analogue in tactical mode, and it decides whether
// waiting feels authored or feels broken. A blank stage while a player thinks
// reads as a bug; the same silence with the opponent slowly looking more bored
// reads as a scene. The ladder below is that difference, and it costs one still
// per duelist.

const LADDER = [
  { at: 0, level: 0 },
  { at: 6_000, level: 1 },
  { at: 14_000, level: 2 },
  { at: 25_000, level: 3 },
];

/** How long a decision has been open, as a rung. Pressure only ever builds. */
export function pressureFor(elapsedMs) {
  let level = 0;
  for (const rung of LADDER) if (elapsedMs >= rung.at) level = rung.level;
  return level;
}

const ARENAS = ["arena.wide", "arena.low", "arena.overhead"];

/**
 * A shot for the current rung. `avoid` is the key already on screen: the same
 * plate twice running reads as a freeze rather than a hold, so every rung has
 * somewhere else to go.
 */
export function ambientShot(level, { you, opponent, avoid, arenaIndex = 0 } = {}) {
  const rung = [
    () => [`idle.${you}`, `arena.wide`],
    () => [`react.${opponent}.steady`, `idle.${you}`],
    () => [ARENAS[arenaIndex % ARENAS.length], ARENAS[(arenaIndex + 1) % ARENAS.length]],
    () => [`react.${opponent}.pressed`, `react.${opponent}.steady`],
  ][Math.max(0, Math.min(3, level))];

  const [first, second] = rung();
  const key = first === avoid ? second : first;
  return { key, hold: level === 0 ? 5_000 : 4_000, tier: "still", tailMotion: true, ambient: true };
}

/**
 * Tracks one decision window. Pressure never steps down inside a window --
 * an opponent who looks impatient and then patient again reads as random.
 * It resets when somebody acts.
 */
export function createAmbient({ you, opponent, onTurn = "player" }) {
  let openedAt = 0;
  let floor = 0;
  let arenaIndex = 0;
  let turn = onTurn;

  return {
    /** Somebody acted: the window closes and pressure goes back to nothing. */
    reset(t = 0, side = turn) {
      openedAt = t;
      floor = 0;
      turn = side;
      arenaIndex += 1;
    },
    pressureAt(t) {
      floor = Math.max(floor, pressureFor(t - openedAt));
      return floor;
    },
    // During the opponent's turn the camera stays on whoever has agency. Rung 0
    // is your own resting hands, which is the wrong subject while they are the
    // one deciding, so their turn starts the ladder at rung 1.
    select(level, { avoid } = {}) {
      const waitingOnMe = turn === "player";
      return ambientShot(waitingOnMe ? level : Math.max(1, level),
        { you, opponent, avoid, arenaIndex });
    },
    get openedAt() { return openedAt; },
  };
}
