// `npm run coverage` — every shot kind the storyboard can emit must have either
// a clip key or a procedural fallback.
//
// Falling back silently at runtime is the design. Being silently *absent* at
// build time is not: a shot kind nobody drew is a blank beat in a duel.

import { archetypeFor } from "../src/cinema/archetypes.js";
import { PROCEDURAL_KINDS } from "../src/cinema/player.js";
import { liveLibrary } from "../src/broadcast/library.js";
import { clipKeyFor, proceduralKindFor } from "../src/broadcast/keys.js";
import { shotRequestFor } from "../src/broadcast/prompts.js";
import { clipKeys } from "../src/clip-library.mjs";

const handmadeKeys = new Set(await clipKeys(new URL("../clips", import.meta.url).pathname));

// Every kind buildStoryboard and titleShot can produce.
const SHOT_KINDS = [
  "summon", "fusion", "clash", "direct", "spell", "trap", "finish",
  "idle", "open", "reaction", "versus", "intro", "outro",
  "chain_build", "chain_resolve",
];

const sample = (kind) => ({
  kind,
  title: "Blue-Eyes White Dragon",
  event: { card: "Blue-Eyes White Dragon", attacker: "Blue-Eyes White Dragon", atk: 3000 },
  duelistId: "kaiba",
  seconds: 4,
  prompt: "a sample prompt for coverage checking",
  clipKey: ["intro", "outro", "versus"].includes(kind) ? kind : undefined,
});

const rows = SHOT_KINDS.map((kind) => {
  const archetype = archetypeFor(sample(kind));
  return {
    kind,
    clip: archetype?.key ?? null,
    procedural: PROCEDURAL_KINDS.has(kind),
  };
});

// The live grammar's keys are the other half of the coverage question: the
// storyboard's kinds cover tactical mode, these cover the reel. A key with
// nothing behind it in live mode is a blank frame, which is the one thing the
// mode promises cannot happen.
const live = liveLibrary();
const liveRows = live.keys.map((key) => ({
  key,
  tier: live.still.includes(key) ? "still" : "video",
  clip: handmadeKeys.has(clipKeyFor(key)) ? clipKeyFor(key) : null,
  procedural: Boolean(proceduralKindFor(key)),
  prompt: Boolean(shotRequestFor(key)),
}));

const orphans = [
  ...rows.filter((row) => !row.clip && !row.procedural),
  ...liveRows.filter((row) => !row.procedural || !row.prompt).map((row) => ({ kind: row.key })),
];

for (const row of rows) {
  const mark = row.clip || row.procedural ? "✓" : "✗";
  const how = [row.clip ? `clip ${row.clip}` : null, row.procedural ? "procedural" : null]
    .filter(Boolean).join(" · ") || "nothing";
  console.log(`  ${mark} ${row.kind.padEnd(15)} ${how}`);
}

const withClips = liveRows.filter((row) => row.clip).length;
console.log(`\n  live grammar — ${liveRows.length} keys `
  + `(${live.still.length} still · ${live.video.length} video), `
  + `${withClips} backed by a hand-made clip, all with a procedural floor.`);

if (orphans.length) {
  console.error(`\n${orphans.length} shot kind(s) would play as a blank beat: `
    + orphans.map((row) => row.kind).join(", "));
  console.error("Give each one a clip key in archetypes.js or a procedural draw in player.js.");
  process.exit(1);
}
console.log(`\nall ${rows.length} shot kinds and ${liveRows.length} live keys are covered.`);
