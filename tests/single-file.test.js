// The single-file build is a separate artefact from the module app, so it gets
// its own proof that it boots and plays -- not just that it was written.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { dom, fire, installGlobals, settle } from "./dom-stub.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const html = readFileSync(`${ROOT}duel-live.html`, "utf8");

test("the build inlines the stylesheet and drops every external reference", () => {
  assert.doesNotMatch(html, /<link rel="stylesheet"/, "css must be inlined");
  assert.doesNotMatch(html, /src="src\//, "no module script tags may survive");
  assert.match(html, /<style>/);
  assert.match(html, /--accent:/, "the real stylesheet is present");
});

test("no import or export statement survives the transform", () => {
  const script = html.slice(html.indexOf('<script type="module">'));
  assert.doesNotMatch(script, /^\s*import\s+[{\w*]/m, "an import statement leaked into the bundle");
  assert.doesNotMatch(script, /^\s*export\s+/m, "an export statement leaked into the bundle");
});

test("every source module made it into the bundle", () => {
  for (const id of [
    "src/app.js", "src/duel-engine.js", "src/duel-effects.js", "src/duel-state.js",
    "src/duel-ai.js", "src/duelists.js", "src/render.js",
    "src/cards/index.js", "src/cards/monsters.js", "src/cards/spells.js", "src/cards/traps.js",
    "src/cinema/player.js", "src/cinema/storyboard.js", "src/cinema/free-video.js",
    "src/cinema/procedural-stage.js", "src/cinema/realtime-voice.js",
  ]) {
    assert.ok(html.includes(`__def(${JSON.stringify(id)}`), `${id} is missing from the bundle`);
  }
});

test("the bundled game boots and plays without a server", async () => {
  installGlobals();
  // No server behind the file: capability probing must fail soft, not throw.
  globalThis.fetch = async () => { throw new Error("offline"); };
  const body = html.slice(
    html.indexOf('<script type="module">') + '<script type="module">'.length,
    html.lastIndexOf("</script>"),
  );
  const run = new (Object.getPrototypeOf(async function () {}).constructor)(body);
  await run();
  await settle(300);

  const node = (id) => dom.nodes.get(id);
  assert.equal(node("me-lp").textContent, "8000");
  assert.equal(node("me-name").textContent, "Yugi Muto");
  assert.equal(node("foe-name").textContent, "Seto Kaiba");

  for (let i = 0; i < 8; i += 1) { await fire("advance-btn"); await settle(90); }
  const turn = Number(node("turn-counter").textContent);
  assert.ok(turn > 1, `the bundled duel did not advance past turn ${turn}`);
  // The log groups into one <details> per turn, so count the lines inside them.
  const lines = [...node("log").children]
    .flatMap((turn) => [...(turn.children ?? [])])
    .flatMap((child) => [...(child.children ?? []), child]);
  assert.ok(lines.length > 4, `the bundled duel produced no log (${lines.length} nodes)`);
});

test("the bundled game runs live mode with no server behind it", async () => {
  // The hardest case for the never-blank promise: no server, so every tier
  // above procedural fails, and the ambient lane has nothing but the canvas.
  installGlobals({ search: "?mode=live" });
  globalThis.fetch = async () => { throw new Error("offline"); };
  const body = html.slice(
    html.indexOf('<script type="module">') + '<script type="module">'.length,
    html.lastIndexOf("</script>"),
  );
  const run = new (Object.getPrototypeOf(async function () {}).constructor)(body);
  await run();
  await settle(400);

  const node = (id) => dom.nodes.get(id);
  assert.equal(node("live-root").hidden, false, "live mode did not come up in the bundle");
  assert.equal(node("live-my-lp").textContent, "8000");
  assert.ok(node("live-fan").children.length > 0, "no hand was rendered");

  for (let i = 0; i < 6; i += 1) {
    const card = dom.query(".fan-card:not(.is-blocked)");
    if (card) card.click(); else await fire("advance-btn");
    await settle(120);
    dom.query(".sel-action")?.click();
    await settle(140);
  }
  assert.ok(Number(node("turn-counter").textContent) >= 1);
  assert.notEqual(node("live-shot").textContent, "", "the reel never named a shot");
});
