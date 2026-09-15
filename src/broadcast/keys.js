// Where a grammar key gets its picture.
//
// A key is only ever as good as the thing it resolves to. The rule that keeps
// the library bounded is that a key must fully determine its prompt: anything
// the key leaves out must stay out of the prompt, or two shots sharing a key
// would need two different clips and the reuse collapses.

import { PROCEDURAL_KINDS } from "../cinema/player.js";

/** Grammar keys are dotted; clips on disk are hyphenated and case-insensitive. */
export const clipKeyFor = (key) => String(key).toLowerCase().replace(/\./g, "-");

// The canvas can draw these unaided, so a key in this map always has a picture
// even with no clips, no key and no network.
const PROCEDURAL = {
  summon: "summon", fusion: "fusion", clash: "clash", direct: "direct",
  trap: "trap", spell: "spell", finish: "finish", reveal: "spell",
  impact: "clash", tribute: "summon", react: "reaction", idle: "idle",
  arena: "idle", phase: "chain_build",
};

/** The procedural shot kind that backs a key, or null if nothing can draw it. */
export function proceduralKindFor(key) {
  const kind = PROCEDURAL[String(key).split(".")[0]];
  return kind && PROCEDURAL_KINDS.has(kind) ? kind : null;
}

/** Everything a key needs to be rendered at whatever tier is available. */
export function resolveShotKey(key) {
  return {
    key,
    clipKey: clipKeyFor(key),
    procedural: proceduralKindFor(key),
  };
}

// The keys two real decks can actually reach. The grammar's full expansion is
// the theoretical maximum -- six attributes times seven families -- but a deck
// list is much narrower than that, and generating the difference would be
// paying for clips no duel can ever play.
export function reachableKeys(decks, { duelists }) {
  const keys = new Set([
    "reveal.monster", "reveal.facedown", "reveal.spell", "reveal.trap",
    "tribute.wide", "impact.light", "impact.heavy", "trap", "spell", "finish",
    "phase.battle", "phase.end", "arena.wide", "arena.low", "arena.overhead",
  ]);
  for (const id of duelists) {
    keys.add(`idle.${id}`);
    for (const register of ["steady", "pressed", "broken"]) keys.add(`react.${id}.${register}`);
  }
  for (const { attribute, family } of decks) {
    keys.add(`summon.${attribute}.${family}`);
    keys.add(`fusion.${family}`);
    keys.add(`clash.${family}`);
    keys.add(`direct.${family}`);
  }
  return [...keys].sort();
}

/** Split a key set by the tier its subject is filmed at (§5). */
export function splitByTier(keys) {
  const still = keys.filter((key) => /^(react|idle|arena|phase)\./.test(key));
  return { still, video: keys.filter((key) => !still.includes(key)) };
}
