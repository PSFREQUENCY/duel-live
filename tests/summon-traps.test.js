// Four traps wait on a summon. Nothing ever opened that window, so Trap Hole,
// Crush Card Virus, Gravity Bind and Dust Tornado sat in three of the four
// decks and could never do anything.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyAction, canAttack, createDuel, gravityBindLevel, respondToTrapWindow, setPhase,
} from "../src/duel-engine.js";
import { CARDS } from "../src/cards/index.js";
import { makeInstance, monstersOn } from "../src/duel-state.js";
import { playDuel } from "../scripts/selfplay.mjs";

function armed(trapId, matchup = "yugi-kaiba") {
  const state = createDuel(matchup, { seed: 4 });
  const trap = makeInstance(trapId, state.sides.opponent.duelistId);
  trap.faceDown = true;
  state.sides.opponent.backrow[0] = trap;
  return { state, trap };
}

function summon(state, monsterId, { set = false } = {}) {
  const inst = makeInstance(monsterId, state.sides.player.duelistId);
  state.sides.player.hand = [inst];
  return applyAction(state, { type: set ? "set" : "summon", uid: inst.uid, set });
}

test("summoning a monster opens a response window for the opponent", () => {
  const { state } = armed("trapHole");
  const { state: after } = summon(state, "battleOx");
  assert.equal(after.pending?.kind, "trapWindow");
  assert.equal(after.pending.trigger, "onSummon");
  assert.equal(after.pending.side, "opponent", "the opponent responds, not the summoner");
});

test("Trap Hole destroys the monster that was just summoned", () => {
  const { state, trap } = armed("trapHole");
  const paused = summon(state, "battleOx").state;
  const after = respondToTrapWindow(paused, trap.uid).state;
  assert.equal(monstersOn(after, "player").length, 0);
  assert.deepEqual(after.sides.player.graveyard.map((g) => g.cardId), ["battleOx"]);
});

test("Trap Hole spares a monster under its threshold", () => {
  const { state, trap } = armed("trapHole");
  const paused = summon(state, "kuriboh").state;    // 300 ATK, below 1000
  const after = respondToTrapWindow(paused, trap.uid).state;
  assert.equal(monstersOn(after, "player").length, 1, "the trap is spent but cannot destroy it");
});

test("setting a monster is not a summon, so nothing triggers", () => {
  const { state } = armed("trapHole");
  const after = summon(state, "battleOx", { set: true }).state;
  assert.equal(after.pending, null, "a Set monster must not open a summon window");
  assert.equal(monstersOn(after, "player").length, 1);
});

test("declining the window leaves the monster and the trap alone", () => {
  const { state, trap } = armed("trapHole");
  const paused = summon(state, "battleOx").state;
  const after = respondToTrapWindow(paused, null).state;
  assert.equal(monstersOn(after, "player").length, 1);
  assert.equal(after.sides.opponent.backrow[0]?.uid, trap.uid, "an unused trap stays set");
});

test("Crush Card Virus costs a DARK monster with 1000 or less ATK", () => {
  // No fodder on Kaiba's field: the cost cannot be paid, so nothing happens.
  const bare = armed("crushCardVirus");
  const unpaid = respondToTrapWindow(summon(bare.state, "battleOx").state, bare.trap.uid).state;
  assert.equal(unpaid.sides.player.virusTurns, 0, "an unpayable cost means no effect");
  assert.equal(monstersOn(unpaid, "player").length, 1, "and the summon survives");

  const armedWithFodder = armed("crushCardVirus");
  armedWithFodder.state.sides.opponent.monsters[0] = makeInstance("saggi", "kaiba"); // DARK, 600
  const paused = summon(armedWithFodder.state, "battleOx").state;   // 1700, over the threshold
  const paid = respondToTrapWindow(paused, armedWithFodder.trap.uid).state;

  assert.equal(paid.sides.player.virusTurns, 3);
  assert.equal(monstersOn(paid, "player").length, 0, "Battle Ox is over 1500 ATK, so it goes");
  const kaibaGraveyard = paid.sides.opponent.graveyard.map((g) => g.cardId);
  assert.ok(kaibaGraveyard.includes("saggi"),
    "the tributed monster is the cost, and it must actually be paid");
  assert.ok(kaibaGraveyard.includes("crushCardVirus"), "the spent trap goes too");
});

test("Gravity Bind stops Level 4 and up from attacking", () => {
  const state = createDuel("joey-mai", { seed: 3 });
  const bind = makeInstance("gravityBind", "mai");
  state.sides.opponent.backrow[0] = bind;
  assert.equal(gravityBindLevel(state), 4);

  const big = makeInstance("gearfried", "joey");     // Level 4
  const small = makeInstance("timeWizard", "joey");  // Level 2
  state.sides.player.monsters[0] = big;
  state.sides.player.monsters[1] = small;
  const battle = setPhase({ ...state, turn: 3 }, "battle").state;
  assert.equal(canAttack(battle, "player", battle.sides.player.monsters[0]), false);
  assert.equal(canAttack(battle, "player", battle.sides.player.monsters[1]), true);
});

test("destroying Gravity Bind lifts the lock", () => {
  const state = createDuel("joey-mai", { seed: 3 });
  state.sides.opponent.backrow[0] = makeInstance("gravityBind", "mai");
  assert.equal(gravityBindLevel(state), 4);
  // The lock must be read off the card, not a flag that outlives it.
  state.sides.opponent.backrow[0] = null;
  assert.equal(gravityBindLevel(state), 0,
    "a lock that survives its own card would freeze the duel permanently");
});

test("a face-down Gravity Bind is not yet locking anything", () => {
  const state = createDuel("joey-mai", { seed: 3 });
  const bind = makeInstance("gravityBind", "mai");
  bind.faceDown = true;
  state.sides.opponent.backrow[0] = bind;
  assert.equal(gravityBindLevel(state), 0);
});

test("every summon-triggered trap can actually fire in a real duel", () => {
  const fired = new Set();
  for (const matchup of ["yugi-kaiba", "joey-mai"]) {
    for (let seed = 0; seed < 150; seed += 1) {
      for (const event of playDuel(matchup, 3000 + seed).events) {
        if (event.type === "activate" && event.reveal) fired.add(event.card);
      }
    }
  }
  for (const id of Object.keys(CARDS)) {
    const card = CARDS[id];
    if (card.kind !== "trap" || card.trigger !== "onSummon") continue;
    assert.ok(fired.has(card.name), `${card.name} never fires — it is dead weight in the deck`);
  }
});

test("duels still reach a result once the locks are working", () => {
  for (const matchup of ["yugi-kaiba", "joey-mai"]) {
    let finished = 0;
    for (let seed = 0; seed < 30; seed += 1) {
      if (playDuel(matchup, 5000 + seed).state.winner) finished += 1;
    }
    assert.equal(finished, 30, `${matchup} left ${30 - finished} duels unresolved`);
  }
});
