// Guards the seam between the modules and the page: a renamed id in index.html
// would otherwise only fail at runtime, in the browser, with no test to catch it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const html = read("index.html");
const sources = ["src/app.js", "src/render.js"].map((rel) => ({ rel, code: read(rel) }));

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

test("every element id the app looks up exists in index.html", () => {
  const missing = [];
  for (const { rel, code } of sources) {
    for (const match of code.matchAll(/\bel\("([^"]+)"\)|getElementById\("([^"]+)"\)/g)) {
      const id = match[1] ?? match[2];
      if (!htmlIds.has(id)) missing.push(`${rel} → #${id}`);
    }
  }
  assert.deepEqual(missing, [], `ids referenced but not in the page: ${missing.join(", ")}`);
});

test("template ids built from a prefix resolve for both sides", () => {
  for (const prefix of ["me", "foe"]) {
    for (const suffix of ["name", "title", "pip", "deck", "gy", "lp", "lp-fill"]) {
      assert.ok(htmlIds.has(`${prefix}-${suffix}`), `missing #${prefix}-${suffix}`);
    }
  }
  assert.ok(htmlIds.has("foe-hand"));
  assert.ok(htmlIds.has("me-turn"));
});

test("the page loads the app as a module and nothing else", () => {
  const scripts = [...html.matchAll(/<script([^>]*)>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1);
  assert.match(scripts[0], /type="module"/);
  assert.match(scripts[0], /src="src\/app\.js"/);
});

test("no source file smuggles in a paid provider or a hardcoded key", () => {
  const banned = /\b(fal\.ai|fal_key|sk-[a-z0-9]{16,}|replicate\.com|api\.openai\.com)\b/i;
  for (const rel of ["src/app.js", "src/cinema/free-video.js", "server.mjs", "index.html"]) {
    assert.doesNotMatch(read(rel), banned, `${rel} references a paid or hardcoded provider`);
  }
});

test("the example env file documents the key as optional", () => {
  const env = read(".env.example");
  assert.match(env, /POLLINATIONS_API_KEY=\s*$/m, "the key must ship empty");
  assert.match(env, /ALL OPTIONAL/i, "the file must say the key is optional");
  assert.match(env, /amazon\/nova-reel-v1/, "the free video model must be the default");
});

test("phase rail markup covers every phase the engine can report", () => {
  const phases = [...html.matchAll(/data-phase="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(phases, ["draw", "main1", "battle", "end"]);
});
