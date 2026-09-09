// WP5: the interface. Every one of these covers something a player could not
// previously see, reach, or understand.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { isLethal, previewAttack } from "../src/attack-preview.js";
import { groupByTurn, lineFor } from "../src/duel-log.js";
import { whyNotPlayable } from "../src/why-not.js";
import { createDuel } from "../src/duel-engine.js";
import { makeInstance } from "../src/duel-state.js";
import { playDuel } from "../scripts/selfplay.mjs";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const html = read("index.html");
const css = read("styles.css");
const app = read("src/app.js");

// -------------------------------------------------- 5.2 layout geometry ---

test("the duel is laid out to fit a viewport, not to be scrolled", () => {
  assert.match(css, /body \{[^}]*height: 100vh/s, "the page is a viewport, not a document");
  assert.match(css, /\.arena-wrap \{[^}]*flex: 1/s, "the arena takes the space that is left");
  assert.match(css, /\.hand-rail \{[^}]*flex: none/s, "the hand is a fixed strip, never below the fold");
  assert.doesNotMatch(css, /\.arena \{[^}]*aspect-ratio: 16 \/ 9/s,
    "a fixed aspect ratio is what pushed the hand off screen");
});

test("monster and spell zones have different silhouettes", () => {
  assert.match(css, /\.zone--monsters \{[^}]*aspect-ratio: 59 \/ 86/s, "monsters are portrait");
  assert.match(css, /\.zone--backrow \{[^}]*aspect-ratio: 86 \/ 59/s, "spell and trap zones are landscape");
});

// ------------------------------------------------------- 5.3 inspector ---

test("an unplayable card says which rule is in the way", () => {
  const state = createDuel("yugi-kaiba", { seed: 5 });
  const cases = [
    ["darkMagician", /tributes/],
    ["monsterReborn", /nothing for Monster Reborn to target/],
    ["polymerization", /materials/],
    ["mirrorForce", /set face-down/],
    ["darkMagicAttack", /need Dark Magician/],
  ];
  for (const [id, expected] of cases) {
    const inst = makeInstance(id, "yugi");
    state.sides.player.hand = [inst];
    const reason = whyNotPlayable(state, "player", inst);
    assert.ok(reason, `${id} should explain itself`);
    assert.match(reason, expected, `${id} gave: ${reason}`);
  }
});

test("a playable card gives no reason, because there is nothing to explain", () => {
  const state = createDuel("yugi-kaiba", { seed: 5 });
  const inst = makeInstance("celticGuardian", "yugi");
  state.sides.player.hand = [inst];
  assert.equal(whyNotPlayable(state, "player", inst), null);
});

test("the reason accounts for the phase and whose turn it is", () => {
  const state = createDuel("yugi-kaiba", { seed: 5 });
  const inst = makeInstance("celticGuardian", "yugi");
  state.sides.player.hand = [inst];
  assert.match(whyNotPlayable({ ...state, phase: "battle" }, "player", inst), /Main Phase/);
  assert.match(whyNotPlayable({ ...state, activeSide: "opponent" }, "player", inst), /not your turn/);
});

test("the inspector works by tap as well as hover", () => {
  assert.match(app, /onZoneInspect/, "a touch screen has no hover");
  assert.match(read("src/render.js"), /contextmenu/, "a long press pins the panel");
});

// -------------------------------------------------------- 5.4 targeting ---

test("an attack is previewed with the arithmetic before it is declared", () => {
  const state = createDuel("yugi-kaiba", { seed: 5 });
  const attacker = makeInstance("darkMagician", "yugi");        // 2500
  state.sides.player.monsters[0] = attacker;

  const ox = makeInstance("battleOx", "kaiba");                  // 1700 ATK
  state.sides.opponent.monsters[0] = ox;
  const win = previewAttack(state, "player", attacker.uid, ox.uid);
  assert.equal(win.tone, "good");
  assert.equal(win.damage, 800);
  assert.match(win.verdict, /Battle Ox destroyed, 800 damage/);

  state.sides.opponent.monsters[0] = makeInstance("blueEyes", "kaiba");  // 3000 ATK
  const lose = previewAttack(state, "player", attacker.uid, state.sides.opponent.monsters[0].uid);
  assert.equal(lose.tone, "bad");
  assert.equal(lose.losesAttacker, true);
  assert.match(lose.verdict, /Dark Magician destroyed, 500 damage back/);
});

test("attacking a wall reports the backlash, and does not promise a kill", () => {
  const state = createDuel("yugi-kaiba", { seed: 5 });
  const attacker = makeInstance("darkMagician", "yugi");
  state.sides.player.monsters[0] = attacker;
  const wall = makeInstance("bigShieldGardna", "kaiba");   // 2600 DEF
  wall.position = "defense";
  state.sides.opponent.monsters[0] = wall;

  const preview = previewAttack(state, "player", attacker.uid, wall.uid);
  assert.equal(preview.tone, "bad");
  assert.equal(preview.damage, 100);
  assert.equal(preview.losesAttacker, undefined, "a defending monster does not destroy the attacker");
  assert.match(preview.verdict, /Blocked/);
});

test("a face-down target is reported as unknown rather than guessed at", () => {
  const state = createDuel("yugi-kaiba", { seed: 5 });
  const attacker = makeInstance("darkMagician", "yugi");
  state.sides.player.monsters[0] = attacker;
  const hidden = makeInstance("bigShieldGardna", "kaiba");
  hidden.faceDown = true;
  hidden.position = "defense";
  state.sides.opponent.monsters[0] = hidden;

  const preview = previewAttack(state, "player", attacker.uid, hidden.uid);
  assert.equal(preview.kind, "unknown");
  assert.equal(preview.tone, "risky");
  assert.doesNotMatch(preview.verdict, /2600/, "the defence is not known until it flips");
});

test("a lethal attack is called out, since it ends the duel", () => {
  const state = createDuel("yugi-kaiba", { seed: 5 });
  const attacker = makeInstance("darkMagician", "yugi");
  state.sides.player.monsters[0] = attacker;
  state.sides.opponent.lp = 2000;
  const preview = previewAttack(state, "player", attacker.uid, null);
  assert.equal(isLethal(state, "player", preview), true);
  state.sides.opponent.lp = 8000;
  assert.equal(isLethal(state, "player", preview), false);
});

test("the preview must be confirmed, because undo is impossible", () => {
  assert.ok(html.includes('id="preview-confirm"'));
  assert.ok(html.includes('id="preview-cancel"'));
  assert.match(app, /function confirmAttack/);
  assert.match(app, /pendingAttack/, "an attack waits rather than firing on the second click");
});

test("illegal targets recede while a target is being chosen", () => {
  assert.match(css, /\.zones\.is-choosing \.zone:not\(\.is-target\)/,
    "everything illegal must dim, or the legal ones do not stand out");
});

// -------------------------------------------------------------- 5.6 log ---

test("the log groups by turn", () => {
  const { state, events } = playDuel("yugi-kaiba", 777);
  const lines = events.map((event) => lineFor(event, state)).filter(Boolean);
  const turns = groupByTurn(lines);
  assert.ok(turns.length > 5, `only ${turns.length} turns`);
  for (const turn of turns) {
    assert.ok(turn.heading, "every turn needs a heading");
    assert.ok(Array.isArray(turn.lines));
  }
});

test("a damage line shows the arithmetic rather than a summary", () => {
  const state = createDuel("yugi-kaiba", { seed: 1 });
  const clash = lineFor({
    type: "clash", side: "player", attacker: "Dark Magician", defender: "Battle Ox",
    attackerAtk: 2500, defenderValue: 1700, defenderPosition: "attack",
  }, state);
  assert.match(clash.text, /2500 vs .*1700/);
  assert.match(clash.detail, /800 damage/);

  const blocked = lineFor({
    type: "clash", side: "player", attacker: "Celtic Guardian", defender: "Big Shield Gardna",
    attackerAtk: 1400, defenderValue: 2600, defenderPosition: "defense",
  }, state);
  assert.match(blocked.detail, /1200 back at the attacker/);
});

test("the three weights are distinguishable, not all the same", () => {
  const state = createDuel("yugi-kaiba", { seed: 1 });
  const structural = lineFor({ type: "phase", phase: "battle", side: "player", turn: 3 }, state);
  const mechanical = lineFor({ type: "summon", side: "player", card: "Kuriboh", how: "normal", atk: 300 }, state);
  assert.equal(structural.weight, "structural");
  assert.equal(mechanical.weight, "mechanical");
  for (const weight of ["structural", "mechanical", "dialogue"]) {
    assert.match(css, new RegExp(`\\.log-line\\.is-${weight}`), `no styling for ${weight}`);
  }
});

test("a chain link is labelled on the line it came from", () => {
  const state = createDuel("yugi-kaiba", { seed: 1 });
  const line = lineFor({
    type: "activate", side: "opponent", card: "Mirror Force", reveal: true, chainLink: 2,
  }, state);
  assert.equal(line.chainLink, 2);
  assert.match(line.detail, /Chain Link 2/);
});

test("damage step bookkeeping does not become log noise", () => {
  const state = createDuel("yugi-kaiba", { seed: 1 });
  assert.equal(lineFor({ type: "damageStep", subStep: "ds_start", side: "player" }, state), null);
});

// ---------------------------------------------- 5.8 access and mobile ---

test("zones are real buttons, labelled for a screen reader", () => {
  const render = read("src/render.js");
  assert.match(render, /createElement\("button"\)/, "a div cannot be focused or activated");
  assert.match(render, /aria-label/, "and it must say what it holds");
  assert.match(render, /function ariaFor/);
});

test("the duel log is announced as it fills", () => {
  assert.match(html, /id="log"[^>]*aria-live="polite"/,
    "a screen reader should narrate the duel");
});

test("the board can be played from the keyboard", () => {
  assert.match(app, /handleZoneKeys/);
  assert.match(app, /ArrowLeft/);
  assert.match(css, /\.zone:focus-visible/, "focus must be visible to be usable");
});

test("reduced motion stops the camera without stopping the clips", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  const player = read("src/cinema/player.js");
  assert.match(player, /prefers-reduced-motion/, "the canvas has its own motion to stop");
  assert.match(player, /reducedMotion\(\) \? 0 : now/, "a frozen clock stops the drift");
});

test("below 900px the board stacks rather than shrinking", () => {
  const mobile = css.slice(css.indexOf("@media (max-width: 900px)"));
  assert.match(mobile, /aspect-ratio: 4 \/ 5/, "the board goes portrait");
  assert.match(mobile, /position: sticky/, "the side panel becomes a bottom sheet");
});

test("the banter subtitle sits in the horizon band, clear of every card", () => {
  const banter = css.slice(css.indexOf(".banter {"), css.indexOf(".banter-who"));
  assert.match(banter, /bottom: 50%/, "the free band is the middle, between the two boards");
  assert.match(banter, /pointer-events: none/, "a subtitle must never eat a click on a zone");
  assert.match(css, /-webkit-line-clamp: 2/, "a third line would reach the monster rows");

  // The rows are placed by percentage; assert the subtitle lands between them.
  const pct = (sel) => Number(css.match(new RegExp(`\\${sel} \\{ ([^}]*)\\}`))?.[1]
    ?.match(/(?:top|bottom): (\d+)%/)?.[1]);
  const rowHeight = Number(css.match(/\.zones \{[^}]*height: (\d+)%/s)[1]);
  const myMonstersTop = pct(".zones--me-monsters") + rowHeight;   // 44% up from the floor
  const foeMonstersTop = pct(".zones--foe-monsters") + rowHeight; // 44% down from the ceiling
  assert.ok(myMonstersTop < 50, `player monsters reach ${myMonstersTop}%, past the subtitle`);
  assert.ok(100 - foeMonstersTop > 50, `opponent monsters reach ${100 - foeMonstersTop}%`);
});
