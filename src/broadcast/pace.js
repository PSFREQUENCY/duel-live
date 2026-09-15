// How fast the show runs.
//
// The first live build ran the engine at full speed and let the reel narrate
// from behind, on the theory that play must never wait on the cinema. That is
// right for a stall and wrong for a duel: with nothing to wait for, a whole
// opponent turn resolved between two frames and watch mode finished before the
// edit had started. The engine may run ahead of the picture, but not without
// limit, and how far is a viewer's choice rather than a constant.

// `hold` is what a viewer actually feels: the tempo the edit is cut at.
//
// `beat` and `settleCap` only gate the engine, and only where nobody is waiting
// on a control — watch mode, and the tail of an opponent's turn. They are
// deliberately small. An early version let a slow pace hold the engine for nine
// seconds an action, which meant the player's own controls were dead for most
// of the opponent's turn; that is indistinguishable from a freeze, and it is
// what "the live action stalls" turned out to be.
export const PACES = {
  slow: { label: "Slow", hold: 1.5, backlog: 1, settleCap: 4000, beat: 1100, turnBudget: 6000 },
  steady: { label: "Steady", hold: 1.1, backlog: 2, settleCap: 2200, beat: 600, turnBudget: 6000 },
  // Closest to tactical: the engine leads and the edit keeps up as it can.
  fast: { label: "Fast", hold: 0.85, backlog: 4, settleCap: 900, beat: 200, turnBudget: 5000 },
};

// However slow the viewer wants the show, their own controls come back within
// this. Pacing is a property of the edit, never a reason to stop taking input.
export const INPUT_CAP_MS = 1200;

export const DEFAULT_PACE = "slow";

export const isPace = (value) => Object.hasOwn(PACES, value);

export const paceFor = (name) => PACES[isPace(name) ? name : DEFAULT_PACE];
