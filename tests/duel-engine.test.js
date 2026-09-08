import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyAction, canNormalSummon, createDuel, effectiveStats, endTurn,
  legalActions, respondToTrapWindow, setPhase, tributesRequired,
} from "../src/duel-engine.js";
import { makeInstance, monstersOn } from "../src/duel-state.js";
import { getCard } from "../src/cards/index.js";

const seed = (matchup = "yugi-kaiba") => createDuel(matchup, { seed: 4242 });

function put(state, side, cardId, extra = {}) {
  const inst = Object.assign(makeInstance(cardId, side), extra);
  state.sides[side].monsters[state.sides[side].monsters.indexOf(null)] = inst;
  return inst;
}

test("a fresh duel deals five cards and leaves 35 in each deck", () => {
  const state = seed();
  for (const side of ["player", "opponent"]) {
    assert.equal(state.sides[side].hand.length, 5);
    assert.equal(state.sides[side].deck.length, 35);
    assert.equal(state.sides[side].lp, 8000);
  }
});

test("tribute requirements follow level", () => {
  assert.equal(tributesRequired(getCard("celticGuardian")), 0);
  assert.equal(tributesRequired(getCard("summonedSkull")), 1);
  assert.equal(tributesRequired(getCard("blueEyes")), 2);
});

test("a level 7 monster cannot be summoned with an empty board", () => {
  const state = seed();
  const dm = makeInstance("darkMagician", "yugi");
  state.sides.player.hand = [dm];
  assert.equal(canNormalSummon(state, "player", dm.uid), false);
  put(state, "player", "celticGuardian");
  put(state, "player", "beaverWarrior");
  assert.equal(canNormalSummon(state, "player", dm.uid), true);
});

test("one normal summon per turn", () => {
  const state = seed();
  const a = makeInstance("celticGuardian", "yugi");
  const b = makeInstance("beaverWarrior", "yugi");
  state.sides.player.hand = [a, b];
  const after = applyAction(state, { type: "summon", uid: a.uid }).state;
  assert.equal(after.sides.player.normalSummonUsed, true);
  assert.equal(canNormalSummon(after, "player", b.uid), false);
});

test("attack position battle destroys the weaker monster and deals the difference", () => {
  const state = seed();
  state.phase = "battle";
  const attacker = put(state, "player", "darkMagician");     // 2500
  const defender = put(state, "opponent", "battleOx");        // 1700
  const { state: after, events } = applyAction(state, { type: "attack", uid: attacker.uid, targetUid: defender.uid });
  assert.equal(after.sides.opponent.lp, 8000 - 800);
  assert.equal(monstersOn(after, "opponent").length, 0);
  assert.ok(events.some((e) => e.type === "clash"));
});

test("attacking into a bigger monster destroys the attacker", () => {
  const state = seed();
  state.phase = "battle";
  const attacker = put(state, "player", "battleOx");          // 1700
  const defender = put(state, "opponent", "blueEyes");        // 3000
  const after = applyAction(state, { type: "attack", uid: attacker.uid, targetUid: defender.uid }).state;
  assert.equal(after.sides.player.lp, 8000 - 1300);
  assert.equal(monstersOn(after, "player").length, 0);
  assert.equal(monstersOn(after, "opponent").length, 1);
});

test("attacking into a higher DEF wall costs the attacker life points", () => {
  const state = seed();
  state.phase = "battle";
  const attacker = put(state, "player", "darkMagician");                        // 2500
  const wall = put(state, "opponent", "bigShieldGardna", { position: "defense" }); // 2600 DEF
  const after = applyAction(state, { type: "attack", uid: attacker.uid, targetUid: wall.uid }).state;
  assert.equal(after.sides.player.lp, 8000 - 100, "attacker's controller eats the difference");
  assert.equal(monstersOn(after, "opponent").length, 1, "the wall survives");
});

test("direct attack lands full ATK when the field is empty", () => {
  const state = seed();
  state.phase = "battle";
  const attacker = put(state, "player", "blueEyes");
  const { state: after, events } = applyAction(state, { type: "attack", uid: attacker.uid });
  assert.equal(after.sides.opponent.lp, 5000);
  assert.ok(events.some((e) => e.type === "directAttack" && e.damage === 3000));
});

test("reducing life points to zero ends the duel", () => {
  const state = seed();
  state.phase = "battle";
  state.sides.opponent.lp = 2000;
  const attacker = put(state, "player", "blueEyes");
  const after = applyAction(state, { type: "attack", uid: attacker.uid }).state;
  assert.equal(after.winner, "player");
  assert.equal(after.winReason, "lifePoints");
  assert.deepEqual(legalActions(after), [], "no legal actions after the duel ends");
});

test("an empty deck loses the duel on the next draw", () => {
  const state = seed();
  state.sides.opponent.deck = [];
  const after = endTurn(state).state;
  assert.equal(after.winner, "player");
  assert.equal(after.winReason, "deckout");
});

test("Buster Blader gains 500 ATK per Dragon the opponent controls", () => {
  const state = seed();
  const bb = put(state, "player", "busterBlader");
  assert.equal(effectiveStats(state, "player", bb).atk, 2600);
  put(state, "opponent", "blueEyes");
  put(state, "opponent", "curseOfDragon");
  assert.equal(effectiveStats(state, "player", bb).atk, 3600);
});

test("Harpie's Pet Dragon scales with each Harpie Lady on the field", () => {
  const state = createDuel("joey-mai", { seed: 9 });
  const pet = put(state, "opponent", "harpiesPetDragon");
  assert.equal(effectiveStats(state, "opponent", pet).atk, 2000);
  put(state, "opponent", "harpieLady");
  put(state, "opponent", "harpieGirl"); // treated as Harpie Lady
  assert.equal(effectiveStats(state, "opponent", pet).atk, 2600);
});

test("an attack opens a trap window and Mirror Force wipes the attackers", () => {
  const state = seed();
  state.phase = "battle";
  const attacker = put(state, "player", "darkMagician");
  const trap = makeInstance("mirrorForce", "kaiba");
  trap.faceDown = true;
  state.sides.opponent.backrow[0] = trap;

  const declared = applyAction(state, { type: "attack", uid: attacker.uid }).state;
  assert.equal(declared.pending?.kind, "trapWindow");
  assert.deepEqual(declared.pending.options, [trap.uid]);

  const after = respondToTrapWindow(declared, trap.uid).state;
  assert.equal(monstersOn(after, "player").length, 0, "the attacker is destroyed");
  assert.equal(after.sides.opponent.lp, 8000, "no damage gets through");
});

test("declining the trap window lets the attack resolve", () => {
  const state = seed();
  state.phase = "battle";
  const attacker = put(state, "player", "darkMagician");
  const trap = makeInstance("mirrorForce", "kaiba");
  trap.faceDown = true;
  state.sides.opponent.backrow[0] = trap;
  const declared = applyAction(state, { type: "attack", uid: attacker.uid }).state;
  const after = respondToTrapWindow(declared, null).state;
  assert.equal(after.sides.opponent.lp, 5500);
});

test("phase changes are reported and gated", () => {
  const state = seed();
  const { state: battle, events } = setPhase(state, "battle");
  assert.equal(battle.phase, "battle");
  assert.equal(events[0].type, "phase");
  assert.throws(() => setPhase(state, "nonsense"), /Unknown phase/);
});
