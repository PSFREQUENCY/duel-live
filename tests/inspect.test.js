// Reading a card must never contradict the rules engine: the hover panel and
// the graveyard both describe cards through one formatter.

import assert from "node:assert/strict";
import { test } from "node:test";

import { describeCard, rebornTarget } from "../src/card-detail.js";
import { CARDS } from "../src/cards/index.js";
import { applyAction, createDuel } from "../src/duel-engine.js";
import { makeInstance, monstersOn } from "../src/duel-state.js";

test("every card in the game produces a readable description", () => {
  for (const [id, card] of Object.entries(CARDS)) {
    const detail = describeCard(id);
    assert.equal(detail.name, card.name);
    assert.ok(detail.meta.length > 0, `${id} has no metadata line`);
    assert.ok(detail.text.length > 0, `${id} would show an empty panel`);
    assert.doesNotMatch(detail.text, /undefined|NaN|\[object/, `${id} has a broken description`);
    if (card.kind === "monster") {
      assert.ok(detail.stats, `${id} is a monster with no stats`);
    }
  }
});

test("a monster on the field shows its live stats, not its printed ones", () => {
  const state = createDuel("yugi-kaiba", { seed: 4 });
  const bb = makeInstance("busterBlader", "yugi");
  state.sides.player.monsters[0] = bb;

  const printed = describeCard("busterBlader");
  assert.equal(printed.stats.atk, 2600);
  assert.equal(printed.stats.modified, false);

  // Buster Blader gains 500 ATK per Dragon the opponent controls.
  state.sides.opponent.monsters[0] = makeInstance("blueEyes", "kaiba");
  const live = describeCard("busterBlader", { state, side: "player", inst: bb });
  assert.equal(live.stats.atk, 3100);
  assert.equal(live.stats.modified, true, "a buffed monster must be marked as changed");
});

test("a monster with no rules text still explains what makes it different", () => {
  assert.match(describeCard("busterBlader").text, /Gains 500 ATK for each Dragon/);
  assert.match(describeCard("harpiesPetDragon").text, /each Harpie Lady/);
  assert.match(describeCard("kaiserSeahorse").text, /two tributes/);
  assert.match(describeCard("harpieSisters").text, /Cannot be Normal Summoned/);
  assert.match(describeCard("blueEyesUltimate").text, /Fusion Summon with 3 materials/);
  assert.match(describeCard("amazonessSwordsWoman").text, /same battle damage/);
});

test("a trap says when it fires", () => {
  assert.equal(describeCard("mirrorForce").note, "Fires when you are attacked.");
  assert.equal(describeCard("trapHole").note, "Fires when a monster is summoned.");
});

test("position is reported so a set card reads as set", () => {
  const faceDown = describeCard("celticGuardian", { inst: { faceDown: true } });
  assert.equal(faceDown.note, "Face-down");
  const defending = describeCard("celticGuardian", { inst: { position: "defense" } });
  assert.equal(defending.note, "Defence Position");
});

test("Monster Reborn's target is the strongest monster in either graveyard", () => {
  const state = createDuel("yugi-kaiba", { seed: 6 });
  assert.equal(rebornTarget(state), null, "an empty graveyard has no target");

  state.sides.player.graveyard.push(makeInstance("celticGuardian", "yugi"));  // 1400
  assert.equal(rebornTarget(state).cardId, "celticGuardian");

  state.sides.opponent.graveyard.push(makeInstance("blueEyes", "kaiba"));     // 3000
  assert.equal(rebornTarget(state).cardId, "blueEyes", "either graveyard, not just your own");
});

test("the previewed target is the one Monster Reborn actually takes", () => {
  const state = createDuel("yugi-kaiba", { seed: 8 });
  state.sides.player.graveyard.push(makeInstance("celticGuardian", "yugi"));
  state.sides.opponent.graveyard.push(makeInstance("blueEyes", "kaiba"));
  const reborn = makeInstance("monsterReborn", "yugi");
  state.sides.player.hand = [reborn];

  const predicted = rebornTarget(state).cardId;
  const after = applyAction(state, { type: "activate", uid: reborn.uid }).state;
  assert.equal(monstersOn(after, "player")[0].cardId, predicted,
    "the graveyard preview would be lying if these differed");
});

test("spells and traps are never given monster stats", () => {
  for (const id of ["mirrorForce", "polymerization", "cyberShield"]) {
    assert.equal(describeCard(id).stats, null, `${id} should not show ATK/DEF`);
  }
});

test("tokens are excluded from revival targets", () => {
  const state = createDuel("joey-mai", { seed: 2 });
  state.sides.player.graveyard.push(makeInstance("sheepToken", "joey"));
  assert.equal(rebornTarget(state), null, "a token cannot be revived");
});
