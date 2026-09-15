// Polymerization's recipe is written nowhere a player can see it. "Nothing to
// fuse" is accurate and useless; the question is always which cards, and where
// the missing one went.

import assert from "node:assert/strict";
import { test } from "node:test";

import { anyFusionReady, describeFusion, fusionOptions } from "../src/fusion-guide.js";
import { describeCard } from "../src/card-detail.js";
import { createDuel } from "../src/duel-engine.js";
import { makeInstance } from "../src/duel-state.js";
import { findFusion } from "../src/duel-effects.js";

const duel = () => createDuel("yugi-kaiba", { seed: 5 });

test("every fusion in the Extra Deck is listed, whether or not it is possible", () => {
  const state = duel();
  const rows = fusionOptions(state, "player");
  assert.equal(rows.length, state.sides.player.extra.length);
  for (const row of rows) {
    assert.ok(row.name);
    assert.ok(row.materials.length >= 2, `${row.name} has no recipe`);
    for (const material of row.materials) assert.ok(material.name);
  }
});

test("a recipe you can do right now is marked ready", () => {
  const state = duel();
  const fusion = state.sides.player.extra[0];
  const recipe = [...fusionOptions(state, "player").find((r) => r.uid === fusion.uid).materials];

  // Put every material in hand.
  state.sides.player.hand = recipe.map((m) => makeInstance(m.id, "yugi"));
  const row = fusionOptions(state, "player").find((r) => r.uid === fusion.uid);
  assert.equal(row.ready, true, describeFusion(row));
  assert.deepEqual(row.missing, []);
  assert.match(describeFusion(row), /ready/);
  assert.equal(anyFusionReady(state, "player"), true);
});

test("what is ready here is what the engine will actually accept", () => {
  const state = duel();
  const fusion = state.sides.player.extra[0];
  const recipe = fusionOptions(state, "player").find((r) => r.uid === fusion.uid).materials;
  state.sides.player.hand = recipe.map((m) => makeInstance(m.id, "yugi"));

  // The guide must not promise something findFusion would refuse.
  const ids = state.sides.player.hand.map((inst) => inst.cardId);
  assert.ok(findFusion(ids, state.sides.player.extra), "the engine disagrees with the guide");
});

test("a missing material is named, and so is where it went", () => {
  const state = duel();
  const row = fusionOptions(state, "player").find((r) => !r.ready);
  assert.ok(row, "seed 5 should start with at least one impossible fusion");
  assert.ok(row.missing.length);
  assert.match(describeFusion(row), /missing|you have none/);
});

test("a material already in the graveyard does not count as available", () => {
  const state = duel();
  const fusion = state.sides.player.extra[0];
  const recipe = fusionOptions(state, "player").find((r) => r.uid === fusion.uid).materials;
  state.sides.player.hand = [];
  state.sides.player.graveyard = recipe.map((m) => makeInstance(m.id, "yugi"));

  const row = fusionOptions(state, "player").find((r) => r.uid === fusion.uid);
  assert.equal(row.ready, false, "a fused-away material is not a material you have");
  assert.equal(row.materials.every((m) => m.place === "graveyard"), true);
});

test("a recipe needing two of a card is not satisfied by one", () => {
  const state = createDuel("yugi-kaiba", { seed: 5 });
  // Kaiba's Blue-Eyes Ultimate needs three copies.
  const rows = fusionOptions(state, "opponent");
  const triple = rows.find((r) => r.materials.length === 3);
  if (!triple) return;
  state.sides.opponent.hand = [makeInstance(triple.materials[0].id, "kaiba")];
  const row = fusionOptions(state, "opponent").find((r) => r.uid === triple.uid);
  assert.equal(row.ready, false);
  assert.equal(row.missing.length, 2, "one copy must not satisfy three");
});

test("ready fusions sort above the ones you are one card short of", () => {
  const state = duel();
  const fusion = state.sides.player.extra.at(-1);
  const recipe = fusionOptions(state, "player").find((r) => r.uid === fusion.uid).materials;
  state.sides.player.hand = recipe.map((m) => makeInstance(m.id, "yugi"));
  const rows = fusionOptions(state, "player");
  assert.equal(rows[0].ready, true, "the one you can actually do belongs first");
});

test("the recipe reaches the card panel, where the player is looking", () => {
  const state = duel();
  const detail = describeCard("polymerization", { state, side: "player" });
  assert.ok(detail.fusions?.length, "Polymerization's panel must carry its recipes");
  for (const row of detail.fusions) assert.match(row.line, / \+ /, "a recipe needs its materials");

  // An ordinary card gets no list; this is specific to what fuses.
  assert.equal(describeCard("darkHole", { state, side: "player" }).fusions, undefined);
});
