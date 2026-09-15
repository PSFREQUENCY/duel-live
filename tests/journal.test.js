// The record of what happened, so a bug can be looked at rather than remembered.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createJournal, snapshotOf, summarise } from "../src/journal.js";
import { createDuel } from "../src/duel-engine.js";
import { makeInstance } from "../src/duel-state.js";
import { playDuel } from "../scripts/selfplay.mjs";

const fakeStore = () => {
  const map = new Map();
  return {
    setItem: (k, v) => map.set(k, v),
    getItem: (k) => map.get(k) ?? null,
    removeItem: (k) => map.delete(k),
  };
};

test("a snapshot says what was on the table, not just who was winning", () => {
  const state = createDuel("yugi-kaiba", { seed: 4 });
  state.sides.player.monsters[0] = makeInstance("darkMagician", "yugi");
  state.sides.opponent.monsters[1] = makeInstance("battleOx", "kaiba");
  state.sides.opponent.monsters[1].faceDown = true;

  const snap = snapshotOf(state);
  assert.equal(snap.player.monsters[0].card, "darkMagician");
  assert.equal(snap.opponent.monsters[1].faceDown, true);
  assert.equal(snap.player.lp, 8000);
  assert.equal(snap.turn, state.turn);
  assert.equal(snap.phase, state.phase);
  assert.equal(snapshotOf(null), null, "no state is not a crash");
});

test("a whole duel fits in the timeline without unbounded growth", () => {
  const journal = createJournal({ store: fakeStore(), limit: 120 });
  const { state, events } = playDuel("joey-mai", 9);
  journal.duelStarted({ matchup: "joey-mai", seed: 9 });
  for (const event of events) journal.events([event], state);
  assert.ok(journal.size <= 120, `${journal.size} entries past the limit`);
  // The tail is what is kept: a bug is noticed at the end, not the beginning.
  assert.equal(journal.entries.at(-1).type, "state");
});

test("errors are recorded with where the duel was when they happened", () => {
  const journal = createJournal({ store: fakeStore() });
  journal.duelStarted({ matchup: "yugi-kaiba", seed: 1 });
  journal.error(new Error("effectiveStats is not a function"), { turn: 4, phase: "battle" });

  const digest = summarise(journal);
  assert.deepEqual(digest.errors, ["effectiveStats is not a function"]);
  const entry = journal.entries.find((e) => e.type === "error");
  assert.equal(entry.context.turn, 4);
  assert.ok(entry.stack, "a stack is the whole point of recording the error");
});

test("a bug report carries the note and the timeline together", () => {
  const journal = createJournal({ store: fakeStore() });
  const state = createDuel("yugi-kaiba", { seed: 2 });
  journal.duelStarted({ matchup: "yugi-kaiba", seed: 2, mode: "live" });
  journal.events([{ type: "phase", phase: "battle", side: "player" }], state);
  journal.action("action", { type: "attack" });

  const report = journal.report("clicked my monster and nothing happened", { mode: "live" });
  assert.equal(report.duel.matchup, "yugi-kaiba");
  const note = report.entries.find((e) => e.type === "report");
  assert.match(note.text, /nothing happened/);
  assert.equal(note.mode, "live");
  assert.ok(report.entries.some((e) => e.type === "action"), "the report needs the actions too");
});

test("the last duel survives the crash that ended it", () => {
  const store = fakeStore();
  const journal = createJournal({ store });
  journal.duelStarted({ matchup: "yugi-kaiba", seed: 7 });
  journal.error(new Error("boom"), { turn: 3 });

  // A fresh page, reading back what the old one left behind.
  const recovered = createJournal({ store }).recover();
  assert.equal(recovered.duel.seed, 7);
  assert.ok(recovered.entries.some((e) => e.type === "error"));
});

test("a storage that refuses to store is not an error worth interrupting a duel", () => {
  const hostile = {
    setItem() { throw new Error("quota exceeded"); },
    getItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  const journal = createJournal({ store: hostile });
  journal.duelStarted({ matchup: "yugi-kaiba", seed: 1 });
  journal.action("action", { type: "summon" });
  assert.equal(journal.recover(), null);
  assert.ok(journal.size >= 2, "the timeline still works in memory");
});

test("a new duel starts a new timeline", () => {
  const journal = createJournal({ store: fakeStore() });
  journal.duelStarted({ matchup: "yugi-kaiba", seed: 1 });
  journal.action("action", { type: "summon" });
  journal.duelStarted({ matchup: "joey-mai", seed: 2 });
  assert.equal(journal.toJSON().duel.matchup, "joey-mai");
  assert.equal(journal.entries.filter((e) => e.type === "action").length, 0);
});

test("the digest counts what happened and names the board it happened on", () => {
  const journal = createJournal({ store: fakeStore() });
  const state = createDuel("yugi-kaiba", { seed: 3 });
  journal.duelStarted({ matchup: "yugi-kaiba", seed: 3 });
  journal.events([{ type: "draw", side: "player" }], state);
  journal.shot({ key: "summon.DARK.spellcaster", lane: "action" });

  const digest = summarise(journal);
  assert.equal(digest.counts.event, 1);
  assert.equal(digest.counts.shot, 1);
  assert.equal(digest.board.turn, state.turn);
});
