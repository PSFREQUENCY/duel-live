// The running commentary. Live mode hid the duel log, which left a player
// watching a monster get destroyed with nothing saying which, or by how much.

import assert from "node:assert/strict";
import { test } from "node:test";

import { recentLines } from "../src/ui/live/feed.js";
import { lineFor } from "../src/duel-log.js";
import { createDuel } from "../src/duel-engine.js";
import { playDuel } from "../scripts/selfplay.mjs";

const linesOf = (events, state) => events.map((e) => lineFor(e, state)).filter(Boolean);

test("the feed shows the end of the duel, not the beginning", () => {
  const { state, events } = playDuel("yugi-kaiba", 6);
  const lines = linesOf(events, state);
  const shown = recentLines(lines, 7);
  assert.ok(shown.length <= 7);
  assert.equal(shown.at(-1).text, lines.at(-1).text, "the newest line must be the last one");
});

test("turn headings survive; phase bookkeeping does not crowd them out", () => {
  const state = createDuel("yugi-kaiba", { seed: 1 });
  const lines = [
    lineFor({ type: "phase", phase: "battle", side: "player", turn: 3 }, state),
    lineFor({ type: "summon", side: "player", card: "Celtic Guardian", how: "normal", atk: 1400 }, state),
    lineFor({ type: "clash", side: "player", attacker: "Celtic Guardian", defender: "Battle Ox",
      attackerAtk: 1400, defenderValue: 1700, defenderPosition: "attack" }, state),
  ].filter(Boolean);
  const shown = recentLines(lines, 7);
  assert.ok(shown.some((l) => /Celtic Guardian/.test(l.text)), "the play itself must be shown");
});

test("a short duel is shown in full rather than padded", () => {
  const state = createDuel("yugi-kaiba", { seed: 1 });
  const lines = [lineFor({ type: "draw", side: "player", card: "Kuriboh" }, state)];
  assert.equal(recentLines(lines, 7).length, 1);
  assert.deepEqual(recentLines([], 7), []);
});

test("nulls in the log never reach the screen", () => {
  // lineFor returns null for bookkeeping events, and the feed is handed the
  // raw list.
  assert.deepEqual(recentLines([null, undefined], 7), []);
});

test("damage lines keep their arithmetic in the feed", () => {
  const state = createDuel("yugi-kaiba", { seed: 1 });
  const line = lineFor({
    type: "clash", side: "player", attacker: "Dark Magician", defender: "Battle Ox",
    attackerAtk: 2500, defenderValue: 1700, defenderPosition: "attack",
  }, state);
  const [shown] = recentLines([line], 7);
  assert.match(shown.text, /2500 vs .*1700/);
  assert.match(shown.detail, /800 damage/, "the number is the whole point of the line");
});

test("the line saying who won is never filtered out of the feed", () => {
  // An earlier version dropped structural lines that did not mention a phase,
  // which threw away the most important line in the duel.
  const { state, events } = playDuel("yugi-kaiba", 6);
  const lines = linesOf(events, state);
  const win = lines.at(-1);
  assert.match(win.text, /wins/, "this duel should end with a winner");
  assert.ok(recentLines(lines, 7).includes(win), "the result must reach the screen");
});
