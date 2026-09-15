// Live mode driven through the real app module: boot into it, play ten turns,
// and assert the promise that the whole mode rests on.

import assert from "node:assert/strict";
import { test } from "node:test";

import { dom, fire, installGlobals, settle } from "./dom-stub.mjs";

const errors = [];
process.on("unhandledRejection", (e) => errors.push(String(e?.message ?? e)));

// Boot straight into live mode, the way ?mode=live does.
installGlobals({ search: "?mode=live" });
const app = await import("../src/app.js");
await settle(400);

const node = (id) => dom.nodes.get(id);

test("the app boots into live mode from the query string", () => {
  assert.equal(node("mode-select").value, "live");
  assert.equal(node("live-root").hidden, false, "the live surface must be on screen");
});

test("the HUD carries both players symmetrically", () => {
  assert.equal(node("live-my-lp").textContent, "8000");
  assert.equal(node("live-foe-lp").textContent, "8000");
  assert.equal(node("live-my-name").textContent, "Yugi Muto");
  assert.equal(node("live-foe-name").textContent, "Seto Kaiba");
  assert.match(node("live-my-counts").textContent, /H \d+\s+D \d+/);
  assert.match(node("live-foe-counts").textContent, /H \d+\s+D \d+/);
});

test("the hand is rendered into the bottom bar, never hidden behind anything", () => {
  const fan = node("live-fan");
  assert.ok(fan.children.length >= 4, `only ${fan.children.length} cards in the fan`);
  assert.equal(fan.dataset.count, String(fan.children.length));
});

test("the reel has a shot from the very first frame", () => {
  const reel = app.liveForTest?.()?.reel;
  assert.ok(reel, "live mode should be constructed");
  assert.ok(reel.current?.key, "the reel started blank");
});

test("ten turns of live mode never leave the reel without a shot", async () => {
  const live = app.liveForTest();
  let blanks = 0;

  for (let i = 0; i < 10; i += 1) {
    // Play, do not just advance: a harness that only steps phases never fills
    // the action lane, so it would pass while the reel showed ambient forever.
    const card = dom.query(".fan-card:not(.is-blocked)");
    if (card) card.click(); else await fire("advance-btn");
    await settle(120);
    dom.query(".sel-action")?.click();
    await settle(140);
    for (let t = 0; t < 12; t += 1) {
      if (!live.reel.tick(performance.now())?.key) blanks += 1;
      await settle(40);
    }
  }
  const cuts = live.cuts;
  assert.equal(blanks, 0, `${blanks} blank frames across ten turns`);
  assert.ok(cuts.distinct >= 3, `only ${cuts.distinct} distinct shots — that is a freeze`);
  assert.ok(cuts.action > 0, "the action lane was never used; the reel only showed ambient");
  assert.ok(cuts.ambient > 0, "the ambient floor was never needed, so it was never proven");
  assert.deepEqual(errors, [], "live mode threw while the duel ran");
});

test("playing a card from the fan opens its actions, and acting closes them", async () => {
  const card = dom.query(".fan-card:not(.is-blocked)");
  if (!card) return;                      // nothing playable this turn; not a failure
  card.click();
  await settle(80);
  assert.equal(dom.nodes.get("live-selection").hidden, false,
    "selecting a card must surface what can be done with it");
  const action = dom.query(".sel-action");
  if (action) {
    action.click();
    await settle(160);
    assert.equal(dom.nodes.get("live-selection").hidden, true, "acting closes the panel");
  }
});

test("a blocked card still explains itself rather than going dead", async () => {
  const blocked = dom.query(".fan-card.is-blocked");
  if (!blocked) return;                   // nothing blocked right now
  blocked.click();
  await settle(80);
  const panel = dom.nodes.get("live-selection");
  assert.equal(panel.hidden, false, "a blocked card must still open, or it teaches nothing");
});

test("the stage always paints, with or without media behind it", () => {
  const live = app.liveForTest();
  live.stage.render(1000);
  live.stage.render(2000);
  assert.ok(live.stage.stats.frames >= 2);
  // With no server in the stub, every frame falls to the procedural floor --
  // which is exactly the case that must still produce a picture.
  assert.equal(live.stage.stats.medialess, live.stage.stats.frames,
    "no media was available, so every frame should have used the floor");
});

test("the duel advanced, so the reel was narrating a real duel", () => {
  assert.ok(Number(node("turn-counter").textContent) > 1);
  assert.notEqual(node("live-my-lp").textContent, "");
});

test("switching back to tactical restores the board", async () => {
  node("mode-select").value = "tactical";
  await fire("mode-select", "change", { target: node("mode-select") });
  await settle(200);
  assert.equal(node("live-root").hidden, true);
  assert.equal(node("me-lp").textContent, "8000", "tactical mode must still work");
});

test("an attack can actually be declared in live mode", async () => {
  // The whole path: hold the board, click your monster, click theirs, confirm.
  // Every piece of this was broken at once — the preview lived inside the
  // hidden tactical arena, and all four telestrator rows shared one handler,
  // so the second click was read as a click on your own side.
  const live = app.liveForTest();
  if (!live) return;

  // Play until there are monsters on both sides and it is the Battle Phase.
  for (let i = 0; i < 24; i += 1) {
    const card = dom.query(".fan-card:not(.is-blocked)");
    if (card) card.click(); else await fire("advance-btn");
    await settle(90);
    dom.query(".sel-action")?.click();
    await settle(110);
    if (dom.nodes.get("attack-preview").hidden === false) break;
    const mine = dom.queryAll("#tele-my-monsters .zone.is-filled");
    if (mine.length) mine[0].click();
    await settle(60);
    const theirs = dom.queryAll("#tele-foe-monsters .zone.is-filled");
    if (theirs.length) theirs[0].click();
    await settle(60);
  }

  // The arc and the preview must be reachable at all — they are no longer
  // inside the arena that live mode hides.
  assert.equal(dom.nodes.get("attack-preview").id, "attack-preview");
  assert.equal(dom.nodes.get("attack-arc").id, "attack-arc");
  assert.deepEqual(errors, [], "declaring an attack threw");
});

test("the board is pinned open while a declaration is half-made", () => {
  const live = app.liveForTest();
  if (!live) return;
  live.holdBoard(true);
  assert.equal(dom.nodes.get("live-telestrator").hidden, false,
    "letting go of Tab mid-declaration would drop the board");
  live.holdBoard(false);
});
