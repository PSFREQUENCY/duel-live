// WP8: replay. The engine is deterministic from a seed and every decision goes
// through one of a handful of entry points, so a duel is fully described by its
// seed and the choices made — small enough to live in a URL.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decodeReplay, encodeReplay, record, replay, replayLink, turnMarkers,
} from "../src/duel-replay.js";
import { recordDuel } from "../scripts/record-duel.mjs";
import { createDuel } from "../src/duel-engine.js";

test("a duel from the same seed deals the same cards, with the same ids", () => {
  const a = createDuel("yugi-kaiba", { seed: 5 });
  const b = createDuel("yugi-kaiba", { seed: 5 });
  assert.deepEqual(a.sides.player.hand.map((c) => c.uid), b.sides.player.hand.map((c) => c.uid),
    "a replay refers to cards by id, so ids must be reproducible");
  assert.deepEqual(a.sides.opponent.deck.map((c) => c.cardId), b.sides.opponent.deck.map((c) => c.cardId));
});

test("replaying a recording reproduces the final state exactly", () => {
  for (const matchup of ["yugi-kaiba", "joey-mai"]) {
    const recording = recordDuel(matchup, 777);
    const again = replay(recording);
    assert.equal(JSON.stringify(again.state), JSON.stringify(recording.state),
      `${matchup} did not replay identically`);
  }
});

test("a replay matches event for event, not just at the end", () => {
  const recording = recordDuel("yugi-kaiba", 1234);
  const first = replay(recording);
  const second = replay(recording);
  assert.equal(first.events.length, second.events.length);
  assert.deepEqual(
    first.events.map((e) => `${e.type}:${e.card ?? e.phase ?? e.subStep ?? ""}`),
    second.events.map((e) => `${e.type}:${e.card ?? e.phase ?? e.subStep ?? ""}`),
  );
  assert.ok(first.events.length > 50, "a real duel, not a stub");
});

test("a long duel replays as faithfully as a short one", () => {
  const recording = recordDuel("joey-mai", 4242);
  assert.ok(recording.steps.length > 40, `only ${recording.steps.length} steps recorded`);
  const again = replay(recording);
  assert.equal(again.state.turn, recording.state.turn);
  assert.equal(again.state.winner, recording.state.winner);
  assert.equal(again.state.sides.player.lp, recording.state.sides.player.lp);
  assert.equal(again.state.sides.opponent.lp, recording.state.sides.opponent.lp);
});

test("a recording round-trips through its encoded form", () => {
  const recording = recordDuel("yugi-kaiba", 99);
  const encoded = encodeReplay(recording);
  const decoded = decodeReplay(encoded);
  assert.equal(decoded.seed, recording.seed);
  assert.equal(decoded.matchup, recording.matchup);
  assert.deepEqual(decoded.steps, recording.steps);
  assert.equal(JSON.stringify(replay(decoded).state), JSON.stringify(recording.state));
});

test("the encoded form is URL-safe", () => {
  const encoded = encodeReplay(recordDuel("yugi-kaiba", 99));
  assert.doesNotMatch(encoded, /[+/=]/, "a link must survive being pasted anywhere");
  assert.match(replayLink(recordDuel("yugi-kaiba", 99)), /^\?duel=[A-Za-z0-9_-]+$/);
});

test("a whole duel fits in a link", () => {
  const encoded = encodeReplay(recordDuel("yugi-kaiba", 777));
  assert.ok(encoded.length < 16_000,
    `${encoded.length} characters is past what a URL will carry`);
});

test("rubbish decodes to null rather than throwing", () => {
  for (const bad of ["", "not-base64!!", "eyJ2Ijo5OTl9", encodeReplay({ seed: 1, matchup: null, steps: [] })]) {
    assert.equal(decodeReplay(bad), null, `${bad.slice(0, 20)} should not decode`);
  }
});

test("an unknown step is ignored rather than corrupting the replay", () => {
  const recording = recordDuel("yugi-kaiba", 5);
  const tampered = { ...recording, steps: [...recording.steps, record("nonsense", { x: 1 })] };
  const again = replay(tampered);
  assert.equal(again.state.winner, recording.state.winner);
});

test("turn markers give a scrubber something to scrub", () => {
  const { events, state } = replay(recordDuel("joey-mai", 4242));
  const marks = turnMarkers(events);
  assert.ok(marks.length > 5, "a duel of several turns should have several marks");
  assert.deepEqual(marks.map((m) => m.turn), [...marks].sort((a, b) => a.turn - b.turn).map((m) => m.turn),
    "marks must run in turn order");
  assert.ok(marks.at(-1).turn <= state.turn);
});

test("the app records the same shape it can replay", async () => {
  const { readFileSync } = await import("node:fs");
  const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  // Every decision path must record, or a shared duel replays as a different one.
  for (const kind of ["action", "chain", "target", "tribute", "discard", "phase", "turn"]) {
    assert.ok(app.includes(`record("${kind}"`) || app.includes(`step("${kind}"`),
      `${kind} decisions are never recorded, so a replay would diverge`);
  }
  assert.match(app, /decodeReplay/, "the app must be able to load a shared duel");
  assert.match(app, /\?duel=/, "and hand out a link to one");
});

test("a speculative search leaves the card counter where it found it", async () => {
  const { uidCounterValue } = await import("../src/duel-state.js");
  const { lookahead } = await import("../src/duel-eval.js");
  const { applyAction, createDuel, legalActions } = await import("../src/duel-engine.js");
  const { makeInstance } = await import("../src/duel-state.js");

  const state = createDuel("joey-mai", { seed: 3 });
  const goat = makeInstance("scapegoat", "joey");   // creates four tokens when it resolves
  state.sides.player.hand = [goat];
  const before = uidCounterValue();
  lookahead(state, "player", { type: "activate", uid: goat.uid }, applyAction);
  assert.equal(uidCounterValue(), before,
    "a hypothetical that burns card ids makes the real duel unreproducible from its seed");
});
