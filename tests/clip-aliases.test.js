// The join between how the grammar names shots and how the clips were filed.
//
// These were two naming schemes for the same footage, and nothing matched: all
// 64 keys fell through to the procedural canvas while 21 real clips sat unused.

import assert from "node:assert/strict";
import { test } from "node:test";

import { clipCandidates, resolveClipKey } from "../src/broadcast/clip-aliases.js";
import { liveLibrary } from "../src/broadcast/library.js";
import { clipKeys, clipWordSet, normaliseClipKey } from "../src/clip-library.mjs";

const files = await clipKeys(new URL("../clips", import.meta.url).pathname);
const exact = new Set(files.map(normaliseClipKey));
const words = new Set(files.map(clipWordSet));
const onDisk = (key) => exact.has(normaliseClipKey(key)) || words.has(clipWordSet(key));

test("a key's own name is always tried first", () => {
  // So a clip generated for the key exactly is used the moment it exists,
  // without touching the alias table.
  assert.equal(clipCandidates("summon.DARK.dragon", { actor: "kaiba" })[0], "summon-dark-dragon");
  assert.equal(clipCandidates("trap", { actor: "yugi" })[0], "trap");
});

test("the acting duelist picks which performance is used", () => {
  assert.deepEqual(clipCandidates("summon.LIGHT.dragon", { actor: "kaiba" }),
    ["summon-light-dragon", "play-kaiba-summon"]);
  assert.deepEqual(clipCandidates("spell", { actor: "mai" }), ["spell", "play-mai-activate"]);
});

test("without an actor a key still resolves to its own name", () => {
  // The key scheme deliberately omits who is acting; missing it must degrade,
  // not throw.
  assert.deepEqual(clipCandidates("summon.DARK.dragon"), ["summon-dark-dragon"]);
  assert.equal(resolveClipKey("summon.DARK.dragon"), "summon-dark-dragon");
});

test("almost every live key finds real footage on disk", () => {
  const { keys } = liveLibrary();
  const unmatched = keys.filter((key) => !["yugi", "kaiba", "joey", "mai"]
    .some((actor) => onDisk(resolveClipKey(key, { actor, hasClip: onDisk }))));

  // Phase stingers have no stand-in worth using; they play as tier-1 plates.
  assert.deepEqual(unmatched.sort(), ["phase.battle", "phase.end"]);
  assert.ok(keys.length - unmatched.length >= 60,
    `only ${keys.length - unmatched.length} of ${keys.length} keys reach a clip`);
});

test("the chosen clip is one that actually exists", () => {
  for (const key of liveLibrary().keys) {
    const chosen = resolveClipKey(key, { actor: "kaiba", hasClip: onDisk });
    if (!onDisk(chosen)) {
      assert.match(key, /^phase\./, `${key} resolved to ${chosen}, which is not on disk`);
    }
  }
});

test("word-order differences still match, the way the server matches them", () => {
  // `play summon yugi.mp4` on disk, `play-yugi-summon` from the alias table.
  assert.equal(onDisk("play-yugi-summon"), true,
    "client and server must agree about what counts as having a clip");
  assert.equal(resolveClipKey("summon.DARK.spellcaster", { actor: "yugi", hasClip: onDisk }),
    "play-yugi-summon");
});

test("damage of every kind shares one impact clip", () => {
  for (const key of ["direct.dragon", "impact.heavy", "impact.light", "clash.warrior"]) {
    assert.equal(resolveClipKey(key, { actor: "yugi", hasClip: onDisk }), "lp-damage");
  }
});

test("a reaction falls back to the duelist's own plate, never to nothing", () => {
  for (const who of ["yugi", "kaiba", "joey", "mai"]) {
    for (const register of ["steady", "pressed", "broken"]) {
      const chosen = resolveClipKey(`react.${who}.${register}`, { actor: who, hasClip: onDisk });
      assert.ok(onDisk(chosen), `react.${who}.${register} → ${chosen} is not on disk`);
      assert.match(chosen, new RegExp(who), "a reaction must be of the right person");
    }
  }
});
