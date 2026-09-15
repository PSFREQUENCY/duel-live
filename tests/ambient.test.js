// The ambient ladder. Waiting is a scene, not a gap.

import assert from "node:assert/strict";
import { test } from "node:test";

import { ambientShot, createAmbient, pressureFor } from "../src/broadcast/ambient.js";
import { createReel } from "../src/broadcast/reel.js";

test("pressure climbs the ladder on the spec's boundaries", () => {
  assert.equal(pressureFor(0), 0);
  assert.equal(pressureFor(5_999), 0);
  assert.equal(pressureFor(6_000), 1);
  assert.equal(pressureFor(13_999), 1);
  assert.equal(pressureFor(14_000), 2);
  assert.equal(pressureFor(24_999), 2);
  assert.equal(pressureFor(25_000), 3);
  assert.equal(pressureFor(600_000), 3, "it tops out rather than running off the end");
});

test("each rung looks where the spec says to look", () => {
  const who = { you: "yugi", opponent: "kaiba" };
  assert.equal(ambientShot(0, who).key, "idle.yugi");
  assert.equal(ambientShot(1, who).key, "react.kaiba.steady");
  assert.match(ambientShot(2, who).key, /^arena\./);
  assert.equal(ambientShot(3, who).key, "react.kaiba.pressed",
    "a 25-second stall gets a visibly bored opponent, which is also a prompt");
});

test("ambient shots are tier 1, so the lane is always instantly available", () => {
  for (let level = 0; level <= 3; level += 1) {
    assert.equal(ambientShot(level, { you: "joey", opponent: "mai" }).tier, "still",
      "a lane that can wait on a generator is not a floor");
  }
});

test("a rung never repeats the key already on screen", () => {
  const who = { you: "yugi", opponent: "kaiba" };
  for (let level = 0; level <= 3; level += 1) {
    const first = ambientShot(level, who).key;
    assert.notEqual(ambientShot(level, { ...who, avoid: first }).key, first);
  }
});

test("pressure never steps down inside one decision window", () => {
  const amb = createAmbient({ you: "yugi", opponent: "kaiba" });
  amb.reset(0);
  assert.equal(amb.pressureAt(20_000), 2);
  assert.equal(amb.pressureAt(7_000), 2, "a late frame must not walk the opponent back");
  assert.equal(amb.pressureAt(30_000), 3);
});

test("acting resets the window", () => {
  const amb = createAmbient({ you: "yugi", opponent: "kaiba" });
  amb.reset(0);
  assert.equal(amb.pressureAt(30_000), 3);
  amb.reset(30_000);
  assert.equal(amb.pressureAt(30_100), 0);
});

test("on the opponent's turn the camera stays on the one with agency", () => {
  const amb = createAmbient({ you: "yugi", opponent: "kaiba" });
  amb.reset(0, "opponent");
  // Never your own resting hands while they are the one deciding.
  assert.equal(amb.select(0).key, "react.kaiba.steady");
  assert.notEqual(amb.select(0).key, "idle.yugi");
});

test("the ladder drives the reel without ever emptying it", () => {
  const amb = createAmbient({ you: "yugi", opponent: "kaiba" });
  amb.reset(0);
  const reel = createReel({
    ambient: (level, { avoid }) => amb.select(level, { avoid }),
    now: () => 0,
  });
  reel.start(0);
  const seen = new Set();
  for (let t = 0; t < 40_000; t += 200) {
    reel.setPressure(amb.pressureAt(t));
    const shot = reel.tick(t);
    assert.ok(shot?.key, `blank at ${t}ms`);
    seen.add(shot.key);
  }
  assert.ok(seen.size >= 4, `a 40s stall showed only ${seen.size} plates`);
});
