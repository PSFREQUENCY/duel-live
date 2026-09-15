// Pace: how far the engine may run ahead of the picture.

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_PACE, INPUT_CAP_MS, PACES, isPace, paceFor } from "../src/broadcast/pace.js";

test("slow is the default, because watching is the point of the mode", () => {
  assert.equal(DEFAULT_PACE, "slow");
  assert.equal(paceFor(undefined).label, "Slow");
  assert.equal(paceFor("nonsense").label, "Slow", "a bad value must not break playback");
  assert.equal(isPace("steady"), true);
  assert.equal(isPace("glacial"), false);
});

test("every pace is ordered consistently — nothing crosses over", () => {
  const order = ["slow", "steady", "fast"];
  const strictlyFalling = (key) => {
    for (let i = 1; i < order.length; i += 1) {
      assert.ok(PACES[order[i]][key] < PACES[order[i - 1]][key],
        `${key} does not fall from ${order[i - 1]} to ${order[i]}`);
    }
  };
  for (const key of ["hold", "settleCap", "beat"]) strictlyFalling(key);
  // The turn budget is allowed to be flat between neighbouring paces: it bounds
  // how long an opponent's turn may run, and past a point that is a
  // responsiveness limit rather than a tempo choice.
  const budgets = order.map((name) => PACES[name].turnBudget);
  assert.ok(budgets[0] >= budgets.at(-1), "a slower pace must not get less room");

  // Backlog is the exception and runs the other way: a faster pace tolerates
  // more unplayed shots, because that is what running ahead means.
  assert.ok(PACES.fast.backlog > PACES.slow.backlog);
  assert.ok(PACES.slow.backlog <= 1, "slow keeps the edit nearly level with the duel");
});

test("slow stretches holds and fast compresses them", () => {
  assert.ok(PACES.slow.hold > 1, "a slow cut holds longer than the grammar's own timing");
  assert.ok(PACES.fast.hold < 1);
});

test("even the fastest pace gives the AI more room than tactical mode", () => {
  assert.ok(PACES.fast.turnBudget >= 4000, "watching is still the point");
});

test("no pace can hold the player's controls for more than a moment", () => {
  // The original slow pace waited nine seconds an action, which killed the
  // controls for most of an opponent's turn and read as a freeze.
  assert.ok(INPUT_CAP_MS <= 1500, `${INPUT_CAP_MS}ms of dead controls is a freeze`);
  for (const [name, pace] of Object.entries(PACES)) {
    assert.ok(pace.settleCap <= 4000, `${name} holds the engine for ${pace.settleCap}ms`);
  }
});
