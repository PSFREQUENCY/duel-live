// Three readings of the same duel.
//
//   tactical   the board is the surface, video is a panel   (the default)
//   live       video is the surface, board on demand
//   watch      video is the surface, no input, continuous
//
// This is a real branch, not a stylesheet: each mode builds different
// components and routes input differently. Tactical stays the default and must
// keep working exactly as it did -- live mode is an alternative reading of the
// same event stream, never a replacement for it.

export const MODES = ["tactical", "live", "watch"];
export const DEFAULT_MODE = "tactical";

export const isMode = (value) => MODES.includes(value);

/** `?mode=live`, or the default. An unknown value falls back rather than throwing. */
export function resolveMode(search = globalThis.location?.search ?? "") {
  const value = new URLSearchParams(search).get("mode");
  return isMode(value) ? value : DEFAULT_MODE;
}

/** Watch mode takes no input; live and tactical both do. */
export const isInteractive = (mode) => mode !== "watch";

/** Both broadcast modes put the video on the surface. */
export const isBroadcast = (mode) => mode === "live" || mode === "watch";

/** Live mode earns a longer AI turn, because watching it is the point. */
export const turnBudgetFor = (mode) => (isBroadcast(mode) ? 6000 : 4000);
