import assert from "node:assert/strict";
import { test } from "node:test";

import { applyAction, createDuel } from "../src/duel-engine.js";
import { applyEffect, findFusion, SUPPORTED_OPS } from "../src/duel-effects.js";
import { makeInstance, monstersOn, mulberry32 } from "../src/duel-state.js";
import { CARDS } from "../src/cards/index.js";

const seed = (m = "yugi-kaiba") => createDuel(m, { seed: 77 });
const ctx = (state) => ({ events: [], rng: mulberry32(3), negateAttack: false, endBattlePhase: false });

function put(state, side, cardId, extra = {}) {
  const inst = Object.assign(makeInstance(cardId, side), extra);
  state.sides[side].monsters[state.sides[side].monsters.indexOf(null)] = inst;
  return inst;
}

test("every card effect op has an implementation", () => {
  const used = new Set(Object.values(CARDS).map((c) => c.effect?.op).filter(Boolean));
  const missing = [...used].filter((op) => !SUPPORTED_OPS.includes(op));
  assert.deepEqual(missing, [], `unimplemented ops: ${missing.join(", ")}`);
});

test("Dark Hole clears both sides of the field", () => {
  const state = seed();
  put(state, "player", "darkMagician");
  put(state, "opponent", "blueEyes");
  put(state, "opponent", "battleOx");
  applyEffect(state, "player", CARDS.darkHole.effect, ctx(state));
  assert.equal(monstersOn(state, "player").length, 0);
  assert.equal(monstersOn(state, "opponent").length, 0);
  assert.equal(state.sides.opponent.graveyard.length, 2);
});

test("Pot of Greed draws exactly two cards", () => {
  const state = seed();
  const before = state.sides.player.hand.length;
  applyEffect(state, "player", CARDS.potOfGreed.effect, ctx(state));
  assert.equal(state.sides.player.hand.length, before + 2);
});

test("Graceful Charity draws three then discards two", () => {
  const state = seed();
  const before = state.sides.player.hand.length;
  applyEffect(state, "player", CARDS.gracefulCharity.effect, ctx(state));
  assert.equal(state.sides.player.hand.length, before + 1);
  assert.equal(state.sides.player.graveyard.length, 2);
});

test("Scapegoat puts four defence tokens on the field", () => {
  const state = createDuel("joey-mai", { seed: 5 });
  applyEffect(state, "player", CARDS.scapegoat.effect, ctx(state));
  const tokens = monstersOn(state, "player");
  assert.equal(tokens.length, 4);
  assert.ok(tokens.every((t) => t.position === "defense" && t.cardId === "sheepToken"));
});

test("Monster Reborn revives the strongest monster in either graveyard", () => {
  const state = seed();
  state.sides.opponent.graveyard.push(makeInstance("blueEyes", "kaiba"));
  state.sides.player.graveyard.push(makeInstance("celticGuardian", "yugi"));
  applyEffect(state, "player", CARDS.monsterReborn.effect, ctx(state));
  assert.equal(monstersOn(state, "player")[0].cardId, "blueEyes");
});

test("findFusion matches Blue-Eyes Ultimate Dragon from three Blue-Eyes", () => {
  const extra = [makeInstance("blueEyesUltimate", "kaiba")];
  assert.equal(findFusion(["blueEyes", "blueEyes", "blueEyes"], extra)?.cardId, "blueEyesUltimate");
  assert.equal(findFusion(["blueEyes", "blueEyes"], extra), null, "two is not enough");
});

test("Polymerization fuses Flame Swordsman out of the hand", () => {
  const state = createDuel("joey-mai", { seed: 3 });
  state.sides.player.hand = [
    makeInstance("flameManipulator", "joey"),
    makeInstance("masaki", "joey"),
    makeInstance("polymerization", "joey"),
  ];
  const poly = state.sides.player.hand[2];
  const after = applyAction(state, { type: "activate", uid: poly.uid }).state;
  assert.equal(monstersOn(after, "player")[0].cardId, "flameSwordsman");
  assert.equal(after.sides.player.graveyard.filter((c) => c.cardId === "masaki").length, 1);
});

test("Time Wizard plus Baby Dragon fuses into Thousand Dragon", () => {
  const state = createDuel("joey-mai", { seed: 8 });
  state.sides.player.hand = [
    makeInstance("babyDragon", "joey"),
    makeInstance("timeWizard", "joey"),
    makeInstance("polymerization", "joey"),
  ];
  const poly = state.sides.player.hand[2];
  const after = applyAction(state, { type: "activate", uid: poly.uid }).state;
  assert.equal(monstersOn(after, "player")[0].cardId, "thousandDragon");
});

test("Elegant Egotist needs a Harpie Lady and pulls the Sisters from the deck", () => {
  const state = createDuel("joey-mai", { seed: 6 });
  const egotist = makeInstance("elegantEgotist", "mai");
  state.sides.opponent.hand = [egotist];
  assert.equal(state.sides.opponent.deck.some((c) => c.cardId === "harpieSisters"), true);
  put(state, "opponent", "harpieLady");
  applyEffect(state, "opponent", CARDS.elegantEgotist.effect, ctx(state));
  assert.ok(monstersOn(state, "opponent").some((m) => m.cardId === "harpieSisters"));
});

test("Brain Control costs 800 LP and borrows the biggest enemy monster", () => {
  const state = seed();
  put(state, "opponent", "blueEyes");
  put(state, "opponent", "saggi");
  applyEffect(state, "player", CARDS.brainControl.effect, ctx(state));
  assert.equal(state.sides.player.lp, 7200);
  assert.equal(monstersOn(state, "player")[0].cardId, "blueEyes");
});

test("Crush Card Virus destroys every strong monster the opponent controls", () => {
  const state = seed();
  put(state, "player", "blueEyes");
  put(state, "player", "celticGuardian"); // 1400, under the 1500 threshold
  applyEffect(state, "opponent", CARDS.crushCardVirus.effect, ctx(state));
  const left = monstersOn(state, "player");
  assert.equal(left.length, 1);
  assert.equal(left[0].cardId, "celticGuardian");
});

test("Swords of Revealing Light locks the opponent out of attacking", () => {
  const state = seed();
  applyEffect(state, "player", CARDS.swordsOfRevealingLight.effect, ctx(state));
  assert.equal(state.sides.opponent.lockAttacksTurns, 3);
});

test("Harpie's Feather Duster clears only the opponent's backrow", () => {
  const state = createDuel("joey-mai", { seed: 2 });
  state.sides.player.backrow[0] = makeInstance("waboku", "joey");
  state.sides.opponent.backrow[0] = makeInstance("mirrorWall", "mai");
  applyEffect(state, "opponent", CARDS.featherDuster.effect, ctx(state));
  assert.equal(state.sides.player.backrow.filter(Boolean).length, 0);
  assert.equal(state.sides.opponent.backrow.filter(Boolean).length, 1);
});
