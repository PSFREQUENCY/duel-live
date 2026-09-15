// §5: the tier is a property of the subject, not of the budget.
//
// Humans are physically present, so they are stable plates. Monsters are
// projections, so they get video -- where the model's instability reads as the
// hologram struggling to hold its shape. The split is diegetic, not economic;
// it just happens to also be free and instant, which is what lets the ambient
// lane promise zero latency.

import assert from "node:assert/strict";
import { test } from "node:test";

import { liveLibrary } from "../src/broadcast/library.js";
import { shotRequestFor } from "../src/broadcast/prompts.js";
import { shotFrom } from "../src/broadcast/shot-grammar.js";
import { NEGATIVE } from "../src/broadcast/prompts.js";
import { STYLE, WORLD } from "../src/cinema/world.js";

const { keys, still, video } = liveLibrary();

test("duelists, reactions and idles are stills — never upgraded to video", () => {
  for (const key of keys) {
    const isHuman = /^(react|idle)\./.test(key);
    if (!isHuman) continue;
    assert.ok(still.includes(key), `${key} should be a plate`);
    assert.equal(shotRequestFor(key).tier, "still",
      "video is the wrong texture for a reaction beat, budget or no budget");
  }
});

test("monsters, clashes and traps are video, where the instability is the point", () => {
  for (const key of ["summon.DARK.dragon", "clash.warrior", "direct.fiend", "trap", "reveal.trap"]) {
    assert.ok(video.includes(key), `${key} should be filmed`);
    assert.equal(shotRequestFor(key).tier, "video");
  }
});

test("the connective tissue is stills too, so a cut never waits on the arena", () => {
  for (const key of ["arena.wide", "arena.low", "phase.battle", "phase.end"]) {
    assert.ok(still.includes(key), `${key} should be a plate`);
  }
});

test("the grammar agrees with the library about every key's tier", () => {
  for (const key of keys) {
    const fromGrammar = shotFrom(key, 1).tier;
    const fromLibrary = still.includes(key) ? "still" : "video";
    assert.equal(fromGrammar, fromLibrary, `${key} is filed two different ways`);
  }
});

test("the split is roughly two thirds video, one third free", () => {
  assert.ok(still.length >= 20, `${still.length} stills is fewer than four duelists needs`);
  assert.ok(video.length <= 50, `${video.length} video clips is more than a free tier can carry`);
  assert.equal(still.length + video.length, keys.length);
});

test("every clip carries music as a negative, or the score breaks at every cut", () => {
  assert.match(NEGATIVE, /\bmusic\b/);
  assert.match(NEGATIVE, /\bscore\b/);
  assert.match(NEGATIVE, /\bsoundtrack\b/);
  for (const key of video) {
    assert.equal(shotRequestFor(key).negative, NEGATIVE, `${key} is missing the negative field`);
  }
});

test("every prompt names the arena inline, not only in the style header", () => {
  for (const key of keys) {
    const { prompt } = shotRequestFor(key);
    // The arena is the one asset in every shot; a header-only mention is what
    // makes a shot list change venue on every cut. Strip the shared header and
    // the venue must still be there, in the sentence describing the shot.
    assert.match(prompt, /arena/, `${key} does not say where it is`);
    const subject = prompt.replace(STYLE, "").replace(WORLD, "");
    assert.match(subject, /arena/, `${key} mentions the venue only in its header`);
  }
});

test("a reference plate is lit flat, and a shot in the world is not", () => {
  const plate = shotRequestFor("react.yugi.steady").prompt;
  assert.match(plate, /[Ff]lat even frontal lighting/,
    "a dramatically lit plate bakes shadows into the character for every later shot");
  const shot = shotRequestFor("summon.DARK.dragon").prompt;
  assert.match(shot, /Lighting: one/, "a shot in the world names one source with a position");
  assert.match(shot, /black|near-black|dark/, "and says where the light dies");
});

test("monsters are described by how they move, not what they are made of", () => {
  for (const key of video.filter((k) => /^(summon|clash|direct|fusion)\./.test(k))) {
    const { prompt } = shotRequestFor(key);
    assert.match(prompt, /first|leads|lunges|drives|rises|commits/,
      `${key} reads as a list of materials, which produces a prop`);
  }
  assert.match(shotRequestFor("summon.DARK.dragon").prompt, /head/,
    "without a leading head it reads as material");
});

test("the empty plates never name a person, not even to exclude one", () => {
  // Asking a diffusion model for "no people" puts people in the embedding, and
  // these plates came back as portraits every time. Emptiness has to be
  // described, not negated.
  for (const key of ["arena.wide", "arena.low", "arena.overhead", "phase.battle", "phase.end"]) {
    const { prompt } = shotRequestFor(key);
    const subject = prompt.slice(prompt.indexOf("A slow") >= 0 ? prompt.indexOf("A ") : 0);
    for (const word of ["people", "person", "character", "figure", "face", "duelist", "nobody"]) {
      assert.doesNotMatch(subject, new RegExp(`\\b${word}`, "i"),
        `${key} names "${word}" — which is how one ends up in the shot`);
    }
    assert.match(prompt, /floor|grid|pylons|seating/, `${key} must describe what IS there`);
  }
});

test("only the finish shot looks down the lens", () => {
  const gazing = keys.filter((key) => /down the lens/.test(shotRequestFor(key).prompt));
  assert.deepEqual(gazing, ["finish"], "eyes are the uncanny epicentre; one per duel is the budget");
});
