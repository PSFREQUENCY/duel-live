// Every card that points somewhere lets the player decide where. The engine's
// old behaviour -- strongest monster, first matching host, weakest discard --
// is now only the fallback when there is no real choice to make.

import assert from "node:assert/strict";
import { test } from "node:test";

import { applyAction, createDuel, respondToTarget } from "../src/duel-engine.js";
import { autoTargets, needsChoice, targetOptions, targetSpecFor } from "../src/duel-targets.js";
import { CARDS } from "../src/cards/index.js";
import { makeInstance, monstersOn } from "../src/duel-state.js";

function board(state, side, ids) {
  for (const id of ids) {
    const inst = makeInstance(id, state.sides[side].duelistId);
    state.sides[side].monsters[state.sides[side].monsters.indexOf(null)] = inst;
  }
  return monstersOn(state, side);
}

function activate(cardId, { own = [], foe = [], graveyard = [], hand = [] } = {}) {
  const state = createDuel("yugi-kaiba", { seed: 11 });
  board(state, "player", own);
  board(state, "opponent", foe);
  for (const id of graveyard) state.sides.opponent.graveyard.push(makeInstance(id, "kaiba"));
  const card = makeInstance(cardId, "yugi");
  state.sides.player.hand = [card, ...hand.map((id) => makeInstance(id, "yugi"))];
  return { state, card, result: applyAction(state, { type: "activate", uid: card.uid }) };
}

test("Brain Control lets you choose which monster you take", () => {
  const { result } = activate("brainControl", { foe: ["blueEyes", "battleOx", "saggi"] });
  const pending = result.state.pending;
  assert.equal(pending?.kind, "target");
  assert.match(pending.prompt, /take control of/);
  assert.equal(pending.options.length, 3, "every enemy monster is on offer");
  assert.deepEqual(
    pending.options.map((o) => o.name).sort(),
    ["Battle Ox", "Blue-Eyes White Dragon", "Saggi the Dark Clown"],
  );
});

test("Brain Control takes the monster you picked, not the strongest", () => {
  const { result } = activate("brainControl", { foe: ["blueEyes", "battleOx", "saggi"] });
  const ox = result.state.pending.options.find((o) => o.name === "Battle Ox");
  const after = respondToTarget(result.state, [ox.uid]).state;
  assert.equal(monstersOn(after, "player")[0].cardId, "battleOx");
  assert.equal(
    monstersOn(after, "opponent").some((m) => m.cardId === "blueEyes"), true,
    "the monster you did not take stays where it was",
  );
});

test("Shrink lets you weaken either side's monster", () => {
  const { result } = activate("shrink", { own: ["celticGuardian"], foe: ["blueEyes"] });
  const pending = result.state.pending;
  assert.equal(pending.options.length, 2);
  assert.deepEqual(pending.options.map((o) => o.owner).sort(), ["opponent", "player"]);
});

test("an equip only offers monsters it is allowed to attach to", () => {
  const state = createDuel("joey-mai", { seed: 3 });
  board(state, "player", ["flameManipulator", "masaki", "babyDragon"]);
  const spec = targetSpecFor(CARDS.salamandra);           // FIRE monsters only
  const options = targetOptions(state, "player", spec, CARDS.salamandra);
  assert.deepEqual(options.map((o) => o.name), ["Flame Manipulator"]);
});

test("with only one legal target there is no prompt, it just resolves", () => {
  const { result } = activate("brainControl", { foe: ["battleOx"] });
  assert.equal(result.state.pending, null, "a forced choice is not a choice");
  assert.equal(monstersOn(result.state, "player")[0].cardId, "battleOx");
});

test("Dust Tornado lets you choose which backrow card to destroy", () => {
  const state = createDuel("joey-mai", { seed: 7 });
  state.sides.opponent.backrow[0] = makeInstance("mirrorForce", "mai");
  state.sides.opponent.backrow[1] = makeInstance("negateAttack", "mai");
  const tornado = makeInstance("dustTornado", "joey");
  state.sides.player.hand = [tornado];

  const paused = applyAction(state, { type: "activate", uid: tornado.uid }).state;
  assert.equal(paused.pending?.kind, "target");
  assert.equal(paused.pending.options.length, 2);
  const second = paused.pending.options[1].uid;
  const after = respondToTarget(paused, [second]).state;
  const left = after.sides.opponent.backrow.filter(Boolean);
  assert.equal(left.length, 1);
  assert.notEqual(left[0].uid, second, "the card you picked is the one destroyed");
});

test("De-Spell offers only Spells, because that is all it can destroy", () => {
  const state = createDuel("yugi-kaiba", { seed: 7 });
  state.sides.opponent.backrow[0] = makeInstance("mirrorForce", "kaiba");   // trap
  state.sides.opponent.backrow[1] = makeInstance("shrink", "kaiba");        // spell
  const spec = targetSpecFor(CARDS.despell);
  const options = targetOptions(state, "player", spec, CARDS.despell);
  assert.deepEqual(options.map((o) => o.name), ["Shrink"],
    "offering a Trap would be offering a target the card cannot destroy");
});

test("an under-filled required choice is refused rather than half-resolved", () => {
  const { result } = activate("brainControl", { foe: ["blueEyes", "battleOx"] });
  const after = respondToTarget(result.state, []).state;
  assert.equal(after.pending?.kind, "target", "the window stays open");
  assert.equal(monstersOn(after, "player").length, 0, "nothing was taken");
});

test("the automatic pick is what the engine used to do on its own", () => {
  const state = createDuel("yugi-kaiba", { seed: 5 });
  board(state, "opponent", ["saggi", "blueEyes", "battleOx"]);
  const spec = targetSpecFor(CARDS.brainControl);
  const auto = autoTargets(state, "player", spec, CARDS.brainControl);
  const strongest = monstersOn(state, "opponent")
    .sort((a, b) => CARDS[b.cardId].atk - CARDS[a.cardId].atk)[0];
  assert.deepEqual(auto, [strongest.uid], "the fallback still takes the strongest");
});

test("needsChoice is false when the options do not exceed the cost", () => {
  const state = createDuel("yugi-kaiba", { seed: 5 });
  const spec = targetSpecFor(CARDS.brainControl);
  assert.equal(needsChoice(state, "player", spec, CARDS.brainControl), false, "no monsters at all");
  board(state, "opponent", ["battleOx"]);
  assert.equal(needsChoice(state, "player", spec, CARDS.brainControl), false, "exactly one");
  board(state, "opponent", ["saggi"]);
  assert.equal(needsChoice(state, "player", spec, CARDS.brainControl), true, "now there is a decision");
});

test("every card that points somewhere has a spec, and every spec has a prompt", () => {
  const pointing = ["brainControl", "monsterReborn", "shrink", "despell", "dustTornado",
    "ringOfDestruction", "salamandra", "cyberShield", "roseWhip", "gracefulCharity",
    "fluteOfSummoningDragon"];
  for (const id of pointing) {
    const spec = targetSpecFor(CARDS[id]);
    assert.ok(spec, `${id} points somewhere but declares no target spec`);
    assert.ok(spec.prompt?.length > 8, `${id} has no usable prompt`);
    assert.ok(spec.count >= 1, `${id} asks for ${spec.count} targets`);
  }
});

test("effects that hit everything are never turned into a choice", () => {
  for (const id of ["darkHole", "featherDuster", "giantTrunade", "swordsOfRevealingLight",
    "scapegoat", "potOfGreed", "mirrorForce", "waboku"]) {
    assert.equal(targetSpecFor(CARDS[id]), null, `${id} should not prompt for a target`);
  }
});
