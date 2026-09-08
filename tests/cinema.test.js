import assert from "node:assert/strict";
import { test } from "node:test";

import { buildStoryboard, idleShot, shotSeed } from "../src/cinema/storyboard.js";
import {
  clearJobs, deservesVideo, highestTier, jobCount, planTiers, prefetch, probeCapability, resolve,
} from "../src/cinema/free-video.js";
import { createDuel } from "../src/duel-engine.js";
import { playDuel } from "../scripts/selfplay.mjs";

const state = createDuel("yugi-kaiba", { seed: 1 });

test("only cinematic events become shots", () => {
  const shots = buildStoryboard([
    { type: "draw", side: "player", card: "Kuriboh" },
    { type: "phase", side: "player", phase: "main1", turn: 1 },
    { type: "summon", side: "player", card: "Dark Magician", how: "normal", atk: 2500 },
  ], state);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].kind, "summon");
  assert.equal(shots[0].title, "Dark Magician");
});

test("shot prompts are rebuilt from battle facts and carry the arena", () => {
  const [shot] = buildStoryboard([
    { type: "summon", side: "player", card: "Dark Magician", how: "normal", atk: 2500 },
  ], state);
  assert.match(shot.prompt, /violet-robed sorcerer/, "uses the card's own art seed");
  assert.match(shot.prompt, /rooftop duel arena/, "anchors to the matchup arena");
  assert.match(shot.prompt, /no text, no watermark/, "keeps the house style");
  assert.equal(shot.voice, "I summon Dark Magician!");
});

test("a clash shot reports the real numbers the engine produced", () => {
  const [shot] = buildStoryboard([{
    type: "clash", side: "opponent", attacker: "Blue-Eyes White Dragon",
    defender: "Celtic Guardian", attackerAtk: 3000, defenderValue: 1400, defenderPosition: "attack",
  }], state);
  assert.equal(shot.subtitle, "3000 vs 1400");
  assert.match(shot.prompt, /shattering the defender/);
});

test("token summons never take a cinema slot", () => {
  const shots = buildStoryboard([
    { type: "summon", side: "player", card: "Sheep Token", how: "token", atk: 0 },
  ], state);
  assert.deepEqual(shots, []);
});

test("shot ids are stable and seeds derive from them", () => {
  const events = [{ type: "summon", side: "player", card: "Kuriboh", how: "normal", atk: 300 }];
  const [a] = buildStoryboard(events, state, { turn: 3 });
  const [b] = buildStoryboard(events, state, { turn: 3 });
  assert.equal(a.id, b.id);
  assert.equal(shotSeed(a), shotSeed(b));
});

test("a full duel produces a coherent shot list", () => {
  const duel = playDuel("joey-mai", 21);
  const shots = buildStoryboard(duel.events, duel.state);
  assert.ok(shots.length > 8, `expected a real storyboard, got ${shots.length}`);
  assert.ok(shots.every((s) => s.prompt && s.id && s.seconds > 0));
  assert.equal(shots.at(-1).kind, "finish");
});

test("the idle shot describes both duelists from the shared world bible", () => {
  const shot = idleShot(state);
  assert.match(shot.prompt, /star-shaped black hair/, "Yugi's look, as world.js defines it");
  assert.match(shot.prompt, /white high-collared coat/, "Kaiba's look, as world.js defines it");
});

test("video is spent only on moments worth the wait", () => {
  assert.equal(deservesVideo({ kind: "fusion" }), true);
  assert.equal(deservesVideo({ kind: "finish" }), true);
  assert.equal(deservesVideo({ kind: "summon", event: { atk: 3000 } }), true);
  assert.equal(deservesVideo({ kind: "summon", event: { atk: 1200 } }), false);
  assert.equal(deservesVideo({ kind: "clash", event: { attackerAtk: 800 } }), false);
});

test("with no key the plan never asks for video", async () => {
  await probeCapability(async () => ({
    ok: true, json: async () => ({ still: true, video: false, voice: false, realtime: false }),
  }));
  assert.equal(highestTier(), "still");
  const plan = planTiers([{ kind: "fusion" }, { kind: "summon", event: { atk: 3000 } }]);
  assert.ok(plan.every((p) => p.tier === "still"));
});

test("with a key the video budget is spent and then exhausted", async () => {
  await probeCapability(async () => ({
    ok: true, json: async () => ({ still: true, video: true, voice: true, realtime: true }),
  }));
  assert.equal(highestTier(), "video");
  const shots = [{ kind: "fusion" }, { kind: "finish" }, { kind: "direct" }];
  const plan = planTiers(shots, { videoBudget: 2 });
  assert.deepEqual(plan.map((p) => p.tier), ["video", "video", "still"]);
});

test("a failed generation resolves to null rather than throwing", async () => {
  clearJobs();
  const failing = async () => ({ ok: false, status: 502 });
  const asset = await resolve({ id: "boom", prompt: "x", kind: "summon" }, { tier: "still", fetchImpl: failing });
  assert.equal(asset, null, "callers treat null as stay-procedural");
});

test("prefetch de-duplicates work for the same shot and tier", async () => {
  clearJobs();
  let calls = 0;
  const counting = async () => { calls += 1; return { ok: true, json: async () => ({ url: "/media/x.jpg" }) }; };
  const shot = { id: "dedupe", prompt: "x", kind: "summon" };
  prefetch(shot, "still", counting);
  prefetch(shot, "still", counting);
  const asset = await resolve(shot, { tier: "still", fetchImpl: counting });
  assert.equal(calls, 1);
  assert.equal(jobCount(), 1);
  assert.equal(asset.url, "/media/x.jpg");
});

test("a timed-out generation falls back instead of stalling the duel", async () => {
  clearJobs();
  const slow = () => new Promise(() => {});
  const asset = await resolve({ id: "slow", prompt: "x", kind: "finish" }, { tier: "video", timeoutMs: 30, fetchImpl: slow });
  assert.equal(asset, null);
});
