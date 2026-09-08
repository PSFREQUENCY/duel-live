import assert from "node:assert/strict";
import { test } from "node:test";

import { BANTER, REPLY_FOR, SITUATIONS } from "../src/banter-lines.js";
import { closingExchange, directBanter, openingExchange, situationFor } from "../src/banter.js";
import { createDuel } from "../src/duel-engine.js";
import { DUELISTS } from "../src/duelists.js";

const yugiKaiba = createDuel("yugi-kaiba", { seed: 5 });
const joeyMai = createDuel("joey-mai", { seed: 5 });
const fixed = (n) => () => n;

test("every duelist has a line for every situation and every reply", () => {
  for (const id of Object.keys(DUELISTS)) {
    assert.ok(BANTER[id], `${id} has no banter at all`);
    for (const situation of SITUATIONS) {
      const lines = BANTER[id].say[situation];
      assert.ok(lines?.length, `${id} is missing say.${situation}`);
      assert.ok(lines.every((l) => l.trim().length > 8), `${id}.${situation} has an empty line`);
    }
    for (const key of Object.values(REPLY_FOR)) {
      assert.ok(BANTER[id].reply[key]?.length, `${id} is missing reply.${key}`);
    }
  }
});

test("summoning your ace is an ace moment, not a generic one", () => {
  assert.equal(situationFor({ type: "summon", side: "player", card: "Dark Magician", how: "normal", atk: 2500 }, yugiKaiba), "ace");
  assert.equal(situationFor({ type: "summon", side: "opponent", card: "Blue-Eyes White Dragon", how: "normal", atk: 3000 }, yugiKaiba), "ace");
  assert.equal(situationFor({ type: "summon", side: "player", card: "Red-Eyes Black Dragon", how: "normal", atk: 2400 }, joeyMai), "ace");
});

test("quiet beats stay quiet", () => {
  for (const event of [
    { type: "summon", side: "player", card: "Kuriboh", how: "normal", atk: 300 },
    { type: "summon", side: "player", card: "Sheep Token", how: "token", atk: 0 },
    { type: "summon", side: "player", card: "Celtic Guardian", how: "set", faceDown: true },
    { type: "draw", side: "player", card: "Beaver Warrior" },
    { type: "damage", side: "player", amount: 300, lp: 7700 },
  ]) {
    assert.equal(situationFor(event, yugiKaiba), null, `${event.card ?? event.type} should not trigger banter`);
  }
});

test("a big moment draws a reply from the other duelist", () => {
  const lines = directBanter(
    [{ type: "summon", side: "player", card: "Dark Magician", how: "normal", atk: 2500 }],
    yugiKaiba, fixed(0.3),
  );
  assert.equal(lines.length, 2, "the opponent should answer an ace summon");
  assert.equal(lines[0].duelistId, "yugi");
  assert.equal(lines[1].duelistId, "kaiba");
  assert.equal(lines[1].situation, "vsAce");
});

test("a high roll suppresses the reply so it is not always a duet", () => {
  const lines = directBanter(
    [{ type: "summon", side: "opponent", card: "Blue-Eyes White Dragon", how: "normal", atk: 3000 }],
    yugiKaiba, fixed(0.9),
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0].duelistId, "kaiba");
});

test("{card} is substituted, never left in the line", () => {
  for (let i = 0; i < 40; i += 1) {
    const lines = directBanter(
      [{ type: "summon", side: "player", card: "Summoned Skull", how: "normal", atk: 2500 }],
      yugiKaiba, Math.random,
    );
    for (const line of lines) assert.doesNotMatch(line.text, /\{card\}/, "placeholder leaked into a spoken line");
  }
});

test("banter never speaks for a side that did not act", () => {
  const lines = directBanter(
    [{ type: "activate", side: "opponent", card: "Mirror Force", reveal: true }],
    yugiKaiba, fixed(0.3),
  );
  assert.equal(lines[0].side, "opponent");
  assert.equal(lines[0].duelistId, "kaiba");
});

test("both duelists open and both close", () => {
  const open = openingExchange(yugiKaiba);
  assert.deepEqual(open.map((l) => l.duelistId), ["yugi", "kaiba"]);
  assert.deepEqual(closingExchange(yugiKaiba), [], "no closing lines before there is a winner");
  const won = { ...yugiKaiba, winner: "player" };
  const close = closingExchange(won);
  assert.equal(close.length, 2);
  assert.equal(close[0].situation, "win");
  assert.equal(close[1].situation, "lose");
});

test("mood lines only fire when a duelist is genuinely ahead, behind, or low", () => {
  const even = directBanter([], yugiKaiba, fixed(0.01));
  assert.deepEqual(even, [], "an even duel has nothing to gloat about");
  const behind = structuredClone(yugiKaiba);
  behind.sides.player.lp = 1200;
  const lines = directBanter([], behind, fixed(0.01));
  assert.equal(lines.length, 1);
  assert.ok(BANTER.yugi.say.low.includes(lines[0].text));
});
