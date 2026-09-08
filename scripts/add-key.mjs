// `npm run key -- sk_yourkey` — writes .env.local, verifies the key against the
// live API, and reports how much free video it actually buys.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENV = `${ROOT}.env.local`;
const GEN = "https://gen.pollinations.ai";
const VIDEO_POLLEN_PER_SECOND = 0.08;
const CLIP_SECONDS = 6;

const key = (process.argv[2] ?? "").trim();

if (!key) {
  console.log(`Usage:  npm run key -- <your-key>

Get a free key (GitHub sign-in, no card) at https://enter.pollinations.ai/keys
Use a secret key — it starts with "sk_" and stays on the server.

Free "Quest Pollen" is earned, not bought. Fastest routes, from the live catalog:
  0.25  create your first API key
  0.25  make one text request        (npm run keycheck does this for you)
  0.25  make one image request
  0.25  make one audio request
  0.25  log in to any Pollinations app
  1.00  connect Discord and join the server
  3.00  sign in with a GitHub account at least two years old
  5.00  get a pull request merged into the Pollinations repo

About 5 pollen is reachable in a few minutes, which is roughly
${Math.round(5 / VIDEO_POLLEN_PER_SECOND)} seconds of video — about ${Math.round(5 / VIDEO_POLLEN_PER_SECOND / CLIP_SECONDS)} clips. Duel Live caches every
clip it makes, so the same shot never costs twice.`);
  process.exit(0);
}

if (!/^(sk|pk)_/.test(key)) {
  console.error(`That does not look like a Pollinations key (expected it to start with "sk_").`);
  process.exit(1);
}
if (key.startsWith("pk_")) {
  console.warn("Warning: pk_ keys are legacy and rate-limited to 1 pollen per IP per hour.\n");
}

async function get(path) {
  const res = await fetch(`${GEN}${path}`, { headers: { authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

let balance = null;
try {
  const info = await get("/account/key");
  console.log(`key accepted · type ${info.type ?? "unknown"}`);
  balance = await get("/account/balance").catch(() => null);
} catch (error) {
  console.error(`The API rejected that key: ${error.message}`);
  console.error("Check you copied the whole key from https://enter.pollinations.ai/keys");
  process.exit(1);
}

let existing = "";
try { existing = readFileSync(ENV, "utf8"); } catch { /* first run */ }
const next = existing.includes("POLLINATIONS_API_KEY=")
  ? existing.replace(/^POLLINATIONS_API_KEY=.*$/m, `POLLINATIONS_API_KEY=${key}`)
  : `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}POLLINATIONS_API_KEY=${key}\n`;
writeFileSync(ENV, next);

console.log(`wrote ${ENV.replace(ROOT, "")} (git-ignored)`);

const pollen = balance?.accountBalance?.total ?? balance?.balance ?? null;
if (pollen !== null) {
  const seconds = pollen / VIDEO_POLLEN_PER_SECOND;
  console.log(`balance    ${pollen.toFixed(2)} pollen`);
  console.log(`that buys  ~${Math.floor(seconds)}s of video · about ${Math.floor(seconds / CLIP_SECONDS)} six-second clips`);
  if (pollen < 1) console.log(`\nLow. Run \`npm run key\` with no argument to see how to earn more.`);
}
console.log(`\nStart with the key loaded:\n  node --env-file=.env.local server.mjs`);
