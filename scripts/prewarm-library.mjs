// `npm run prewarm` — generates the whole archetype clip library once. After
// this every duel plays on cached video for free, because each clip is shared
// by every shot that reads the same way.
//
// Safe to re-run: clips already on disk are skipped, not regenerated.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { availableProviders } from "../src/providers.mjs";
import { clipKeys } from "../src/clip-library.mjs";

const PORT = Number(process.env.PORT ?? 4174);
const BASE = process.env.DUEL_BASE_URL ?? `http://localhost:${PORT}`;
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const limit = Number((process.argv.find((a) => a.startsWith("--limit=")) ?? "").split("=")[1] ?? 0);

// The manifest is the single source of every clip the game can use -- archetypes,
// duelist shots and title cards alike -- so prewarm and the hand-made prompt
// sheets always agree on what exists and what it should look like.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(`${ROOT}prompts/manifest.json`, "utf8"));

// A clip already in clips/ is better art at no cost; never spend on one.
const handmade = new Set(await clipKeys(`${ROOT}clips`));

const library = manifest.shots
  .filter((shot) => !handmade.has(shot.key))
  .filter((shot) => (only.length ? only.some((f) => shot.key.includes(f)) : true));
const targets = limit > 0 ? library.slice(0, limit) : library;

const providers = availableProviders();
if (!providers.length) {
  console.error("No video provider configured. Add credentials to .env.local — see .env.example.");
  process.exit(1);
}

console.log(`manifest   ${manifest.shots.length} clips · ${handmade.size} already hand-made`);
console.log(`to make    ${library.length}${limit ? ` · generating ${targets.length}` : ""}`);
console.log(`providers  ${providers.map((p) => p.label).join(" → ")}`);
console.log(`server     ${BASE}\n`);

let made = 0;
let cached = 0;
let failed = 0;

for (const [i, entry] of targets.entries()) {
  const label = `[${String(i + 1).padStart(2)}/${targets.length}] ${entry.key.padEnd(26)}`;
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/api/shot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tier: "video", prompt: entry.prompt, reuseKey: entry.key, seconds: entry.seconds ?? 6 }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    const took = ((Date.now() - started) / 1000).toFixed(0);
    if (body.cached) { cached += 1; console.log(`${label} cached`); }
    else { made += 1; console.log(`${label} generated via ${body.provider} · ${took}s`); }
  } catch (error) {
    failed += 1;
    console.log(`${label} failed — ${String(error.message ?? error).slice(0, 90)}`);
  }
}

console.log(`\n${made} generated · ${cached} already cached · ${failed} failed`);
if (failed) console.log("Re-run to retry only the clips that are still missing.");
else console.log("Library complete. Every duel now plays cached video at no further cost.");
