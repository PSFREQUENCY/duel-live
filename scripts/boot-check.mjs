// `npm run smoke` -- boots the real app against the shared DOM stub and plays a
// handful of turns, so a wiring break shows up without opening a browser.

import { dom, fire, installGlobals, settle } from "../tests/dom-stub.mjs";

const errors = [];
process.on("uncaughtException", (e) => errors.push(`uncaught: ${e.message}`));
process.on("unhandledRejection", (e) => errors.push(`rejection: ${e?.message ?? e}`));

installGlobals();
await import("../src/app.js");
await settle(300);

for (let i = 0; i < 10; i += 1) {
  await fire("advance-btn");
  await settle(120);
}

const node = (id) => dom.nodes.get(id);
const bound = [...dom.listeners.keys()].filter((k) => k.includes("btn") || k.includes("select"));

console.log(`boot        ok · ${dom.nodes.size} ids resolved · ${bound.length} controls bound`);
console.log(`duelists    ${node("me-name").textContent} vs ${node("foe-name").textContent}`);
console.log(`life points ${node("me-lp").textContent} / ${node("foe-lp").textContent}  (turn ${node("me-turn").textContent})`);
console.log(`log         ${node("log").children.length} entries`);

if (errors.length) {
  console.error(`\nRUNTIME ERRORS (${errors.length}):`);
  for (const e of errors.slice(0, 10)) console.error("  " + e);
  process.exit(1);
}
console.log("\nno runtime errors ✓");
