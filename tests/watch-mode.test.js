// Watch mode: a screening. The duel plays itself, the reel narrates, and there
// is nothing to press -- which means every decision the engine raises has to be
// answered without a viewer, or the duel deadlocks against a hand that is not there.

import assert from "node:assert/strict";
import { test } from "node:test";

import { dom, installGlobals, settle } from "./dom-stub.mjs";

const errors = [];
process.on("unhandledRejection", (e) => errors.push(String(e?.message ?? e)));

installGlobals({ search: "?mode=watch", clockSpeed: 60 });
const app = await import("../src/app.js");
await settle(400);

const node = (id) => dom.nodes.get(id);
const live = app.liveForTest();

// The default is Slow, which is right for a viewer and far too slow for a test
// that has to reach a conclusion. Pace is the thing under test elsewhere; here
// it just needs to get out of the way.
live.setPace("fast");

const beats = {};
let shots = 0;
let blanks = 0;
const seen = new Set();

const push = live.reel.push.bind(live.reel);
live.reel.push = (sequence) => {
  beats[sequence.beat] = (beats[sequence.beat] ?? 0) + 1;
  shots += sequence.shots.length;
  return push(sequence);
};

for (let i = 0; i < 700; i += 1) {
  const shot = live.reel.tick(performance.now());
  if (!shot?.key) blanks += 1;
  else seen.add(shot.key);
  live.stage.render(performance.now());
  await settle(30);
}

test("the duel plays itself to a conclusion with nobody at the controls", () => {
  const turn = Number(node("turn-counter").textContent);
  assert.ok(turn > 3, `watch mode reached only turn ${turn} — it is stuck`);
  const lp = [node("live-my-lp").textContent, node("live-foe-lp").textContent].map(Number);
  assert.ok(lp.some((v) => v < 8000), "no damage was dealt in a whole duel");
});

test("a player-side decision does not deadlock against a viewer with no hand", () => {
  // The failure this guards is specific: the AI plays a card that targets, the
  // engine raises a pending for the player, and the prompt waits for a click
  // that can never arrive. The duel simply stops, on a screen with no controls.
  assert.deepEqual(errors, [], "watch mode threw");
  assert.ok(Object.keys(beats).length >= 3, `only ${Object.keys(beats).length} kinds of beat`);
});

test("the reel narrated a real duel, not a loop of ambient", () => {
  assert.equal(blanks, 0, `${blanks} blank frames`);
  assert.ok(shots >= 10, `only ${shots} shots across a whole duel`);
  assert.ok(seen.size >= 5, `only ${seen.size} distinct shots — that is a slideshow`);
  const action = Object.entries(beats).filter(([beat]) => beat !== "phase");
  assert.ok(action.length >= 3, "the edit was nearly all breathers");
});

test("the breather stays rare even across a whole duel", () => {
  const phases = beats.phase ?? 0;
  const turn = Number(node("turn-counter").textContent);
  assert.ok(phases <= turn + 1, `${phases} stingers in ${turn} turns is a metronome`);
});

test("watch mode offers no input surface", () => {
  assert.equal(node("live-fan").children.length, 0, "there is no hand to play in a screening");
});

test("the stage painted every frame it was asked for", () => {
  assert.ok(live.stage.stats.frames >= 700);
  assert.equal(live.stage.stats.failures, 0);
});
