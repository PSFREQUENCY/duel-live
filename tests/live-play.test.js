// Everything a player actually does in live mode, driven through the real app.
// Each of these was broken when the mode was first played.

import assert from "node:assert/strict";
import { test } from "node:test";

import { dom, fire, installGlobals, settle } from "./dom-stub.mjs";

const errors = [];
process.on("unhandledRejection", (e) => errors.push(String(e?.message ?? e)));

installGlobals({ search: "?mode=live" });
const app = await import("../src/app.js");
const { makeInstance } = await import("../src/duel-state.js");
await settle(400);

const node = (id) => dom.nodes.get(id);
const pips = (side, extra = "") => dom.queryAll(`#live-${side}-field .field-pip${extra}`);

/**
 * Wait for the duel to stop resolving.
 *
 * An earlier test's opponent turn is still running asynchronously, and it will
 * happily replace the state a moment after the next test arranges one.
 */
async function idle(capMs = 6000) {
  const deadline = Date.now() + capMs;
  while (Date.now() < deadline) {
    if (!app.busyForTest() && !app.stateForTest()?.pending) return;
    await settle(80);
  }
}

/** Put a board on the table directly, rather than hoping selfplay reaches it. */
async function arrange({ mine = [], theirs = [], hand = [], phase = "main1" }) {
  await idle();
  const state = app.stateForTest();
  // A duel that ended is not a board to arrange on.
  state.winner = null;
  state.winReason = null;
  state.sides.player.monsters = [null, null, null, null, null];
  state.sides.opponent.monsters = [null, null, null, null, null];
  mine.forEach((id, i) => { state.sides.player.monsters[i] = makeInstance(id, "yugi"); });
  theirs.forEach((id, i) => { state.sides.opponent.monsters[i] = makeInstance(id, "kaiba"); });
  state.sides.player.hand = hand.map((id) => makeInstance(id, "yugi"));
  state.phase = phase;
  state.activeSide = "player";
  state.pending = null;
  state.turn = 3;
  // A previous test may have spent this turn's Normal Summon; each of these
  // arranges a fresh turn, not a continuation of the last one.
  state.sides.player.normalSummonUsed = false;
  state.sides.player.attacked = new Set();
  app.renderForTest();
  return state;
}

test("the field is clickable, because it is the only always-visible board", async () => {
  await arrange({ mine: ["celticGuardian"], theirs: ["battleOx"] });
  assert.equal(pips("my").length, 10, "five monster and five backrow slots");
  const filled = pips("my", ".is-filled");
  assert.ok(filled.length >= 1);
  assert.equal(typeof filled[0].click, "function", "a pip must be a control, not a label");
});

test("a monster that can attack is marked, and picking it lights its targets", async () => {
  await arrange({ mine: ["darkMagician"], theirs: ["battleOx"], phase: "battle" });
  const ready = pips("my", ".is-ready");
  assert.ok(ready.length >= 1, "no attacker was marked in the Battle Phase");

  ready[0].click();
  await settle(120);
  assert.ok(pips("foe", ".is-target").length >= 1, "picking an attacker lit no targets");
});

test("an attack can be declared, previewed and confirmed from the field", async () => {
  const state = await arrange({ mine: ["darkMagician"], theirs: ["battleOx"], phase: "battle" });
  const before = state.sides.opponent.monsters.filter(Boolean).length;

  pips("my", ".is-ready")[0].click();
  await settle(120);
  pips("foe", ".is-target")[0].click();
  await settle(150);

  assert.equal(node("attack-preview").hidden, false, "no preview appeared");
  assert.match(node("preview-verdict").textContent, /\w/, "the preview said nothing");
  node("preview-confirm").click();
  await settle(400);

  const after = app.stateForTest();
  const left = after.sides.opponent.monsters.filter(Boolean).length;
  assert.ok(left < before || after.sides.opponent.lp < 8000,
    "the attack resolved to nothing at all");
  assert.deepEqual(errors, [], "attacking threw");
});

test("a tribute summon can be paid for by clicking the field", async () => {
  // This is the one the player hit: the prompt opened, and clicking their own
  // monsters did nothing, because live mode filtered board clicks while the
  // duel was `busy` -- and a duel waiting on a prompt is busy by definition.
  await arrange({
    mine: ["celticGuardian", "beaverWarrior", "bigShieldGardna"],
    hand: ["darkMagician"],
  });
  dom.query(".fan-card:not(.is-blocked)").click();
  await settle(120);
  dom.query(".sel-action").click();
  await settle(300);

  const pending = app.stateForTest().pending;
  assert.equal(pending?.kind, "tribute", "a three-for-two choice must actually ask");
  assert.ok(pips("my", ".is-ready").length >= 3, "the tributable monsters were not marked");

  for (let i = 0; i < pending.need; i += 1) {
    // A chosen tribute stays selectable so it can be un-picked, so each pick
    // has to land on one that is not already chosen.
    const next = pips("my", ".is-ready:not(.is-target)")[0];
    assert.ok(next, `nothing left to pick for tribute ${i + 1}`);
    next.click();
    await settle(90);
    assert.equal(pips("my", ".is-target").length, i + 1, `pick ${i + 1} did not register`);
  }

  const buttons = node("prompt-actions").children;
  assert.equal(buttons[0].disabled, false, "the confirm never enabled");
  buttons[0].click();
  await settle(500);

  const after = app.stateForTest();
  assert.equal(after.pending?.kind, undefined, "the tribute never resolved");
  assert.ok(after.sides.player.monsters.some((m) => m && m.cardId === "darkMagician"),
    "the tributed-for monster never arrived");
});

test("cancelling a tribute summon returns the card rather than crashing", async () => {
  // Cancel used to pass null into the engine, which crashed the turn on
  // `uids.map`. Then it merely re-asked for ever.
  await arrange({
    mine: ["celticGuardian", "beaverWarrior", "bigShieldGardna"],
    hand: ["darkMagician"],
  });
  const card = dom.query(".fan-card:not(.is-blocked)");
  assert.ok(card, `no playable card in hand: ${dom.queryAll(".fan-card").length} cards, `
    + `turn ${app.stateForTest().activeSide}, phase ${app.stateForTest().phase}`);
  card.click();
  await settle(120);
  dom.query(".sel-action").click();
  await settle(300);
  assert.equal(app.stateForTest().pending?.kind, "tribute");

  const buttons = node("prompt-actions").children;
  buttons[buttons.length - 1].click();          // Cancel
  await settle(400);

  const after = app.stateForTest();
  assert.equal(after.pending?.kind, undefined, "cancel left the question open");
  assert.ok(after.sides.player.hand.some((c) => c.cardId === "darkMagician"),
    "the card should still be in hand — nothing was paid");
  assert.equal(after.sides.player.monsters.filter(Boolean).length, 3, "no tribute was taken");
  assert.deepEqual(errors, [], "cancelling threw");
});

test("a set monster's pip says it is set and nothing more", async () => {
  const state = await arrange({ mine: ["celticGuardian"], theirs: ["battleOx"] });
  state.sides.opponent.monsters[0].faceDown = true;
  app.renderForTest();
  const hidden = pips("foe", ".is-facedown");
  assert.ok(hidden.length >= 1, "a face-down monster should read as face-down");
  assert.equal(hidden[0].textContent, "▨");
  assert.doesNotMatch(hidden[0].textContent, /\d/, "its ATK would identify it");
});

test("the feed shows what just happened, over the picture", async () => {
  await arrange({ mine: ["darkMagician"], theirs: ["battleOx"], phase: "battle" });
  const feed = node("live-feed");
  assert.ok(feed.children.length > 0, "the commentary is empty");
  const text = feed.children.map((row) => row.textContent).join(" ");
  assert.match(text, /TURN \d/, "the feed should say which turn this is");
});

test("the feed can be turned off, and comes back with the duel still in it", async () => {
  await fire("feed-btn", "click", {});
  await settle(80);
  assert.equal(node("live-feed").hidden, true);
  await fire("feed-btn", "click", {});
  await settle(80);
  assert.equal(node("live-feed").hidden, false);
  assert.ok(node("live-feed").children.length > 0, "turning it back on must restore the log");
});

test("a bug report carries the board, the timeline and the replay link", async () => {
  await fire("bug-btn", "click", {});
  await settle(80);
  assert.equal(node("bug-modal").hidden, false);

  const summary = node("bug-summary").textContent;
  for (const field of ["mode", "duel", "board", "life", "timeline", "errors"]) {
    assert.match(summary, new RegExp(`^${field}`, "m"), `the digest is missing ${field}`);
  }
  assert.match(summary, /seed \d+/, "without the seed the duel cannot be re-run");

  node("bug-text").value = "clicked my monster and nothing happened";
  await fire("bug-copy", "click", {});
  await settle(250);
  assert.match(node("bug-hint").textContent, /copied|unavailable/);

  // And the note itself reaches the timeline, which is the point of the button.
  await fire("bug-save", "click", {});
  await settle(150);
  assert.match(node("bug-hint").textContent, /Saved/);
});

test("hovering a card in hand says what it does", async () => {
  // Live mode had no way to read a card without committing to selecting it,
  // which meant the answer to "what does this do" was "click it and find out"
  // — on a card that might be a trap you did not mean to play.
  await arrange({ mine: ["celticGuardian"], hand: ["mirrorForce"] });
  const card = dom.query(".fan-card");
  assert.ok(card, "no card in hand to hover");

  card.handlers.get("mouseenter")({});
  await settle(60);
  const panel = node("hover-card");
  assert.equal(panel.hidden, false, "hovering said nothing");
  const text = panel.children.map((c) => c.textContent).join(" ");
  assert.match(text, /Mirror Force/);
  assert.match(text, /Destroy all Attack Position/,
    "the panel must carry the card's actual rules text");

  card.handlers.get("mouseleave")({});
  await settle(40);
  assert.equal(panel.hidden, true, "the panel must get out of the way again");
});

test("a card is readable by keyboard too, not only by mouse", async () => {
  await arrange({ hand: ["monsterReborn"] });
  const card = dom.query(".fan-card");
  card.handlers.get("focus")({});
  await settle(60);
  assert.equal(node("hover-card").hidden, false, "tabbing to a card must describe it");
  card.handlers.get("blur")({});
  await settle(40);
  assert.equal(node("hover-card").hidden, true);
});

test("a long press pins the panel, for a screen with no hover", async () => {
  await arrange({ hand: ["darkHole"] });
  const card = dom.query(".fan-card");
  card.handlers.get("contextmenu")({ preventDefault() {} });
  await settle(60);
  assert.equal(node("hover-card").hidden, false);

  // Pinned: a passing hover elsewhere must not steal it away.
  card.handlers.get("mouseleave")({});
  await settle(40);
  assert.equal(node("hover-card").hidden, false, "a pinned panel should stay put");
});

test("your own monsters on the field can be read from the pips", async () => {
  await arrange({ mine: ["darkMagician"], theirs: ["battleOx"] });
  const mine = pips("my", ".is-filled")[0];
  mine.handlers.get("mouseenter")({});
  await settle(60);
  const text = node("hover-card").children.map((c) => c.textContent).join(" ");
  assert.match(text, /Dark Magician/);
  assert.match(text, /2500/, "live stats belong on the panel");
});

test("hovering the opponent's face-down tells you nothing", async () => {
  const state = await arrange({ mine: ["celticGuardian"], theirs: ["battleOx"] });
  state.sides.opponent.monsters[0].faceDown = true;
  app.renderForTest();
  await settle(40);

  const theirs = pips("foe", ".is-facedown")[0];
  assert.ok(theirs, "expected a face-down pip");
  theirs.handlers.get("mouseenter")({});
  await settle(60);
  assert.equal(node("hover-card").hidden, true,
    "a face-down card you do not own must stay a mystery");
});

test("the opponent's face-up monsters are public, and readable", async () => {
  await arrange({ mine: ["celticGuardian"], theirs: ["battleOx"] });
  const theirs = pips("foe", ".is-filled")[0];
  theirs.handlers.get("mouseenter")({});
  await settle(60);
  const text = node("hover-card").children.map((c) => c.textContent).join(" ");
  assert.match(text, /Battle Ox/, "what is face-up on the field is not a secret");
});
