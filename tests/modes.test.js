import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_MODE, isBroadcast, isInteractive, resolveMode, turnBudgetFor } from "../src/modes.js";

test("mode comes from the query string, and an unknown one falls back", () => {
  assert.equal(resolveMode("?mode=live"), "live");
  assert.equal(resolveMode("?mode=watch"), "watch");
  assert.equal(resolveMode("?mode=tactical"), "tactical");
  assert.equal(resolveMode(""), DEFAULT_MODE);
  assert.equal(resolveMode("?mode=cinema"), DEFAULT_MODE, "a typo must not break the page");
  assert.equal(resolveMode("?duel=abc&mode=live"), "live");
});

test("tactical is the default, so an existing link keeps its behaviour", () => {
  assert.equal(DEFAULT_MODE, "tactical");
  assert.equal(resolveMode("?seed=4"), "tactical");
});

test("watch mode takes no input", () => {
  assert.equal(isInteractive("watch"), false);
  assert.equal(isInteractive("live"), true);
  assert.equal(isInteractive("tactical"), true);
});

test("both broadcast modes put the video on the surface", () => {
  assert.equal(isBroadcast("live"), true);
  assert.equal(isBroadcast("watch"), true);
  assert.equal(isBroadcast("tactical"), false);
});

test("live mode earns a longer AI turn than tactical", () => {
  assert.equal(turnBudgetFor("tactical"), 4000);
  assert.equal(turnBudgetFor("live"), 6000);
  assert.ok(turnBudgetFor("watch") > turnBudgetFor("tactical"));
});
