// `npm run clips` — what is in clips/, what is still missing, and what the game
// can already do with what is there.

import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(
  await import("node:fs").then((fs) => fs.promises.readFile(join(ROOT, "prompts", "manifest.json"), "utf8")),
);

const { clipKeys, normaliseClipKey } = await import("../src/clip-library.mjs");
const present = new Set(await clipKeys(join(ROOT, "clips")));
const has = (key) => present.has(normaliseClipKey(key));

const shots = manifest.shots;
const have = shots.filter((s) => has(s.key));
const missing = shots.filter((s) => !has(s.key));
const stray = [...present].filter((k) => !shots.some((s) => normaliseClipKey(s.key) === k));

const bar = (n, total) => {
  const filled = total ? Math.round((n / total) * 24) : 0;
  return `${"█".repeat(filled)}${"░".repeat(24 - filled)} ${n}/${total}`;
};

console.log(`clips/     ${bar(have.length, shots.length)}  overall\n`);
for (const p of [1, 2, 3]) {
  const group = shots.filter((s) => s.priority === p);
  const done = group.filter((s) => has(s.key));
  console.log(`priority ${p} ${bar(done.length, group.length)}`);
}

const nextUp = missing.filter((s) => s.priority === 1).slice(0, 8);
if (nextUp.length) {
  console.log(`\nnext up (priority 1):`);
  for (const s of nextUp) console.log(`  ${s.key}.mp4`.padEnd(30) + s.label);
  if (missing.filter((s) => s.priority === 1).length > nextUp.length) {
    console.log(`  …and ${missing.filter((s) => s.priority === 1).length - nextUp.length} more`);
  }
}
if (stray.length) {
  console.log(`\nnot in the manifest (ignored by the game):`);
  for (const key of stray.slice(0, 10)) console.log(`  ${key}`);
}
console.log(have.length
  ? `\n${have.length} clips live. The game plays these with no API key and no cost.`
  : `\nNothing in clips/ yet. See prompts/ALL-PROMPTS.md, then drop files here named by key.`);
