// WP4: the board. Zones have stable ids so the storyboard, the animation layer
// and the targeting interface all address the same thing by name — and the two
// monster rows must meet across the centre line, or every combat animation
// reads backwards.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  boardSnapshot, CENTRE_LINE_AFTER, locate, MONSTER_ZONES, parseZoneId, ROW_ORDER,
  SPELL_TRAP_ZONES, zoneId, ZONE_KINDS,
} from "../src/duel-board.js";
import { createDuel } from "../src/duel-engine.js";
import { makeInstance } from "../src/duel-state.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("rows read top to bottom with the local player at the bottom", () => {
  assert.deepEqual(ROW_ORDER.map((row) => row.id),
    ["opponent-st", "opponent-mon", "player-mon", "player-st"]);
});

test("the two monster rows sit either side of the centre line", () => {
  const above = ROW_ORDER[CENTRE_LINE_AFTER];
  const below = ROW_ORDER[CENTRE_LINE_AFTER + 1];
  assert.equal(above.kind, "mon");
  assert.equal(below.kind, "mon");
  assert.notEqual(above.side, below.side,
    "monsters must face each other across the centre, not sit on the outside");
});

test("the rendered markup matches the row order the model declares", () => {
  const rendered = [...html.matchAll(/id="(foe|my)-(backrow|monsters)"/g)]
    .map(([, who, kind]) => `${who === "foe" ? "opponent" : "player"}-${kind === "monsters" ? "mon" : "st"}`);
  assert.deepEqual(rendered, ROW_ORDER.map((row) => row.id),
    "the DOM order is what a player actually sees, so it must match");
});

test("every zone has a stable id that round-trips", () => {
  for (const [side, prefix] of [["player", "p0"], ["opponent", "p1"]]) {
    assert.equal(zoneId(side, "mon", 2), `${prefix}.mon.2`);
    assert.equal(zoneId(side, "field"), `${prefix}.field`);
    for (const kind of ZONE_KINDS) {
      const id = zoneId(side, kind, kind === "mon" || kind === "st" ? 0 : undefined);
      const parsed = parseZoneId(id);
      assert.equal(parsed.side, side, `${id} did not round-trip`);
      assert.equal(parsed.kind, kind);
    }
  }
  assert.equal(parseZoneId("nonsense"), null);
  assert.equal(parseZoneId("p0.wardrobe.1"), null);
});

test("a card can be located by id wherever it sits", () => {
  const state = createDuel("yugi-kaiba", { seed: 1 });
  const monster = makeInstance("darkMagician", "yugi");
  state.sides.player.monsters[3] = monster;
  assert.equal(locate(state, monster.uid).id, "p0.mon.3");

  const trap = makeInstance("mirrorForce", "kaiba");
  state.sides.opponent.backrow[1] = trap;
  assert.equal(locate(state, trap.uid).id, "p1.st.1");

  const buried = makeInstance("kuriboh", "yugi");
  state.sides.player.graveyard.push(buried);
  assert.equal(locate(state, buried.uid).id, "p0.gy");

  assert.equal(locate(state, "nothing#0"), null);
});

test("the snapshot exposes every pile, including the ones that start empty", () => {
  const state = createDuel("joey-mai", { seed: 1 });
  const snapshot = boardSnapshot(state);
  assert.equal(snapshot.rows.length, 4);
  assert.equal(snapshot.rows[0].zones.length, SPELL_TRAP_ZONES);
  assert.equal(snapshot.rows[1].zones.length, MONSTER_ZONES);

  for (const side of ["player", "opponent"]) {
    const piles = snapshot.piles[side];
    for (const kind of ["field", "deck", "extra", "gy", "banished", "hand"]) {
      assert.ok(piles[kind], `${side} has no ${kind}`);
      assert.ok(piles[kind].id.startsWith(side === "player" ? "p0." : "p1."));
    }
    assert.equal(piles.banished.count, 0, "banished starts empty");
    assert.equal(piles.field.inst, null, "no Field Spell to begin with");
  }
  assert.equal(snapshot.piles.player.extra.count, 3, "Joey runs three fusions");
});

test("the Extra Deck is visible to its owner and countable by the opponent", () => {
  const state = createDuel("yugi-kaiba", { seed: 1 });
  const snapshot = boardSnapshot(state);
  assert.ok(Array.isArray(snapshot.piles.player.extra.cards));
  assert.equal(snapshot.piles.player.extra.cards.length, snapshot.piles.player.extra.count);
  assert.ok(snapshot.piles.opponent.extra.count >= 1,
    "an opponent's Extra Deck is a number, and the number is real");
});

test("both player strips show the same counters, so neither is missing a pile", () => {
  for (const suffix of ["hand", "deck", "gy", "extra", "banished"]) {
    assert.ok(html.includes(`id="me-${suffix}"`), `player strip has no ${suffix}`);
    assert.ok(html.includes(`id="foe-${suffix}"`), `opponent strip has no ${suffix}`);
  }
});

test("the zone array is shaped so Extra Monster Zones can be added later", () => {
  assert.ok(ZONE_KINDS.includes("mon"));
  assert.equal(MONSTER_ZONES, 5);
  assert.equal(SPELL_TRAP_ZONES, 5);
  // Zones are addressed by id, not by index into one flat list, so adding a
  // row later does not renumber anything that already exists.
  assert.notEqual(zoneId("player", "mon", 0), zoneId("player", "st", 0));
});
