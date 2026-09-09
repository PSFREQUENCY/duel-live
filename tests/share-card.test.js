// The share card is the one artefact that leaves the app, so its numbers have
// to be defensible: every life point accounted for, nothing over-claimed.

import assert from "node:assert/strict";
import { test } from "node:test";

import { headline, statTiles, summariseDuel } from "../src/duel-stats.js";
import { FORMATS, getFormat, shareFilename, shareText } from "../src/share-card.js";
import { playDuel } from "../scripts/selfplay.mjs";
import { getMatchup } from "../src/duelists.js";

const duel = (matchup = "joey-mai", seed = 21) => {
  const { state, events } = playDuel(matchup, seed);
  return { state, events, stats: summariseDuel(events, state) };
};

test("every life point is accounted for in both directions", () => {
  let checked = 0;
  for (let seed = 1; seed <= 30; seed += 1) {
    for (const matchup of ["yugi-kaiba", "joey-mai"]) {
      const { state, stats } = duel(matchup, seed);
      if (!state.winner) continue;
      const start = getMatchup(matchup).lifePoints;
      for (const side of ["player", "opponent"]) {
        const accounted = stats.lifePoints[side] + stats.sides[side].damageTaken
          + stats.sides[side].lifePaid;
        assert.equal(accounted, start,
          `${matchup}/${seed} ${side}: ${accounted} does not reconcile to ${start}`);
      }
      checked += 1;
    }
  }
  assert.ok(checked > 40, `only reconciled ${checked} duels`);
});

test("damage dealt is exactly the damage the other side took", () => {
  const { stats } = duel();
  assert.equal(stats.sides.player.damageDealt, stats.sides.opponent.damageTaken);
  assert.equal(stats.sides.opponent.damageDealt, stats.sides.player.damageTaken);
});

test("a self-paid cost is not counted as damage anyone dealt", () => {
  const events = [
    { type: "damage", side: "player", amount: 800, lp: 7200, cause: "cost" },
    { type: "damage", side: "player", amount: 1000, lp: 6200, cause: "battle" },
  ];
  const state = { matchupId: "yugi-kaiba", winner: null, sides: {
    player: { lp: 6200, duelistId: "yugi" }, opponent: { lp: 8000, duelistId: "kaiba" } } };
  const stats = summariseDuel(events, state);
  assert.equal(stats.sides.player.lifePaid, 800);
  assert.equal(stats.sides.player.damageTaken, 1000);
  assert.equal(stats.sides.opponent.damageDealt, 1000, "the cost must not be credited to Kaiba");
});

test("the headline hit keeps the attack's real size, overkill included", () => {
  const events = [
    { type: "declare", side: "player", card: "Blue-Eyes White Dragon" },
    { type: "damage", side: "opponent", amount: 3000, lp: 0, cause: "battle" },
  ];
  const state = { matchupId: "yugi-kaiba", winner: "player", winReason: "lifePoints", sides: {
    player: { lp: 8000, duelistId: "yugi" }, opponent: { lp: 0, duelistId: "kaiba" } } };
  const stats = summariseDuel(events, state);
  assert.equal(stats.biggestHit.damage, 3000, "a 3000 ATK strike is still a 3000 ATK strike");
  assert.equal(stats.biggestHit.card, "Blue-Eyes White Dragon");
  // But only 200 life points existed to take, so the total must not claim 3000.
  assert.ok(stats.sides.opponent.damageTaken <= 8000);
});

test("the headline reflects how close the duel actually was", () => {
  const base = (lp) => ({
    matchupId: "yugi-kaiba", winner: "player", winReason: "lifePoints",
    sides: { player: { lp, duelistId: "yugi" }, opponent: { lp: 0, duelistId: "kaiba" } },
  });
  assert.match(headline(summariseDuel([], base(7600))), /without breaking a sweat/);
  assert.match(headline(summariseDuel([], base(400))), /by a hair/);
  assert.match(headline(summariseDuel([], base(4000))), /takes the duel/);
  const deckout = { ...base(3000), winReason: "deckout" };
  assert.match(headline(summariseDuel([], deckout)), /deck out/);
});

test("tiles are always populated and never exceed the card's room", () => {
  for (const matchup of ["yugi-kaiba", "joey-mai"]) {
    const { stats } = duel(matchup, 7);
    const tiles = statTiles(stats);
    assert.ok(tiles.length >= 4 && tiles.length <= 6, `${tiles.length} tiles`);
    for (const tile of tiles) {
      assert.ok(tile.label.length > 0 && tile.value.length > 0);
      assert.doesNotMatch(tile.value, /NaN|undefined|null/);
    }
  }
});

test("the share text states the result without inventing anything", () => {
  const { stats } = duel();
  const text = shareText(stats);
  assert.match(text, /Duel Live/);
  assert.match(text, new RegExp(String(stats.turns)));
  assert.doesNotMatch(text, /NaN|undefined/);
  if (stats.biggestHit?.card) assert.match(text, /Biggest hit/);
});

test("the filename identifies the duel and its format, and is filesystem-safe", () => {
  const { stats } = duel();
  for (const [id, expected] of [["landscape", "16x9"], ["portrait", "9x16"]]) {
    const name = shareFilename(stats, id);
    assert.match(name, new RegExp(`^duel-live-joey-mai-(player|opponent)-${expected}\\.png$`));
    assert.doesNotMatch(name, /[\s/\\:*?"<>|]/, `${id} filename is not filesystem-safe`);
  }
  assert.notEqual(shareFilename(stats, "landscape"), shareFilename(stats, "portrait"),
    "the two formats must not overwrite each other on disk");
});

test("both formats are exactly the aspect ratios they claim", () => {
  assert.equal((FORMATS.landscape.width / FORMATS.landscape.height).toFixed(4), (16 / 9).toFixed(4));
  assert.equal((FORMATS.portrait.width / FORMATS.portrait.height).toFixed(4), (9 / 16).toFixed(4));
  assert.equal(FORMATS.landscape.label, "16:9");
  assert.equal(FORMATS.portrait.label, "9:16");
  // Portrait is a taller, narrower canvas, so it gets fewer stat columns.
  assert.ok(FORMATS.portrait.columns < FORMATS.landscape.columns);
});

test("an unknown format falls back rather than producing a zero-sized canvas", () => {
  assert.equal(getFormat("nonsense").id, "landscape");
  assert.equal(getFormat(undefined).id, "landscape");
  for (const format of Object.values(FORMATS)) {
    assert.ok(format.width > 0 && format.height > 0);
  }
});

test("an unfinished duel produces a card that does not claim a winner", () => {
  const state = { matchupId: "yugi-kaiba", winner: null, sides: {
    player: { lp: 5000, duelistId: "yugi" }, opponent: { lp: 3000, duelistId: "kaiba" } } };
  const stats = summariseDuel([], state);
  assert.equal(stats.winner, null);
  assert.equal(stats.loser, null);
  assert.equal(headline(stats), "Duel in progress");
  assert.ok(statTiles(stats).length >= 4, "tiles must still render for a live duel");
});
