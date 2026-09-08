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
  const turn = Number(node("me-turn").textContent.slice(1));
  assert.ok(turn > 1, `the bundled duel did not advance past turn ${turn}`);
  assert.ok(node("log").children.length > 4, "the bundled duel produced no log");
});
