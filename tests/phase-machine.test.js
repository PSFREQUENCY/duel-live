// WP1: the phase machine. The rail used to be Draw / Main / Battle / End, which
// collapsed Standby out of existence and made Main 2 unreachable — and with it
// the decision that gives the Battle Phase a cost.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  autoAdvance, canEnterBattlePhase, canTransition, isReachable, nextPhases,
  PHASES, TRANSITIONS,
} from "../src/duel-phases.js";
import {
  applyAction, createDuel, endTurn, excessHand, HAND_LIMIT, legalActions,
  respondToDiscard, setPhase, trapWindow,
} from "../src/duel-engine.js";
import { makeInstance, monstersOn } from "../src/duel-state.js";
import { playDuel } from "../scripts/selfplay.mjs";

const advance = (state, to) => setPhase(state, to).state;

test("every phase has at least one legal way out", () => {
  for (const phase of PHASES) {
    assert.ok(TRANSITIONS[phase]?.length > 0, `${phase} is a dead end`);
  }
});

test("there is no route from Main 1 straight to Main 2", () => {
  assert.equal(isReachable("main1", "main2"), false,
    "skipping the Battle Phase must forfeit the second Main Phase");
});

test("Main 2 is only ever entered from the Battle Phase", () => {
  const sources = PHASES.filter((phase) => isReachable(phase, "main2"));
  assert.deepEqual(sources, ["battle"]);
});

test("the player who goes first has no Battle Phase on turn 1", () => {
  const state = createDuel("yugi-kaiba", { seed: 3 });
  assert.equal(state.turn, 1);
  assert.equal(canEnterBattlePhase(state), false);
  assert.equal(canTransition(state, "battle"), false);
  assert.equal(setPhase(state, "battle").refused !== undefined, true);
  // Ending the turn is still available; that is the whole point of the edge.
  assert.equal(canTransition(state, "end"), true);
});

test("the player who goes first still holds five cards at Main 1", () => {
  const state = createDuel("yugi-kaiba", { seed: 3 });
  assert.equal(state.phase, "main1");
  assert.equal(state.sides.player.hand.length, 5,
    "the opening player does not draw on turn 1");
  assert.equal(state.sides.player.deck.length, 35);
});

test("from turn 2 the Battle Phase opens up", () => {
  let state = createDuel("yugi-kaiba", { seed: 3 });
  state = endTurn(state).state;
  assert.equal(state.turn, 2);
  assert.equal(canEnterBattlePhase(state), true);
  assert.equal(canTransition(state, "battle"), true);
});

test("Draw and Standby pass on their own; a Main Phase waits for the player", () => {
  assert.equal(autoAdvance({ phase: "draw" }), "standby");
  assert.equal(autoAdvance({ phase: "standby" }), "main1");
  assert.equal(autoAdvance({ phase: "main1" }), null);
  assert.equal(autoAdvance({ phase: "battle" }), null);
});

test("a turn walks Draw, Standby and Main 1 without being asked", () => {
  const state = endTurn(createDuel("yugi-kaiba", { seed: 3 })).state;
  assert.equal(state.phase, "main1", "the turn player arrives at Main 1, not Draw");
});

test("the Normal Summon is per turn, so declining it in Main 1 keeps it for Main 2", () => {
  let state = endTurn(endTurn(createDuel("yugi-kaiba", { seed: 3 })).state).state;
  const monster = makeInstance("celticGuardian", "yugi");
  state.sides.player.hand = [monster];

  state = advance(state, "battle");
  state = advance(state, "main2");
  assert.equal(state.phase, "main2");
  assert.ok(
    legalActions(state).some((a) => a.type === "summon" && a.uid === monster.uid),
    "a summon declined in Main 1 must still be available in Main 2",
  );
});

test("a Normal Summon spent in Main 1 is gone by Main 2", () => {
  let state = endTurn(endTurn(createDuel("yugi-kaiba", { seed: 3 })).state).state;
  const first = makeInstance("celticGuardian", "yugi");
  const second = makeInstance("beaverWarrior", "yugi");
  state.sides.player.hand = [first, second];

  state = applyAction(state, { type: "summon", uid: first.uid }).state;
  state = advance(advance(state, "battle"), "main2");
  assert.equal(
    legalActions(state).some((a) => a.type === "summon"), false,
    "one Normal Summon per turn, not one per Main Phase",
  );
});

test("a trap set this turn cannot be used this turn, but can next turn", () => {
  let state = createDuel("yugi-kaiba", { seed: 3 });
  const trap = makeInstance("mirrorForce", "yugi");
  state.sides.player.hand = [trap];
  state = applyAction(state, { type: "setBackrow", uid: trap.uid }).state;
  assert.equal(trapWindow(state, "player", "onAttack").length, 0,
    "a trap is not live the turn it is set");

  state = endTurn(endTurn(state).state).state;
  assert.equal(trapWindow(state, "player", "onAttack").length, 1);
});

test("a Set Spell can be used from the field, but a Quick-Play must wait", () => {
  let state = createDuel("joey-mai", { seed: 3 });
  const normal = makeInstance("giantTrunade", "joey");
  const quick = makeInstance("scapegoat", "joey");
  state.sides.player.hand = [normal, quick];
  state = applyAction(state, { type: "setBackrow", uid: normal.uid }).state;
  state = applyAction(state, { type: "setBackrow", uid: quick.uid }).state;

  const now = legalActions(state).filter((a) => a.type === "activate");
  assert.ok(now.some((a) => a.uid === normal.uid), "a set Normal Spell is usable at once");
  assert.ok(!now.some((a) => a.uid === quick.uid), "a Quick-Play is not");

  state = endTurn(endTurn(state).state).state;
  assert.ok(
    legalActions(state).some((a) => a.type === "activate" && a.uid === quick.uid),
    "the Quick-Play comes online next turn",
  );
});

test("the End Phase makes the player choose what to discard", () => {
  let state = createDuel("yugi-kaiba", { seed: 3 });
  for (let i = 0; i < 3; i += 1) state.sides.player.hand.push(makeInstance("kuriboh", "yugi"));
  assert.equal(excessHand(state), 8 - HAND_LIMIT);

  const paused = endTurn(state);
  assert.equal(paused.state.pending?.kind, "discard");
  assert.equal(paused.state.pending.need, 2, "eight cards means exactly two discards");
  assert.equal(paused.state.activeSide, "player", "the turn does not pass until it is answered");

  const short = respondToDiscard(paused.state, paused.state.pending.options.slice(0, 1));
  assert.equal(short.state.pending?.kind, "discard", "an under-filled choice is refused");

  const done = respondToDiscard(paused.state, paused.state.pending.options.slice(0, 2));
  assert.equal(done.state.sides.player.hand.length, HAND_LIMIT);
  assert.equal(done.state.activeSide, "opponent");
});

test("a hand at the limit passes the turn without asking", () => {
  const state = createDuel("yugi-kaiba", { seed: 3 });
  assert.equal(excessHand(state), 0);
  assert.equal(endTurn(state).state.pending, null);
});

test("across 200 duels, Main 2 is never reached without passing through Battle", () => {
  for (const matchup of ["yugi-kaiba", "joey-mai"]) {
    for (let seed = 0; seed < 100; seed += 1) {
      const { events } = playDuel(matchup, 7000 + seed);
      let sawBattle = false;
      for (const event of events) {
        if (event.type !== "phase") continue;
        if (event.phase === "draw") sawBattle = false;
        if (event.phase === "battle") sawBattle = true;
        if (event.phase === "main2") {
          assert.ok(sawBattle, `${matchup}/${seed}: reached Main 2 without a Battle Phase`);
        }
      }
    }
  }
});

test("no duel ever reports a phase outside the machine", () => {
  const seen = new Set();
  for (const { type, phase } of playDuel("joey-mai", 4242).events) {
    if (type === "phase") seen.add(phase);
  }
  for (const phase of seen) assert.ok(PHASES.includes(phase), `unknown phase ${phase}`);
  assert.ok(seen.has("standby"), "Standby must actually occur, not just exist in the table");
  assert.ok(seen.has("main2"), "Main 2 must actually occur");
});
