// `npm run smoke:live` -- boots the real app into live mode and plays ten turns
// against the DOM stub, asserting the one promise the whole mode rests on:
// the stage never renders a blank frame and the reel always has a shot.

import { dom, fire, installGlobals, settle } from "../tests/dom-stub.mjs";

const errors = [];
process.on("uncaughtException", (e) => errors.push(`uncaught: ${e.message}`));
process.on("unhandledRejection", (e) => errors.push(`rejection: ${e?.message ?? e}`));

installGlobals({ search: "?mode=live" });
const app = await import("../src/app.js");
await settle(400);

const node = (id) => dom.nodes.get(id);
const live = app.liveForTest();
if (!live) {
  console.error("live mode was not constructed from ?mode=live");
  process.exit(1);
}

let blanks = 0;
let ticks = 0;
const shots = new Set();

// Play, do not just advance. A harness that only steps phases never fills the
// action lane, so it would pass while the reel showed ambient for ten turns.
const clickFirst = (selector) => {
  const node = dom.query(selector);
  if (node) node.click();
  return Boolean(node);
};

for (let turn = 0; turn < 10; turn += 1) {
  if (!clickFirst(".fan-card:not(.is-blocked)")) await fire("advance-btn");
  await settle(120);
  clickFirst(".sel-action");
  await settle(150);
  for (let frame = 0; frame < 15; frame += 1) {
    const shot = live.reel.tick(performance.now());
    ticks += 1;
    if (!shot?.key) blanks += 1;
    else shots.add(shot.key);
    live.stage.render(performance.now());
    await settle(30);
  }
}

const { frames, medialess, failures } = live.stage.stats;
console.log(`boot        ok · live mode · ${dom.nodes.size} ids resolved`);
console.log(`duelists    ${node("live-my-name").textContent} vs ${node("live-foe-name").textContent}`);
console.log(`life points ${node("live-my-lp").textContent} / ${node("live-foe-lp").textContent}  (turn ${node("turn-counter").textContent})`);
const cuts = live.cuts;
console.log(`reel        ${ticks} sampled ticks · ${blanks} blank · ${cuts.total} cuts`);
console.log(`lanes       ${cuts.action} action · ${cuts.ambient} ambient · ${cuts.distinct} distinct shots`);
console.log(`stage       ${frames} frames · ${medialess} on the procedural floor · ${failures} paint failures`);
console.log(`hand        ${node("live-fan").children.length} cards in the fan`);

const problems = [];
if (blanks) problems.push(`${blanks} blank frames — the reel's one promise is broken`);
if (failures) problems.push(`${failures} stage paint failures`);
if (cuts.distinct < 3) problems.push(`only ${cuts.distinct} distinct shots in ten turns — that is a freeze`);
if (!cuts.action) problems.push("the action lane was never used — the reel only ever showed ambient");
if (!frames) problems.push("the stage never painted");
if (errors.length) problems.push(...errors.slice(0, 10));

if (problems.length) {
  console.error(`\nFAILED (${problems.length}):`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log("\nno blank frames, no runtime errors ✓");
