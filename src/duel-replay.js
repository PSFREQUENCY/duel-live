// Replay.
//
// The engine is deterministic from a seed and every decision passes through one
// of a handful of entry points, so a duel is fully described by its seed and the
// list of choices made. That fits in a URL fragment.

import {
  applyAction, createDuel, endTurn, respondToChain, respondToDiscard,
  respondToTarget, respondToTribute, setPhase,
} from "./duel-engine.js";

export const REPLAY_VERSION = 1;

// Short keys keep the fragment small; a replay is meant to fit in a link.
const KINDS = { a: "action", p: "phase", t: "turn", c: "chain", g: "target", r: "tribute", d: "discard" };
const SHORT = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [v, k]));

// An action carries a human label for the interface; a replay does not need it.
// Keeping it made a duel five kilobytes instead of a few hundred bytes.
function slim(kind, payload) {
  if (kind !== "action" || !payload) return payload ?? null;
  const { type, uid, targetUid, targets, set, position } = payload;
  const out = { type };
  if (uid !== undefined) out.uid = uid;
  if (targetUid !== undefined) out.targetUid = targetUid;
  if (targets !== undefined) out.targets = targets;
  if (set) out.set = true;
  if (position !== undefined) out.position = position;
  return out;
}

export const record = (kind, payload) => ({ k: SHORT[kind] ?? kind, v: slim(kind, payload) });

// On the wire a step is a pair, not an object with two named fields. Over a few
// hundred steps the key names alone were a fifth of the payload.
const pack = (step) => (step.v === null || step.v === undefined ? [step.k] : [step.k, step.v]);
const unpack = ([k, v]) => ({ k, v: v ?? null });

/** Apply one recorded step. Returns the new state and its events. */
export function applyStep(state, step) {
  const kind = KINDS[step.k] ?? step.k;
  switch (kind) {
    case "action": return applyAction(state, step.v);
    case "phase": return setPhase(state, step.v);
    case "turn": return endTurn(state);
    case "chain": return respondToChain(state, step.v);
    case "target": return respondToTarget(state, step.v?.uids ?? step.v, { position: step.v?.position });
    case "tribute": return respondToTribute(state, step.v);
    case "discard": return respondToDiscard(state, step.v);
    default: return { state, events: [] };
  }
}

/** Replay a recording from its seed. Returns the final state and every event. */
export function replay({ seed, matchup, steps }) {
  let state = createDuel(matchup, { seed });
  const events = [];
  for (const step of steps) {
    const result = applyStep(state, step);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

/** Where each turn begins in the event list, so a scrubber has something to scrub. */
export function turnMarkers(events) {
  const marks = [];
  events.forEach((event, index) => {
    if (event.type === "phase" && event.phase === "draw") {
      marks.push({ turn: event.turn, at: index, side: event.side });
    }
  });
  return marks;
}

// ------------------------------------------------------------- encoding ---

const toBase64 = (text) => (typeof btoa === "function"
  ? btoa(unescape(encodeURIComponent(text)))
  : Buffer.from(text, "utf8").toString("base64"));

const fromBase64 = (text) => (typeof atob === "function"
  ? decodeURIComponent(escape(atob(text)))
  : Buffer.from(text, "base64").toString("utf8"));

const urlSafe = (b64) => b64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const unUrlSafe = (text) => text.replaceAll("-", "+").replaceAll("_", "/");

export function encodeReplay({ seed, matchup, steps }) {
  return urlSafe(toBase64(JSON.stringify({
    v: REPLAY_VERSION, s: seed, m: matchup, x: steps.map(pack),
  })));
}

/** Decode a replay, or null when the text is not one. */
export function decodeReplay(encoded) {
  try {
    const body = JSON.parse(fromBase64(unUrlSafe(String(encoded))));
    if (body.v !== REPLAY_VERSION || !body.m || !Array.isArray(body.x)) return null;
    return { seed: body.s, matchup: body.m, steps: body.x.map(unpack) };
  } catch {
    return null;
  }
}

export const replayLink = (recording, base = "") =>
  `${base}?duel=${encodeReplay(recording)}`;
