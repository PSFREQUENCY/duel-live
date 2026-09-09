// The duel used to be able to wedge: a long cinema queue blocked input for up to
// 37 seconds, and a thrown turn stranded play on the opponent's side forever.
// These tests hold those two doors shut.

import assert from "node:assert/strict";
import { test } from "node:test";

import { paceFor } from "../src/cinema/player.js";
import { buildStoryboard } from "../src/cinema/storyboard.js";
import { createDuel } from "../src/duel-engine.js";
import { playDuel } from "../scripts/selfplay.mjs";

test("a bigger batch of shots plays faster so the cinema catches up", () => {
  assert.equal(paceFor(1), 1, "a single shot plays at full length");
  assert.ok(paceFor(4) < paceFor(2), "a four-shot turn must move faster than a two-shot one");
  assert.ok(paceFor(9) < paceFor(4));
  for (const size of [0, 1, 3, 6, 12, 40]) {
    assert.ok(paceFor(size) > 0 && paceFor(size) <= 1, `pace out of range at batch size ${size}`);
  }
});

test("no single turn can queue more cinema than the settle cap allows", () => {
  const CAP_MS = 3500;
  const MIN_SHOT_MS = 700;
  let worstMs = 0;
  for (const matchup of ["yugi-kaiba", "joey-mai"]) {
    for (let seed = 0; seed < 30; seed += 1) {
      const { state, events } = playDuel(matchup, 4000 + seed);
      let bucket = [];
      let turn = 1;
      const flush = () => {
        if (!bucket.length) return;
        const shots = buildStoryboard(bucket, state, { turn });
        // Mirror how the player drains a queue: pace is set by what remains.
        const pace = paceFor(shots.length);
        const ms = shots.reduce(
          (sum, shot) => sum + Math.max(MIN_SHOT_MS, (shot.seconds ?? 3) * 1000 * pace),
          0,
        );
        worstMs = Math.max(worstMs, ms);
        bucket = [];
      };
      for (const event of events) {
        if (event.type === "phase" && event.phase === "draw") { flush(); turn = event.turn; }
        bucket.push(event);
      }
      flush();
    }
  }
  // Pacing should do the real work; the cap is only a backstop for the rare
  // turn that still overruns it.
  assert.ok(worstMs < 9000, `worst turn still queues ${(worstMs / 1000).toFixed(1)}s of cinema`);
  assert.ok(CAP_MS >= 3000 && CAP_MS <= 4000, "the backstop must stay short enough to feel responsive");
});

test("shots are paced for a game, not a cutscene", () => {
  const state = createDuel("yugi-kaiba", { seed: 1 });
  const shots = buildStoryboard([
    { type: "summon", side: "player", card: "Dark Magician", how: "normal", atk: 2500 },
    { type: "clash", side: "player", attacker: "Dark Magician", defender: "Battle Ox", attackerAtk: 2500, defenderValue: 1700, defenderPosition: "attack" },
    { type: "activate", side: "opponent", card: "Mirror Force", reveal: true },
  ], state);
  for (const shot of shots) {
    assert.ok(shot.seconds <= 3.5, `${shot.kind} runs ${shot.seconds}s — too long to hold up play`);
    assert.ok(shot.seconds >= 1.5, `${shot.kind} runs ${shot.seconds}s — too short to read`);
  }
});

test("the app exposes the controls a stuck player needs", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  for (const id of ["skip-btn", "resume-btn"]) {
    assert.ok(html.includes(`id="${id}"`), `#${id} is missing from the page`);
    assert.ok(app.includes(id), `${id} is never bound`);
  }
  assert.match(app, /setInterval/, "there must be a watchdog that can resume a stalled turn");
  assert.match(app, /catch \(error\)/, "a thrown turn must be caught, not left to strand the duel");
  assert.match(app, /Date\.now\(\) > deadline/, "waiting on the cinema must be bounded");
});

test("a draw failure cannot kill the render loop", async () => {
  const { createCinema } = await import("../src/cinema/player.js");
  let frames = 0;
  let exploding = true;
  const ctx = new Proxy({}, {
    get(_, prop) {
      if (prop === "canvas") return { width: 640, height: 360 };
      if (prop === "createLinearGradient" || prop === "createRadialGradient") {
        return () => ({ addColorStop() {} });
      }
      return () => { if (exploding) throw new Error("simulated canvas failure"); };
    },
    set: () => true,
  });
  const node = () => ({ classList: { add() {}, remove() {} }, pause() {}, play: async () => {}, hidden: true });

  const pending = [];
  globalThis.requestAnimationFrame = (fn) => { frames += 1; pending.push(fn); return frames; };
  globalThis.performance ??= { now: () => Date.now() };

  const cinema = createCinema({
    canvas: { getContext: () => ctx, width: 640, height: 360 },
    still: node(), video: node(),
    caption: { root: null }, getState: () => null,
    accents: () => ["#fff", "#fff"],
  });
  cinema.start();
  for (let i = 0; i < 5; i += 1) pending.shift()?.(i * 16);
  assert.ok(frames >= 5, `loop stopped after ${frames} frames when drawing threw`);
  assert.ok(cinema.drawFailures > 0, "the failure should be counted, not swallowed silently");

  exploding = false;
  pending.shift()?.(100);
  assert.ok(frames >= 6, "the loop must still be alive once drawing recovers");
});

test("a title card with nothing to show is not queued at all", async () => {
  const { readFileSync } = await import("node:fs");
  const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(app, /function playable\(shot\)/,
    "shots that can neither load a clip nor generate one must be dropped");
  assert.match(app, /\.filter\(playable\)/, "the opening sequence must be filtered");
  assert.match(app, /if \(playable\(outro\)\)/, "the outro must be filtered too");
});
