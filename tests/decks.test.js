import assert from "node:assert/strict";
import { test } from "node:test";

import { CARDS, getCard } from "../src/cards/index.js";
import { DUELISTS, MATCHUPS } from "../src/duelists.js";
import { playDuel } from "../scripts/selfplay.mjs";

test("every duelist runs a legal 40-card deck of real cards", () => {
  for (const [id, duelist] of Object.entries(DUELISTS)) {
    assert.equal(duelist.deck.length, 40, `${id} deck size`);
    for (const cardId of duelist.deck) assert.ok(CARDS[cardId], `${id} references unknown card ${cardId}`);
    const counts = duelist.deck.reduce((acc, c) => ({ ...acc, [c]: (acc[c] ?? 0) + 1 }), {});
    for (const [cardId, n] of Object.entries(counts)) {
      assert.ok(n <= 3, `${id} runs ${n} copies of ${cardId}; the limit is 3`);
    }
  }
});

test("Fusion Monsters live in the Extra Deck, never the main deck", () => {
  for (const [id, duelist] of Object.entries(DUELISTS)) {
    for (const cardId of duelist.deck) {
      assert.ok(!getCard(cardId).fusion, `${id} has fusion monster ${cardId} in the main deck`);
    }
    for (const cardId of duelist.extra) {
      assert.ok(getCard(cardId).fusion, `${id} has non-fusion ${cardId} in the extra deck`);
    }
  }
});

test("every Extra Deck fusion can actually be assembled from its own main deck", () => {
  for (const [id, duelist] of Object.entries(DUELISTS)) {
    for (const fusionId of duelist.extra) {
      for (const materialId of getCard(fusionId).fusion) {
        assert.ok(
          duelist.deck.includes(materialId),
          `${id} cannot make ${fusionId}: no ${materialId} in the deck`,
        );
      }
      assert.ok(duelist.deck.includes("polymerization"), `${id} has fusions but no Polymerization`);
    }
  }
});

test("each duelist has a full set of voice lines and an ace that is in their deck", () => {
  const required = ["open", "summon", "attack", "ace", "trap", "hurt", "win", "lose"];
  for (const [id, duelist] of Object.entries(DUELISTS)) {
    for (const key of required) assert.ok(duelist.lines[key], `${id} is missing the "${key}" line`);
    const inDeck = duelist.deck.includes(duelist.ace) || duelist.extra.includes(duelist.ace);
    assert.ok(inDeck, `${id}'s ace ${duelist.ace} is not in their deck`);
  }
});

test("both matchups reference real duelists and describe an arena", () => {
  assert.deepEqual(Object.keys(MATCHUPS), ["yugi-kaiba", "joey-mai"]);
  for (const [id, matchup] of Object.entries(MATCHUPS)) {
    assert.ok(DUELISTS[matchup.player], `${id} player`);
    assert.ok(DUELISTS[matchup.opponent], `${id} opponent`);
    assert.equal(matchup.lifePoints, 8000);
    assert.ok(matchup.arena.length > 30, `${id} needs a real arena description`);
  }
});

test("both duels reach a winner from many different openings", () => {
  for (const matchup of Object.keys(MATCHUPS)) {
    let finished = 0;
    for (let i = 0; i < 40; i += 1) {
      const { state } = playDuel(matchup, 3000 + i);
      if (state.winner) finished += 1;
    }
    assert.ok(finished >= 38, `${matchup} only finished ${finished}/40 duels`);
  }
});

test("life points never go negative and a duel always has a reason for ending", () => {
  for (const matchup of Object.keys(MATCHUPS)) {
    const { state } = playDuel(matchup, 999);
    assert.ok(state.sides.player.lp >= 0 && state.sides.opponent.lp >= 0);
    if (state.winner) assert.ok(["lifePoints", "deckout"].includes(state.winReason));
  }
});
