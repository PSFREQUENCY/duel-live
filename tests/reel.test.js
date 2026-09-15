// The reel's one promise is that something is always on screen. These tests
// try to break that, because every other part of live mode assumes it holds.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createReel, MAX_EVENT_LAG, MIN_AMBIENT_HOLD, truncate } from "../src/broadcast/reel.js";
import { mulberry32 } from "../src/duel-state.js";

const AMBIENT = ["idle.yugi", "react.kaiba.steady", "arena.wide", "react.kaiba.pressed"];
const ambient = (pressure, { avoid } = {}) => {
  const key = AMBIENT[pressure] === avoid ? AMBIENT[(pressure + 1) % AMBIENT.length] : AMBIENT[pressure];
  return { key, hold: 4000, tier: "still" };
};

const sequence = (over = {}) => ({
  eventId: "e1", drama: 0.4,
  shots: [
    { key: "reveal.monster", hold: 800, rank: 3, tier: "video" },
    { key: "summon.DARK.spellcaster", hold: 1600, rank: 1, tier: "video" },
    { key: "react.kaiba.pressed", hold: 900, rank: 2, tier: "still" },
  ],
  ...over,
});

test("something is on screen across ten thousand ticks of random pushes", () => {
  const rng = mulberry32(99);
  const reel = createReel({ ambient, now: () => 0 });
  let t = 0;
  reel.start(t);

  let blanks = 0;
  for (let i = 0; i < 10_000; i += 1) {
    t += 1 + Math.floor(rng() * 400);              // uneven frame timing
    if (rng() < 0.08) reel.push({ ...sequence(), pushedAt: t, drama: rng() });
    if (rng() < 0.01) reel.skip(t);
    const shot = reel.tick(t);
    if (!shot || !shot.key) blanks += 1;
    if (!reel.current) blanks += 1;
  }
  assert.equal(blanks, 0, `${blanks} blank frames`);
});

test("the reel starts on ambient, so the invariant holds from the first frame", () => {
  const reel = createReel({ ambient, now: () => 0 });
  assert.equal(reel.current, null, "nothing before start");
  reel.start(0);
  assert.ok(reel.current.key);
  assert.equal(reel.lane, "ambient");
});

test("an empty action lane falls through to ambient within one tick", () => {
  const reel = createReel({ ambient, now: () => 0 });
  reel.start(0);
  reel.push({ ...sequence({ drama: 0.1 }), pushedAt: 0 });
  reel.tick(700);                                   // past MIN_AMBIENT_HOLD
  assert.equal(reel.lane, "action");
  for (let t = 700; t < 8000; t += 100) reel.tick(t);
  assert.equal(reel.lane, "ambient", "the lane drains back to the floor");
  assert.ok(reel.current.key);
});

test("a push during an ambient shot waits for MIN_AMBIENT_HOLD", () => {
  const reel = createReel({ ambient, now: () => 0 });
  reel.start(0);
  reel.push({ ...sequence({ drama: 0.2 }), pushedAt: 0 });
  reel.tick(MIN_AMBIENT_HOLD - 100);
  assert.equal(reel.lane, "ambient", "cut too early would strobe on a fast exchange");
  reel.tick(MIN_AMBIENT_HOLD + 1);
  assert.equal(reel.lane, "action");
});

test("a push during an action shot waits for the shot boundary", () => {
  const reel = createReel({ ambient, now: () => 0 });
  reel.start(0);
  reel.push({ ...sequence({ drama: 0.2 }), pushedAt: 0 });
  reel.tick(700);
  const first = reel.current.key;
  reel.push({ ...sequence({ eventId: "e2", drama: 0.2 }), pushedAt: 700 });
  reel.tick(900);
  assert.equal(reel.current.key, first, "mid-shot cuts fragment the edit");
});

test("a rank-1 shot at drama 0.9 cuts immediately", () => {
  const reel = createReel({ ambient, now: () => 0 });
  reel.start(0);
  reel.push({ ...sequence({ drama: 0.1 }), pushedAt: 0 });
  reel.tick(700);
  const before = reel.current.key;
  reel.push({
    eventId: "lethal", drama: 0.9, pushedAt: 710,
    shots: [{ key: "direct.dragon", hold: 1600, rank: 1 }],
  });
  reel.tick(720);
  assert.equal(reel.current.eventId, "lethal", "a lethal attack interrupts what is on screen");
  assert.notEqual(reel.current.key, before);

  // And it goes first, rather than on screen after three stale shots.
  assert.equal(reel.current.key, "direct.dragon");
});

test("a low-drama push never interrupts, however deep the queue", () => {
  const reel = createReel({ ambient, now: () => 0 });
  reel.start(0);
  reel.push({ ...sequence({ drama: 0.1 }), pushedAt: 0 });
  reel.tick(700);
  const before = reel.current.eventId;
  reel.push({ ...sequence({ eventId: "routine", drama: 0.79 }), pushedAt: 710 });
  reel.tick(720);
  assert.equal(reel.current.eventId, before, "only drama >= 0.8 earns an interruption");
});

test("two consecutive ambient selections never share a key", () => {
  const reel = createReel({ ambient, now: () => 0 });
  reel.start(0);
  const seen = [];
  for (let t = 0; t < 60_000; t += 250) {
    reel.setPressure(Math.floor(t / 15_000));
    reel.tick(t);
    if (reel.lane === "ambient") {
      const key = reel.current.key;
      if (seen.at(-1) !== key) seen.push(key);
    }
  }
  for (let i = 1; i < seen.length; i += 1) {
    assert.notEqual(seen[i], seen[i - 1], "the same plate twice running reads as a freeze");
  }
});

test("a shot still in motion may be cut a little early", () => {
  const still = createReel({ ambient, now: () => 0 });
  still.start(0);
  still.push({ eventId: "a", drama: 0.2, pushedAt: 0,
    shots: [{ key: "static", hold: 1000, rank: 1, tailMotion: false }] });
  still.tick(700);
  still.push({ eventId: "b", drama: 0.2, pushedAt: 700,
    shots: [{ key: "next", hold: 1000, rank: 1 }] });
  still.tick(1600);
  assert.equal(still.current.key, "static", "a settled shot plays out");

  const moving = createReel({ ambient, now: () => 0 });
  moving.start(0);
  moving.push({ eventId: "a", drama: 0.2, pushedAt: 0,
    shots: [{ key: "moving", hold: 1000, rank: 1, tailMotion: true }] });
  moving.tick(700);
  moving.push({ eventId: "b", drama: 0.2, pushedAt: 700,
    shots: [{ key: "next", hold: 1000, rank: 1 }] });
  moving.tick(1600);
  assert.equal(moving.current.key, "next", "cut on motion, while movement hides the seam");
});

test("a sequence that waited too long is cut to its rank-1 spine", () => {
  const reel = createReel({ ambient, now: () => 0 });
  reel.start(0);
  reel.push({ ...sequence({ drama: 0.2 }), pushedAt: 0 });
  const late = MAX_EVENT_LAG + 1000;
  const played = [];
  for (let t = late; t < late + 6000; t += 100) {
    reel.tick(t);
    if (reel.lane === "action" && played.at(-1) !== reel.current.key) played.push(reel.current.key);
  }
  assert.deepEqual(played, ["summon.DARK.spellcaster"],
    "a late sequence plays its spine, not its full edit");
});

test("truncation drops the highest rank numbers and keeps order", () => {
  const shots = [
    { key: "a", rank: 3 }, { key: "b", rank: 1 }, { key: "c", rank: 2 }, { key: "d", rank: 4 },
  ];
  assert.deepEqual(truncate(shots, 4).map((s) => s.key), ["a", "b", "c", "d"]);
  assert.deepEqual(truncate(shots, 2).map((s) => s.key), ["b", "c"]);
  assert.deepEqual(truncate(shots, 1).map((s) => s.key), ["b"]);
  assert.deepEqual(truncate(shots, 0).map((s) => s.key), ["b"], "never truncates to nothing");
});

test("skip cuts to the next queued shot, or to ambient when nothing waits", () => {
  const reel = createReel({ ambient, now: () => 0 });
  reel.start(0);
  reel.push({ ...sequence(), pushedAt: 0 });
  reel.tick(700);
  const first = reel.current.key;
  reel.skip(800);
  assert.notEqual(reel.current.key, first);
  for (let i = 0; i < 5; i += 1) reel.skip(900 + i * 10);
  assert.ok(reel.current.key, "skipping past the end lands on ambient, not on nothing");
});
