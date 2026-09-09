// WP3: the chain. Cards do not resolve when activated — they stack, the other
// player answers, and the stack resolves backwards. The README used to name the
// absence of this as the project's top limitation.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSimultaneousChain, canChainTo, chainClosed, legalResponses, openChain,
  openWindow, PASS, resolutionOrder, respond, spellSpeed,
} from "../src/duel-chain.js";
import { applyAction, createDuel, respondToChain, setPhase } from "../src/duel-engine.js";
import { CARDS } from "../src/cards/index.js";
import { makeInstance, monstersOn } from "../src/duel-state.js";

const chainOf = (...speeds) => ({ links: speeds.map((spellSpeed) => ({ spellSpeed })) });

function attackWith(setup = {}) {
  const state = createDuel("yugi-kaiba", { seed: 4242 });
  state.turn = 3;
  state.phase = "battle";
  state.sides.player.hand = [];          // no surprise Quick-Plays
  const attacker = makeInstance("darkMagician", "yugi");
  state.sides.player.monsters[0] = attacker;
  for (const [side, ids] of Object.entries(setup)) {
    ids.forEach((id, i) => {
      const trap = makeInstance(id, state.sides[side].duelistId);
      trap.faceDown = true;
      state.sides[side].backrow[i] = trap;
    });
  }
  return { state, attacker };
}

// --------------------------------------------------------- spell speed ---

test("Spell Speed follows card type", () => {
  assert.equal(spellSpeed(CARDS.darkHole), 1, "a Normal Spell is Speed 1");
  assert.equal(spellSpeed(CARDS.swordsOfRevealingLight), 1, "so is a Continuous Spell");
  assert.equal(spellSpeed(CARDS.cyberShield), 1, "and an Equip Spell");
  assert.equal(spellSpeed(CARDS.scapegoat), 2, "a Quick-Play Spell is Speed 2");
  assert.equal(spellSpeed(CARDS.mirrorForce), 2, "and so is a Trap");
  assert.equal(spellSpeed(CARDS.negateAttack), 3, "a Counter Trap is Speed 3");
});

test("a Speed 1 spell cannot be added to a chain that already has a link", () => {
  assert.equal(canChainTo(CARDS.darkHole, chainOf()), true, "it may be Chain Link 1");
  assert.equal(canChainTo(CARDS.darkHole, chainOf(1)), false);
  assert.equal(canChainTo(CARDS.monsterReborn, chainOf(2)), false);
});

test("a Counter Trap can chain to a Counter Trap", () => {
  assert.equal(canChainTo(CARDS.negateAttack, chainOf(3)), true);
});

test("a Trap cannot chain to a Counter Trap", () => {
  assert.equal(canChainTo(CARDS.mirrorForce, chainOf(3)), false,
    "you may only chain to equal or lower Spell Speed");
  assert.equal(canChainTo(CARDS.mirrorForce, chainOf(2)), true);
});

// -------------------------------------------------------------- chains ---

test("two consecutive passes close the chain", () => {
  const state = createDuel("yugi-kaiba", { seed: 1 });
  const chain = openWindow(state, "opponent");
  assert.equal(chainClosed(chain), false);
  respond(state, "opponent", PASS);
  assert.equal(chainClosed(chain), false, "one pass is not enough");
  respond(state, "player", PASS);
  assert.equal(chainClosed(chain), true);
});

test("adding a link resets the pass count", () => {
  const state = createDuel("yugi-kaiba", { seed: 1 });
  const trap = makeInstance("mirrorForce", "kaiba");
  state.sides.opponent.backrow[0] = trap;
  const chain = openWindow(state, "player");
  respond(state, "player", PASS);
  respond(state, "opponent", trap);
  assert.equal(chain.passCount, 0, "a response restarts the count");
  assert.equal(chain.links.length, 1);
});

test("a three-link chain resolves 3, 2, 1", () => {
  const state = createDuel("yugi-kaiba", { seed: 1 });
  const cards = ["mirrorForce", "waboku", "negateAttack"].map((id, i) => {
    const inst = makeInstance(id, "yugi");
    inst.slot = i;
    return inst;
  });
  const chain = openChain(state, "player", cards[0]);
  respond(state, "opponent", cards[1]);
  respond(state, "player", cards[2]);
  assert.deepEqual(chain.links.map((l) => l.name),
    ["Mirror Force", "Waboku", "Negate Attack"]);
  assert.deepEqual(resolutionOrder(chain).map((l) => l.name),
    ["Negate Attack", "Waboku", "Mirror Force"],
    "the last card played is the first to resolve");
});

test("an attack opens a chain rather than resolving straight away", () => {
  const { state, attacker } = attackWith({ opponent: ["mirrorForce"] });
  const after = applyAction(state, { type: "attack", uid: attacker.uid }).state;
  assert.equal(after.pending?.kind, "chain");
  assert.equal(after.chain.trigger.kind, "attack");
  assert.equal(after.sides.opponent.lp, 8000, "no damage until the chain resolves");
});

test("a card already on the chain is not offered again", () => {
  const { state, attacker } = attackWith({ opponent: ["mirrorForce"] });
  const opened = applyAction(state, { type: "attack", uid: attacker.uid }).state;
  const trap = opened.sides.opponent.backrow[0];
  assert.equal(legalResponses(opened, "opponent").length, 1);
  respond(opened, "opponent", trap);
  assert.equal(legalResponses(opened, "opponent").length, 0,
    "a card waiting to resolve cannot be activated twice");
});

test("resolving in reverse means Link 2 lands before Link 1", () => {
  const { state, attacker } = attackWith({
    opponent: ["mirrorForce"], player: ["waboku"],
  });
  let step = applyAction(state, { type: "attack", uid: attacker.uid }).state;
  step = respondToChain(step, step.sides.opponent.backrow[0].uid).state;   // Link 1
  const result = respondToChain(step, step.sides.player.backrow[0].uid);   // Link 2

  const order = result.events.filter((e) => e.type === "activate").map((e) => e.card);
  assert.deepEqual(order, ["Waboku", "Mirror Force"]);
  assert.ok(result.events.some((e) => e.type === "chainStart"));
});

test("a window nobody can answer does not stop the game", () => {
  const { state, attacker } = attackWith();   // no traps anywhere
  const after = applyAction(state, { type: "attack", uid: attacker.uid }).state;
  assert.equal(after.pending, null, "an unanswerable window is no window at all");
  assert.equal(after.sides.opponent.lp, 5500, "the attack simply resolves");
});

test("passing on the window lets the attack through", () => {
  const { state, attacker } = attackWith({ opponent: ["mirrorForce"] });
  const opened = applyAction(state, { type: "attack", uid: attacker.uid }).state;
  const after = respondToChain(opened, null).state;
  assert.equal(after.sides.opponent.lp, 5500);
  assert.equal(after.chain, null);
});

test("a trap set this turn cannot be chained this turn", () => {
  const state = createDuel("yugi-kaiba", { seed: 1 });
  const trap = makeInstance("mirrorForce", "kaiba");
  trap.faceDown = true;
  trap.setOnTurn = state.turn;
  state.sides.opponent.backrow[0] = trap;
  openWindow(state, "opponent");
  assert.deepEqual(legalResponses(state, "opponent"), []);
});

test("a Quick-Play cannot be played from the hand on the opponent's turn", () => {
  const state = createDuel("joey-mai", { seed: 1 });
  state.activeSide = "player";
  state.sides.opponent.hand = [makeInstance("scapegoat", "mai")];
  openWindow(state, "opponent");
  assert.deepEqual(legalResponses(state, "opponent"), [],
    "a Quick-Play in hand is only live on your own turn");

  state.activeSide = "opponent";
  openWindow(state, "opponent");
  assert.equal(legalResponses(state, "opponent").length, 1);
});

test("legalResponses is empty for a player with nothing of Speed 2 or higher", () => {
  const state = createDuel("yugi-kaiba", { seed: 1 });
  state.sides.player.hand = [makeInstance("darkHole", "yugi")];   // Speed 1
  openWindow(state, "player");
  assert.deepEqual(legalResponses(state, "player"), []);
});

test("only the player whose window it is may respond", () => {
  const state = createDuel("yugi-kaiba", { seed: 1 });
  const trap = makeInstance("mirrorForce", "kaiba");
  trap.faceDown = true;
  state.sides.opponent.backrow[0] = trap;
  openWindow(state, "player");
  assert.deepEqual(legalResponses(state, "opponent"), [],
    "it is not their turn to answer yet");
});

// --------------------------------------------------------------- SEGOC ---

test("SEGOC puts the turn player's trigger on the chain first", () => {
  const triggers = [
    { id: "theirs", controller: "opponent" },
    { id: "mine", controller: "player" },
  ];
  const ordered = buildSimultaneousChain(triggers, "player");
  assert.deepEqual(ordered.map((t) => t.id), ["mine", "theirs"]);
});

test("SEGOC keeps each player's own triggers in the order they chose", () => {
  const triggers = [
    { id: "a", controller: "player" },
    { id: "x", controller: "opponent" },
    { id: "b", controller: "player" },
    { id: "y", controller: "opponent" },
  ];
  assert.deepEqual(
    buildSimultaneousChain(triggers, "player").map((t) => t.id),
    ["a", "b", "x", "y"],
  );
});
