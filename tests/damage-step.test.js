// WP2: the Damage Step. A battle is five sub-steps, and which one you are in
// decides what may be activated — that is what stops a trap retroactively
// saving a monster that has already been destroyed.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  allowsOptionalResponse, canActivateAt, DAMAGE_SUB_STEPS, nextSubStep, timingsFor,
} from "../src/duel-damage-step.js";
import { applyAction, createDuel, respondToChain, setPhase } from "../src/duel-engine.js";
import { legalResponses, openWindow } from "../src/duel-chain.js";
import { CARDS } from "../src/cards/index.js";
import { makeInstance, monstersOn } from "../src/duel-state.js";

function field({ attacker = "darkMagician", defender = null, faceDown = false } = {}) {
  const state = createDuel("yugi-kaiba", { seed: 4242 });
  state.turn = 3;
  state.phase = "battle";
  state.sides.player.hand = [];
  const atk = makeInstance(attacker, "yugi");
  state.sides.player.monsters[0] = atk;
  if (defender) {
    const def = makeInstance(defender, "kaiba");
    def.faceDown = faceDown;
    if (faceDown) def.position = "defense";
    state.sides.opponent.monsters[0] = def;
  }
  return { state, atk };
}

const subSteps = (events) => events.filter((e) => e.type === "damageStep").map((e) => e.subStep);

test("the sub-steps run in order and cover the whole Damage Step", () => {
  assert.deepEqual(DAMAGE_SUB_STEPS, [
    "ds_start", "ds_before_damage", "ds_calculation", "ds_after_damage", "ds_end",
  ]);
  let step = "ds_start";
  const walked = [step];
  while ((step = nextSubStep(step))) walked.push(step);
  assert.deepEqual(walked, DAMAGE_SUB_STEPS);
  assert.equal(nextSubStep("ds_end"), null);
});

test("a direct attack still visits every sub-step", () => {
  const { state, atk } = field();
  const { events } = applyAction(state, { type: "attack", uid: atk.uid });
  assert.deepEqual(subSteps(events), DAMAGE_SUB_STEPS,
    "forking the code for direct attacks is how retroactive-save bugs appear");
});

test("a battle against a monster visits the same sub-steps", () => {
  const { state, atk } = field({ defender: "battleOx" });
  const { events } = applyAction(state, { type: "attack", uid: atk.uid });
  assert.deepEqual(subSteps(events).slice(0, 3),
    ["ds_start", "ds_before_damage", "ds_calculation"]);
});

test("a face-down target is flipped at the start, not during calculation", () => {
  const { state, atk } = field({ defender: "bigShieldGardna", faceDown: true });
  const { events } = applyAction(state, { type: "attack", uid: atk.uid });
  const flipAt = events.findIndex((e) => e.type === "flip");
  const startAt = events.findIndex((e) => e.subStep === "ds_start");
  const calcAt = events.findIndex((e) => e.subStep === "ds_calculation");
  assert.ok(flipAt > startAt && flipAt < calcAt,
    "the target must be known before anything is compared");
});

test("battle damage is applied once, after calculation", () => {
  const { state, atk } = field();
  const { events, state: after } = applyAction(state, { type: "attack", uid: atk.uid });
  const damage = events.filter((e) => e.type === "damage");
  assert.equal(damage.length, 1, "damage must land exactly once per attack");
  assert.equal(after.sides.opponent.lp, 5500);
  const calcAt = events.findIndex((e) => e.subStep === "ds_calculation");
  assert.ok(events.indexOf(damage[0]) > calcAt, "damage follows calculation");
});

test("destruction is applied at the end, after damage", () => {
  const { state, atk } = field({ defender: "battleOx" });
  const { events } = applyAction(state, { type: "attack", uid: atk.uid });
  const destroyAt = events.findIndex((e) => e.type === "destroy");
  const damageAt = events.findIndex((e) => e.type === "damage");
  assert.ok(destroyAt > damageAt,
    "a monster is destroyed after the damage it caused, not before");
});

test("the sub-step is cleared once the battle is over", () => {
  const { state, atk } = field({ defender: "battleOx" });
  const { state: after } = applyAction(state, { type: "attack", uid: atk.uid });
  assert.ok(!after.damageSubStep, "a stale sub-step would keep the wrong cards legal");
});

// ------------------------------------------------------------- timings ---

test("a card declares when it may be activated; the engine reads it", () => {
  assert.ok(timingsFor(CARDS.mirrorForce).includes("ds_calculation"));
  assert.ok(!timingsFor(CARDS.darkHole).includes("ds_calculation"));
  assert.deepEqual(timingsFor(CARDS.darkHole), ["main1", "main2"]);
});

test("a Main Phase card cannot be activated in any Damage Step sub-step", () => {
  for (const subStep of DAMAGE_SUB_STEPS) {
    assert.equal(canActivateAt(CARDS.darkHole, subStep), false,
      `Dark Hole must not be legal during ${subStep}`);
    assert.equal(canActivateAt(CARDS.monsterReborn, subStep), false);
  }
});

test("only mandatory triggers may act once damage has been dealt", () => {
  assert.equal(allowsOptionalResponse("ds_start"), true);
  assert.equal(allowsOptionalResponse("ds_calculation"), true);
  assert.equal(allowsOptionalResponse("ds_after_damage"), false);
  assert.equal(allowsOptionalResponse("ds_end"), false);
});

test("chain legality follows the timing, not just the card type", () => {
  const state = createDuel("joey-mai", { seed: 2 });
  const quick = makeInstance("scapegoat", "joey");
  quick.faceDown = true;
  state.sides.player.backrow[0] = quick;

  // In a Main Phase the Quick-Play is live.
  state.phase = "main1";
  openWindow(state, "player", null, "main1");
  assert.equal(legalResponses(state, "player").length, 1);

  // Past damage calculation it is not.
  state.damageSubStep = "ds_after_damage";
  openWindow(state, "player", null, "battle_step");
  assert.deepEqual(legalResponses(state, "player"), [],
    "nothing optional may be activated after damage has been dealt");
});

test("a trap that answers attacks is legal at the timings it declares", () => {
  const { state } = field({ defender: "battleOx" });
  const trap = makeInstance("mirrorForce", "kaiba");
  trap.faceDown = true;
  state.sides.opponent.backrow[0] = trap;

  openWindow(state, "opponent", null, "battle_step");
  assert.equal(legalResponses(state, "opponent").length, 1);

  state.damageSubStep = "ds_calculation";
  openWindow(state, "opponent", null, "battle_step");
  assert.equal(legalResponses(state, "opponent").length, 1, "Mirror Force declares this timing");

  state.damageSubStep = "ds_end";
  openWindow(state, "opponent", null, "battle_step");
  assert.deepEqual(legalResponses(state, "opponent"), [], "but not once destruction is applied");
});

test("two attacks in one Battle Phase each run their own Damage Step", () => {
  const state = createDuel("yugi-kaiba", { seed: 4242 });
  state.turn = 3;
  state.phase = "battle";
  state.sides.player.hand = [];
  const first = makeInstance("celticGuardian", "yugi");
  const second = makeInstance("beaverWarrior", "yugi");
  state.sides.player.monsters[0] = first;
  state.sides.player.monsters[1] = second;

  const one = applyAction(state, { type: "attack", uid: first.uid });
  const two = applyAction(one.state, { type: "attack", uid: second.uid });
  assert.deepEqual(subSteps(one.events), DAMAGE_SUB_STEPS);
  assert.deepEqual(subSteps(two.events), DAMAGE_SUB_STEPS);
  assert.equal(two.state.sides.opponent.lp, 8000 - 1400 - 1200);
});
