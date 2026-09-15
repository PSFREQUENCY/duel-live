// A set card is hidden information. The board hides it, so nothing else may
// give it away either — not the log, not the caption, not the panel.

import assert from "node:assert/strict";
import { test } from "node:test";

import { lineFor } from "../src/duel-log.js";
import { buildStoryboard } from "../src/cinema/storyboard.js";
import { describeCard } from "../src/card-detail.js";
import { createDuel } from "../src/duel-engine.js";
import { makeInstance } from "../src/duel-state.js";
import { playDuel } from "../scripts/selfplay.mjs";
import { readFileSync } from "node:fs";

const duel = () => createDuel("yugi-kaiba", { seed: 3 });
const setEvent = {
  type: "summon", side: "opponent", card: "Battle Ox", how: "set",
  faceDown: true, atk: 1700, def: 1000, uid: "battleOx#1",
};

test("the log does not name a set monster", () => {
  const line = lineFor(setEvent, duel());
  assert.match(line.text, /sets a monster/);
  assert.doesNotMatch(line.text, /Battle Ox/);
});

test("the log does not print a set monster's ATK either", () => {
  // Its ATK identifies it as surely as its name would.
  const line = lineFor(setEvent, duel());
  assert.equal(line.detail, null, `leaked: ${line.detail}`);
  assert.doesNotMatch(JSON.stringify(line), /1700/);
});

test("a face-up summon still says what it was, because it is public", () => {
  const line = lineFor({ ...setEvent, how: "normal", faceDown: false }, duel());
  assert.match(line.text, /Battle Ox/);
  assert.match(line.detail, /1700 ATK/);
});

test("the cinema caption does not name a set monster", () => {
  const [shot] = buildStoryboard([setEvent], duel());
  assert.equal(shot.title, "Set");
  assert.match(shot.subtitle, /face-down/);
  assert.doesNotMatch(JSON.stringify({ t: shot.title, s: shot.subtitle }), /Battle Ox|1700/);
});

test("the shot prompt does not describe a creature nobody can see", () => {
  const [shot] = buildStoryboard([setEvent], duel());
  assert.match(shot.prompt, /face-down/);
  assert.doesNotMatch(shot.prompt, /minotaur|Battle Ox/i,
    "generating the monster's art gives it away just as well as naming it");
});

test("nobody announces a set monster out loud", () => {
  const [shot] = buildStoryboard([setEvent], duel());
  assert.equal(shot.voice, null, "a duelist naming their own set card defeats the point");
});

test("no shot in a whole duel names a card that was set", () => {
  for (const seed of [4, 12, 20]) {
    const { state, events } = playDuel("yugi-kaiba", seed);
    const sets = events.filter((e) => e.type === "summon" && (e.how === "set" || e.faceDown));
    for (const event of sets) {
      const [shot] = buildStoryboard([event], state);
      if (!shot) continue;
      assert.doesNotMatch(shot.title, new RegExp(event.card), `caption leaked ${event.card}`);
      assert.doesNotMatch(lineFor(event, state).text, new RegExp(event.card),
        `log leaked ${event.card}`);
    }
  }
});

test("your own set monster is still yours to inspect", () => {
  // Hiding it from its owner would be hiding information from the person who
  // put it there.
  const state = duel();
  const inst = makeInstance("battleOx", "yugi");
  inst.faceDown = true;
  state.sides.player.monsters[0] = inst;
  const detail = describeCard("battleOx", { state, side: "player", inst });
  assert.equal(detail.name, "Battle Ox");
  assert.equal(detail.note, "Face-down");
});

test("the board shows no name for any face-down card", () => {
  const code = readFileSync(new URL("../src/render.js", import.meta.url), "utf8");
  assert.match(code, /if \(!inst\.faceDown\) \{/, "a face-down tile must render no card name");
});
