// Everything the board gives a player, the video surface must give them too.
//
// This file exists because the parity was built piecemeal and kept coming up
// short: the counters, the chain, the duelists' speech and the graveyard were
// all trapped inside the tactical arena, which live mode hides. The fix was to
// move what belongs to the duel rather than to one surface into a shared
// overlay, so one renderer serves both. This is the guard on that.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { dom, fire, installGlobals, settle } from "./dom-stub.mjs";

installGlobals({ search: "?mode=live" });
const app = await import("../src/app.js");
const { makeInstance } = await import("../src/duel-state.js");
await settle(400);

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const node = (id) => dom.nodes.get(id);

/** Which container an element sits in, so "hidden by the mode" is testable. */
function inside(container, id) {
  const open = html.indexOf(container);
  const close = html.indexOf("</section>", open);
  return html.slice(open, close).includes(`id="${id}"`);
}

// What belongs to the duel rather than to one surface.
const SHARED = ["effect-rail", "chain-rail", "banter"];

test("the duel's own overlays move to whichever surface is on screen", async () => {
  // Left in the arena they were invisible in live mode; pinned to the viewport
  // instead, they floated outside the picture. They are reparented, so one
  // renderer serves both and they are always against the right frame.
  const holds = (container, id) => node(container).children.some((c) => c.id === id);

  for (const id of SHARED) {
    assert.ok(holds("live-frame", id), `${id} is not on the live surface`);
  }

  node("mode-select").value = "tactical";
  await fire("mode-select", "change", { target: node("mode-select") });
  await settle(200);
  for (const id of SHARED) {
    assert.ok(holds("arena-overlays", id), `${id} did not go back to the board`);
  }

  node("mode-select").value = "live";
  await fire("mode-select", "change", { target: node("mode-select") });
  await settle(200);
  for (const id of SHARED) {
    assert.ok(holds("live-frame", id), `${id} did not come back to the video`);
  }
});

test("the attack preview belongs to neither surface, so it sits above both", () => {
  for (const id of ["attack-preview", "attack-arc"]) {
    assert.equal(inside('<section class="arena"', id), false,
      `${id} is inside the tactical arena, so live mode cannot show it`);
  }
  const overlay = html.slice(html.indexOf('id="duel-overlay"'));
  assert.ok(overlay.includes('id="attack-preview"'));
});

test("continuing effects show their turn counters in live mode", () => {
  // "we need to see counts (for magical hats, spellbinding circle...)"
  const state = app.stateForTest();
  state.sides.opponent.lockAttacksTurns = 3;
  state.sides.player.hats = { odds: 4 };
  state.activeSide = "player";
  state.phase = "main1";
  state.pending = null;
  app.renderForTest();

  const rail = node("effect-rail");
  assert.equal(rail.hidden, false, "the counters must be on screen");
  assert.equal(rail.children.length, 2, `${rail.children.length} effects shown`);
  const text = rail.children.map((c) => c.textContent).join(" ");
  assert.match(text, /Swords of Revealing Light/);
  assert.match(text, /3/, "a counting effect must show how many turns are left");
  assert.match(text, /∞/, "and one that lasts until removed must say so");
});

test("the graveyard is reachable from the live surface", () => {
  // Monster Reborn is unplayable if you cannot see what is in there.
  const state = app.stateForTest();
  state.sides.player.graveyard = [makeInstance("celticGuardian", "yugi")];
  app.renderForTest();
  assert.match(node("live-my-gy").textContent, /GY 1/);
  assert.ok(dom.listeners.has("live-my-gy:click"), "the live counter must open the graveyard");
  assert.ok(dom.listeners.has("live-foe-gy:click"));
});

test("the live surface says what the rules allow, as well as what to click", () => {
  const state = app.stateForTest();
  state.activeSide = "player";
  state.phase = "main1";
  state.pending = null;
  state.winner = null;
  state.sides.player.hand = [makeInstance("celticGuardian", "yugi")];
  state.sides.player.normalSummonUsed = false;
  app.renderForTest();

  assert.match(node("live-phase-note").textContent, /You may/,
    "the phase note belongs on both surfaces");
  assert.match(node("live-hint").textContent, /Click/,
    "and so does the line telling you what to do about it");
  assert.equal(node("live-phase-note").textContent, node("phase-note").textContent,
    "two surfaces, one renderer — they cannot disagree");
});

test("a monster can be switched between attack and defence from the live field", () => {
  const state = app.stateForTest();
  state.sides.player.monsters = [makeInstance("celticGuardian", "yugi"), null, null, null, null];
  state.sides.player.monsters[0].position = "attack";
  state.sides.player.monsters[0].summonedTurn = 1;
  state.turn = 3;
  state.phase = "main1";
  state.activeSide = "player";
  state.pending = null;
  state.winner = null;
  app.renderForTest();

  const ready = dom.queryAll("#live-my-field .field-pip.is-ready");
  assert.ok(ready.length >= 1, "a repositionable monster must be marked on the live field");
  assert.match(node("live-hint").textContent, /position/,
    "and the hint must say that is what clicking it does");
});

test("resume and share are reachable without the tactical sidebar", () => {
  for (const id of ["live-resume-btn", "live-share-btn"]) {
    assert.ok(dom.listeners.has(`${id}:click`), `${id} is not wired`);
  }
});

test("every control the board has, the live surface has as well", () => {
  // Named rather than derived: a new tactical control should have to be
  // considered for live mode deliberately, not silently skipped.
  const pairs = [
    ["advance-btn", "live-advance-btn"],
    ["share-btn", "live-share-btn"],
    ["resume-btn", "live-resume-btn"],
    ["me-gy", "live-my-gy"],
    ["foe-gy", "live-foe-gy"],
    ["phase-note", "live-phase-note"],
    ["phase-rail", "live-phase-rail"],
    ["turn-counter", "live-turn"],
    ["hand-hint", "live-hint"],
    ["log", "live-feed"],
  ];
  for (const [board, video] of pairs) {
    assert.ok(node(board), `${board} is missing from the board`);
    assert.ok(node(video), `${video} is missing from the live surface`);
  }
});
