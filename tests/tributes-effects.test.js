// Two things a player must be able to see and decide: which monsters they give
// up, and how long a continuing effect still has to run.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyAction, createDuel, defaultTributes, endTurn, respondToTribute, tributesCover,
} from "../src/duel-engine.js";
import { activeEffects, effectSummary } from "../src/duel-effects-active.js";
import { applyEffect } from "../src/duel-effects.js";
import { CARDS } from "../src/cards/index.js";
import { makeInstance, monstersOn, mulberry32 } from "../src/duel-state.js";

const ctx = () => ({ events: [], rng: mulberry32(1), negateAttack: false, endBattlePhase: false });

function withField(ids, matchup = "yugi-kaiba") {
  const state = createDuel(matchup, { seed: 5 });
  for (const id of ids) {
    const inst = makeInstance(id, state.sides.player.duelistId);
    state.sides.player.monsters[state.sides.player.monsters.indexOf(null)] = inst;
  }
  return state;
}

// ------------------------------------------------------------- tributes ---

test("a tribute summon with a real choice asks instead of picking for you", () => {
  const state = withField(["celticGuardian", "beaverWarrior", "bigShieldGardna"]);
  const dm = makeInstance("darkMagician", "yugi");
  state.sides.player.hand = [dm];

  const { state: after } = applyAction(state, { type: "summon", uid: dm.uid });
  assert.equal(after.pending?.kind, "tribute");
  assert.equal(after.pending.need, 2);
  assert.equal(after.pending.card, "Dark Magician");
  assert.equal(after.pending.options.length, 3);
  assert.equal(after.sides.player.hand.length, 1, "the card waits in hand until the choice is made");
  assert.equal(monstersOn(after, "player").length, 3, "nothing is tributed before you choose");
});

test("the monsters you pick are the ones that go", () => {
  const state = withField(["celticGuardian", "beaverWarrior", "bigShieldGardna"]);
  const dm = makeInstance("darkMagician", "yugi");
  state.sides.player.hand = [dm];
  const paused = applyAction(state, { type: "summon", uid: dm.uid }).state;
  const [first, , third] = paused.pending.options;

  const after = respondToTribute(paused, [first, third]).state;
  const field = monstersOn(after, "player").map((m) => m.cardId);
  assert.deepEqual(field.sort(), ["beaverWarrior", "darkMagician"],
    "the monster you did not pick must survive");
  assert.deepEqual(
    after.sides.player.graveyard.map((g) => g.cardId).sort(),
    ["bigShieldGardna", "celticGuardian"],
  );
  assert.equal(after.pending, null);
});

test("an under-paid tribute is refused rather than half-applied", () => {
  const state = withField(["celticGuardian", "beaverWarrior", "bigShieldGardna"]);
  const dm = makeInstance("darkMagician", "yugi");
  state.sides.player.hand = [dm];
  const paused = applyAction(state, { type: "summon", uid: dm.uid }).state;

  const after = respondToTribute(paused, [paused.pending.options[0]]).state;
  assert.equal(after.pending?.kind, "tribute", "the window stays open");
  assert.equal(monstersOn(after, "player").length, 3, "nothing was tributed");
  assert.equal(after.sides.player.hand.length, 1, "the monster was not summoned");
});

test("with exactly enough monsters there is nothing to choose, so it just happens", () => {
  const state = withField(["celticGuardian", "beaverWarrior"]);
  const dm = makeInstance("darkMagician", "yugi");
  state.sides.player.hand = [dm];
  const after = applyAction(state, { type: "summon", uid: dm.uid }).state;
  assert.equal(after.pending, null, "no choice exists, so no prompt");
  assert.equal(monstersOn(after, "player")[0].cardId, "darkMagician");
});

test("Kaiser Sea Horse counts as two tributes for a LIGHT monster", () => {
  const state = createDuel("yugi-kaiba", { seed: 9 });
  const horse = makeInstance("kaiserSeahorse", "kaiba");
  state.sides.opponent.monsters[0] = horse;
  assert.equal(tributesCover(state, "opponent", [horse.uid], 2), true);
  assert.equal(tributesCover(state, "opponent", [], 2), false);
});

test("the default choice spends the weakest monsters and spares fusion material", () => {
  const state = withField(["gaia", "celticGuardian", "curseOfDragon"]);
  const chosen = defaultTributes(state, "player", 1);
  assert.equal(chosen.length, 1);
  const spent = monstersOn(state, "player").find((m) => m.uid === chosen[0]);
  // Gaia and Curse of Dragon fuse into Gaia the Dragon Champion, so the plain
  // Celtic Guardian should be the one given up.
  assert.equal(spent.cardId, "celticGuardian");
});

// ------------------------------------------------------- active effects ---

test("a timed effect reports how many turns it has left", () => {
  const state = createDuel("yugi-kaiba", { seed: 2 });
  applyEffect(state, "player", CARDS.swordsOfRevealingLight.effect, ctx());
  const swords = activeEffects(state, "player").find((e) => e.label === "Swords of Revealing Light");
  assert.equal(swords.turnsLeft, 3);
  assert.equal(swords.against, false, "it locks the opponent, so it is in your favour");
  assert.match(swords.detail, /Seto Kaiba cannot attack/);
});

test("the counter ticks down with the turns, and the effect leaves when it expires", () => {
  let state = createDuel("yugi-kaiba", { seed: 2 });
  applyEffect(state, "player", CARDS.swordsOfRevealingLight.effect, ctx());
  const left = () => activeEffects(state, "player").find((e) => e.id.startsWith("swords"))?.turnsLeft ?? 0;

  assert.equal(left(), 3);
  state = endTurn(state).state;            // opponent's turn — the locked side
  assert.equal(left(), 2);
  state = endTurn(endTurn(state).state).state;
  assert.equal(left(), 1);
  state = endTurn(endTurn(state).state).state;
  assert.equal(
    activeEffects(state, "player").some((e) => e.id.startsWith("swords")), false,
    "an expired effect must disappear from the rail, not sit at zero",
  );
});

test("an effect with no timer is reported as open-ended, not as zero turns", () => {
  const state = createDuel("yugi-kaiba", { seed: 2 });
  applyEffect(state, "player", CARDS.magicalHats.effect, ctx());
  const hats = activeEffects(state, "player").find((e) => e.label === "Magical Hats");
  assert.equal(hats.turnsLeft, null);
});

test("Crush Card Virus names the threshold it is enforcing", () => {
  const state = createDuel("yugi-kaiba", { seed: 2 });
  applyEffect(state, "opponent", CARDS.crushCardVirus.effect, ctx());
  const virus = activeEffects(state, "player").find((e) => e.label === "Crush Card Virus");
  assert.equal(virus.turnsLeft, 3);
  assert.equal(virus.against, true);
  assert.match(virus.detail, /1500\+ ATK/);
});

test("a clean board reports nothing rather than an empty rail", () => {
  const state = createDuel("joey-mai", { seed: 4 });
  assert.deepEqual(activeEffects(state, "player"), []);
  assert.equal(effectSummary(state, "player"), null);
});

test("the summary reports the soonest expiry across everything in play", () => {
  const state = createDuel("yugi-kaiba", { seed: 2 });
  applyEffect(state, "player", CARDS.swordsOfRevealingLight.effect, ctx());
  applyEffect(state, "opponent", CARDS.crushCardVirus.effect, ctx());
  state.sides.opponent.lockAttacksTurns = 1;
  const summary = effectSummary(state, "player");
  assert.equal(summary.count, 2);
  assert.equal(summary.soonest, 1);
});
