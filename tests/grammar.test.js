// Coverage over the expanded key set. A key with nothing behind it is a blank
// frame, which is the one thing live mode promises cannot happen.

import assert from "node:assert/strict";
import { test } from "node:test";

import { ATTRIBUTES, FAMILIES } from "../src/broadcast/director.js";
import { GRAMMAR, expandGrammar, resolveKey } from "../src/broadcast/shot-grammar.js";
import { clipKeyFor, proceduralKindFor } from "../src/broadcast/keys.js";
import { clipWordSet } from "../src/clip-library.mjs";
import { DUELISTS } from "../src/duelists.js";

const DUELIST_IDS = Object.keys(DUELISTS);
const ALL = expandGrammar({
  duelists: DUELIST_IDS, attributes: ATTRIBUTES, families: FAMILIES,
});

test("every key the grammar can produce has something to draw it", () => {
  const orphans = ALL.filter((key) => !proceduralKindFor(key));
  assert.deepEqual(orphans, [], `nothing can render: ${orphans.join(", ")}`);
});

test("no two grammar keys share a normalised word set", () => {
  // Extends the existing clip-collision rule to the expanded set. `reveal.trap`
  // and `trap` are the pair worth checking: same vocabulary, different shots.
  const byWords = new Map();
  for (const key of ALL) {
    const words = clipWordSet(clipKeyFor(key));
    const clash = byWords.get(words);
    assert.equal(clash, undefined, `${key} and ${clash} would resolve to the same clip`);
    byWords.set(words, key);
  }
  assert.notEqual(clipWordSet("reveal-trap"), clipWordSet("trap"));
});

test("grammar keys survive the trip to a clip filename and back", () => {
  for (const key of ALL) {
    const clip = clipKeyFor(key);
    assert.doesNotMatch(clip, /[.{}\s_]/, `${key} → ${clip} is not a filename`);
    assert.equal(clip, clip.toLowerCase());
  }
});

test("the library stays bounded — the whole grammar is a few dozen keys", () => {
  assert.ok(ALL.length < 200, `${ALL.length} keys is not a library, it is a per-shot generator`);
  const video = ALL.filter((key) => !/^(react|idle|arena|phase)\./.test(key));
  assert.ok(video.length <= 120, `${video.length} video keys is more than a free tier can carry`);
});

test("every duelist can be reacted to in all three registers", () => {
  for (const id of DUELIST_IDS) {
    for (const register of ["steady", "pressed", "broken"]) {
      assert.ok(ALL.includes(`react.${id}.${register}`), `missing react.${id}.${register}`);
    }
  }
});

test("a missing placeholder throws rather than reaching the screen", () => {
  assert.throws(() => resolveKey("summon.{attr}.{fam}", { attr: "DARK" }), /\{fam\}/);
  assert.equal(resolveKey("summon.{attr}.{fam}", { attr: "DARK", fam: "dragon" }),
    "summon.DARK.dragon");
});

test("the grammar's ranks are a usable drop order", () => {
  for (const [beat, row] of Object.entries(GRAMMAR)) {
    const ranks = row.map(([, rank]) => rank);
    assert.equal(new Set(ranks).size, ranks.length, `${beat} has duplicate ranks to break ties on`);
    assert.equal(Math.min(...ranks), 1, `${beat} has no rank-1 spine`);
  }
});
