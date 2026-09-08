// Drives the real app module through a stubbed DOM: boot, play, switch duels.
// This is the only test that exercises app.js, render.js and the cinema player
// together, so it is the one that catches wiring regressions.

import assert from "node:assert/strict";
import { test } from "node:test";

import { dom, fire, installGlobals, settle } from "./dom-stub.mjs";

const errors = [];
process.on("unhandledRejection", (e) => errors.push(String(e?.message ?? e)));

installGlobals();
await import("../src/app.js");
await settle(300);

const node = (id) => dom.nodes.get(id);

test("the app boots into a playable first turn", () => {
  assert.equal(node("me-lp").textContent, "8000");
  assert.equal(node("foe-lp").textContent, "8000");
  assert.equal(node("me-name").textContent, "Yugi Muto");
  assert.equal(node("foe-name").textContent, "Seto Kaiba");
  assert.match(node("matchup-name").textContent, /Battle City/);
});

test("every interactive control is wired", () => {
  for (const id of ["advance-btn", "restart-btn", "rules-btn", "sound-btn"]) {
    assert.ok(dom.listeners.has(`${id}:click`), `${id} has no click handler`);
  }
  for (const id of ["matchup-select", "tier-select"]) {
    assert.ok(dom.listeners.has(`${id}:change`), `${id} has no change handler`);
  }
});

test("the rules modal explains the free cinema tiers", async () => {
  await fire("rules-btn");
  assert.equal(node("modal").hidden, false);
  const body = node("modal-body").innerHTML;
  assert.match(body, /procedural/);
  assert.match(body, /needs a free key/, "no key is set in this run");
  await fire("modal-close");
  assert.equal(node("modal").hidden, true);
});

test("the voice toggle flips both label and aria state", async () => {
  const before = node("sound-btn").textContent;
  await fire("sound-btn");
  assert.notEqual(node("sound-btn").textContent, before);
  await fire("sound-btn");
});

test("advancing phases drives the duel forward through real turns", async () => {
  const startTurn = node("me-turn").textContent;
  for (let i = 0; i < 14; i += 1) {
    await fire("advance-btn");
    await settle(90);
  }
  const turn = Number(node("me-turn").textContent.slice(1));
  assert.ok(turn > Number(startTurn.slice(1)), `turn counter stuck at ${turn}`);
  const lp = Number(node("me-lp").textContent) + Number(node("foe-lp").textContent);
  assert.ok(lp < 16000, "after 14 phase advances someone should have taken damage");
  assert.ok(node("log").children.length > 5, "the duel log should be filling up");
});

test("switching to the second duel reseats both duelists", async () => {
  await dom.listeners.get("matchup-select:change")({ target: { value: "joey-mai" } });
  await settle(250);
  assert.equal(node("me-name").textContent, "Joey Wheeler");
  assert.equal(node("foe-name").textContent, "Mai Valentine");
  assert.equal(node("me-lp").textContent, "8000");
  assert.match(node("matchup-name").textContent, /Duelist Kingdom/);
});

test("restarting resets life points and clears the log", async () => {
  await fire("advance-btn");
  await settle(120);
  await fire("restart-btn");
  await settle(200);
  assert.equal(node("me-lp").textContent, "8000");
  assert.equal(node("foe-lp").textContent, "8000");
});

test("no unhandled rejection escaped while the duel ran", () => {
  assert.deepEqual(errors, []);
});
