// The bundle has no live bindings, so an import cycle turns into `undefined`
// at a call site far from the cycle. These tests keep that failure at build
// time, where it names the file to fix.

import assert from "node:assert/strict";
import { test } from "node:test";

import { describeCycles, findFatalCycles } from "../scripts/module-graph.mjs";

const graph = (spec) => new Map(
  Object.entries(spec).map(([id, imports]) => [id, { imports }]),
);

test("a named import taken across a back-edge is fatal", () => {
  const fatal = findFatalCycles(graph({
    "a.js": { "b.js": [] },
    "b.js": { "a.js": ["helper"] },
  }), "a.js");
  assert.equal(fatal.length, 1);
  assert.deepEqual(fatal[0].names, ["helper"]);
  assert.deepEqual(fatal[0].cycle, ["a.js", "b.js", "a.js"]);
});

test("a cycle that carries no bindings is only an ordering question", () => {
  const fatal = findFatalCycles(graph({
    "a.js": { "b.js": [] },
    "b.js": { "a.js": [] },     // side-effect import
  }), "a.js");
  assert.deepEqual(fatal, []);
});

test("a diamond is not a cycle, however many times a module is reached", () => {
  const fatal = findFatalCycles(graph({
    "a.js": { "b.js": ["x"], "c.js": ["y"] },
    "b.js": { "d.js": ["z"] },
    "c.js": { "d.js": ["z"] },
    "d.js": {},
  }), "a.js");
  assert.deepEqual(fatal, []);
});

test("a cycle longer than two modules is still found", () => {
  const fatal = findFatalCycles(graph({
    "a.js": { "b.js": ["p"] },
    "b.js": { "c.js": ["q"] },
    "c.js": { "a.js": ["r"] },
  }), "a.js");
  assert.equal(fatal.length, 1);
  assert.deepEqual(fatal[0].cycle, ["a.js", "b.js", "c.js", "a.js"]);
});

test("the message names the file to change and what to do", () => {
  const text = describeCycles(findFatalCycles(graph({
    "duel-engine.js": { "duel-targets.js": ["targetOptions"] },
    "duel-targets.js": { "duel-engine.js": ["effectiveStats"] },
  }), "duel-engine.js"));
  assert.match(text, /duel-targets\.js takes \{ effectiveStats \}/);
  assert.match(text, /module that defines them/);
});

test("the real source tree has no cycle the bundle cannot resolve", async () => {
  const { execFileSync } = await import("node:child_process");
  const out = execFileSync("node", ["scripts/build-single-file.mjs"], {
    cwd: new URL("..", import.meta.url).pathname, encoding: "utf8",
  });
  assert.match(out, /duel-live\.html/, "the build must reach the write");
});
