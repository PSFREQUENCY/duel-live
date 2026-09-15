// The director: one event in, a cut sequence out, budgeted by what it is worth.

import assert from "node:assert/strict";
import { test } from "node:test";

import { ATTRIBUTES, FAMILIES, createDirector, direct, directEvent } from "../src/broadcast/director.js";
import { dramaFor, holdMultiplier, shotBudget } from "../src/broadcast/drama.js";
import { GRAMMAR, beatFor } from "../src/broadcast/shot-grammar.js";
import { truncate } from "../src/broadcast/reel.js";
import { createDuel } from "../src/duel-engine.js";
import { playDuel } from "../scripts/selfplay.mjs";

const state = () => createDuel("yugi-kaiba", { seed: 3 });

test("every event kind the engine emits either maps to a beat or is deliberately silent", () => {
  const { events } = playDuel("yugi-kaiba", 11);
  // Named so a new engine event has to be classified rather than silently
  // ignored. A set spell or trap is silent on purpose: showing it would leak
  // hidden information the opponent has not earned.
  const silent = new Set([
    "draw", "damage", "damageStep", "destroy", "declare", "flip", "position",
    "statChange", "setBackrow", "fieldShift", "bounce", "dice", "hats", "chainStart", "fusion",
    "set",
  ]);
  for (const event of events) {
    const mapped = Boolean(beatFor(event));
    assert.ok(mapped || silent.has(event.type),
      `${event.type} is neither in the grammar nor in the silent set`);
  }
  // And the classification is on the real event, not just its name: a set
  // monster is a shot, a set trap is not.
  assert.equal(beatFor({ type: "set", side: "player", kind: "monster" }), "setMonster");
  assert.equal(beatFor({ type: "set", side: "player", kind: "trap" }), null);
  for (const beat of Object.keys(GRAMMAR)) {
    assert.ok(GRAMMAR[beat].length >= 1, `${beat} has no shots`);
    assert.ok(GRAMMAR[beat].some(([, rank]) => rank === 1), `${beat} has no rank-1 spine`);
  }
});

test("a lethal attack scores strictly higher drama than a routine one", () => {
  const duel = state();
  const routine = { type: "directAttack", side: "player", card: "Celtic Guardian", damage: 400 };
  const big = { type: "directAttack", side: "player", card: "Blue-Eyes White Dragon", damage: 3000 };

  const healthy = { ...duel, sides: { ...duel.sides, opponent: { ...duel.sides.opponent, lp: 7600 } } };
  const dying = { ...duel, sides: { ...duel.sides, opponent: { ...duel.sides.opponent, lp: 0 } } };

  const routineDrama = dramaFor(routine, healthy);
  const lethalDrama = dramaFor(big, dying);
  assert.ok(lethalDrama > routineDrama, `${lethalDrama} should beat ${routineDrama}`);
  assert.ok(lethalDrama >= 0.8, "a lethal swing must clear the interrupt threshold");
});

test("a duel ending is the top of the scale", () => {
  assert.equal(dramaFor({ type: "win", side: "player" }, state()), 1);
});

test("drama 0 yields exactly 1 shot; drama 1 yields 4", () => {
  assert.equal(shotBudget(0), 1);
  assert.equal(shotBudget(1), 4);
  assert.equal(shotBudget(0.5), 3);
  for (let d = 0; d <= 1.0001; d += 0.05) {
    const n = shotBudget(d);
    assert.ok(n >= 1 && n <= 4, `budget ${n} out of range at drama ${d}`);
  }
});

test("holds stretch with the moment, which is most of the pacing", () => {
  assert.equal(holdMultiplier(0).toFixed(2), "0.80");
  assert.equal(holdMultiplier(1).toFixed(2), "1.70");
  const routine = directEvent(
    { type: "summon", side: "player", card: "Celtic Guardian", how: "normal", atk: 1400 }, state());
  const finish = directEvent({ type: "win", side: "player", reason: "lifePoints" }, state());
  assert.ok(finish.shots[0].hold > routine.shots[0].hold * 1.5,
    "an ending must not be cut at the same tempo as a turn-three summon");
});

test("a rank-1 shot survives truncation at every budget from 1 to 4", () => {
  for (const [beat, row] of Object.entries(GRAMMAR)) {
    const shots = row.map(([key, rank]) => ({ key, rank }));
    for (let budget = 1; budget <= 4; budget += 1) {
      const kept = truncate(shots, budget);
      assert.ok(kept.some((shot) => shot.rank === 1),
        `${beat} lost its spine at budget ${budget}`);
      assert.ok(kept.length <= Math.max(budget, 1) || shots.length <= budget);
    }
  }
});

test("the trap flip degrades to the trap, then the reveal, then the full four beats", () => {
  const shots = GRAMMAR.trapFlip.map(([key, rank]) => ({ key, rank }));
  assert.deepEqual(truncate(shots, 1).map((s) => s.key), ["trap"]);
  assert.deepEqual(truncate(shots, 2).map((s) => s.key), ["reveal.trap", "trap"]);
  assert.equal(truncate(shots, 4).length, 4);
});

test("a fusion summon reads as a bigger moment than a normal one", () => {
  const duel = state();
  const normal = directEvent(
    { type: "summon", side: "player", card: "Celtic Guardian", how: "normal", atk: 1400 }, duel);
  const fusion = directEvent(
    { type: "summon", side: "player", card: "Dark Paladin", how: "fusion", atk: 2900 }, duel);
  assert.ok(fusion.drama > normal.drama);
  assert.ok(fusion.shots.length > normal.shots.length);
});

test("placeholders resolve against real cards, never leaving a brace on screen", () => {
  const { state: end, events } = playDuel("yugi-kaiba", 5);
  for (const sequence of direct(events, end)) {
    for (const shot of sequence.shots) {
      assert.doesNotMatch(shot.key, /[{}]/, `unresolved placeholder in ${shot.key}`);
      assert.match(shot.key, /^[a-z]+(\.[A-Za-z-]+)*$/, `malformed key ${shot.key}`);
    }
  }
});

test("the attribute and family vocabularies cover every monster in both decks", () => {
  const { state: end, events } = playDuel("joey-mai", 9);
  for (const sequence of direct(events, end)) {
    for (const shot of sequence.shots) {
      const [kind, a, b] = shot.key.split(".");
      if (kind !== "summon") continue;
      assert.ok(ATTRIBUTES.includes(a), `unknown attribute ${a}`);
      assert.ok(FAMILIES.includes(b), `unknown family ${b}`);
    }
  }
});

test("a turn of nothing gets one breather, a busy turn gets none", () => {
  const duel = state();
  const quiet = direct([
    { type: "phase", phase: "battle", side: "player", turn: 3 },
    { type: "phase", phase: "end", side: "player", turn: 3 },
  ], duel);
  assert.equal(quiet.length, 1, "an empty turn is marked, not skipped");
  assert.equal(quiet[0].shots[0].key, "phase.battle", "entering battle is the transition worth marking");

  const busy = direct([
    { type: "phase", phase: "battle", side: "player", turn: 3 },
    { type: "directAttack", side: "player", card: "Dark Magician", damage: 2500 },
    { type: "phase", phase: "end", side: "player", turn: 3 },
  ], duel);
  assert.ok(busy.every((s) => s.beat !== "phase"), "a metronome is not a breather");
});

test("a whole duel directs to an episode's worth of cuts, not a log", () => {
  for (const [matchup, seed] of [["yugi-kaiba", 7], ["joey-mai", 13]]) {
    const { state: end, events } = playDuel(matchup, seed);
    let batch = [];
    const all = [];
    for (const event of events) {
      batch.push(event);
      if (event.type === "phase" && event.phase === "end") { all.push(...direct(batch, end)); batch = []; }
    }
    all.push(...direct(batch, end));

    const shots = all.reduce((n, s) => n + s.shots.length, 0);
    // Scaled to the duel rather than fixed: joey-mai runs two and a half times
    // longer than yugi-kaiba, so a flat cap would only be testing duel length.
    const perTurn = all.length / end.turn;
    assert.ok(all.length >= 10, `${matchup}: only ${all.length} sequences`);
    assert.ok(perTurn <= 4, `${matchup}: ${perTurn.toFixed(1)} sequences per turn is a log, not an edit`);
    assert.ok(shots >= all.length, "every sequence contributes at least one shot");
    const spread = new Set(all.map((s) => s.shots.length));
    assert.ok(spread.size >= 2, "uniform sequence length is a slideshow, not an edit");
  }
});

test("the breather rule holds when events arrive a few at a time", () => {
  // The live app presents each action as it happens, so a batch holding only a
  // phase change looks like an empty turn to a batch-scoped director. Thirteen
  // stingers in ten turns was the bug this guards.
  const duel = createDuel("yugi-kaiba", { seed: 8 });
  const director = createDirector();
  const turnOf = (n) => ({ ...duel, turn: n });

  let stingers = 0;
  for (let turn = 1; turn <= 6; turn += 1) {
    for (const event of [
      { type: "phase", phase: "battle", side: "player", turn },
      { type: "phase", phase: "end", side: "player", turn },
    ]) {
      stingers += director.direct([event], turnOf(turn))
        .filter((s) => s.beat === "phase").length;
    }
  }
  assert.equal(stingers, 6, "one breather per empty turn, not one per phase event");
});

test("a turn that did something gets no breather at all", () => {
  const duel = createDuel("yugi-kaiba", { seed: 8 });
  const director = createDirector();
  const turnOf = (n) => ({ ...duel, turn: n });

  director.direct([{ type: "phase", phase: "battle", side: "player", turn: 1 }], turnOf(1));
  const acted = director.direct(
    [{ type: "directAttack", side: "player", card: "Dark Magician", damage: 2500 }], turnOf(1));
  assert.equal(acted[0].beat, "directAttack");
  const after = director.direct([{ type: "phase", phase: "end", side: "player", turn: 1 }], turnOf(1));
  assert.deepEqual(after, [], "a breather after a real beat is filler");
});

test("a new duel resets the director's memory", () => {
  const duel = createDuel("yugi-kaiba", { seed: 8 });
  const director = createDirector();
  director.direct([{ type: "directAttack", side: "player", card: "Dark Magician", damage: 2500 }],
    { ...duel, turn: 1 });
  director.reset();
  const fresh = director.direct([{ type: "phase", phase: "battle", side: "player", turn: 1 }],
    { ...duel, turn: 1 });
  assert.equal(fresh.length, 1, "a restarted duel must not inherit the last one's state");
});
