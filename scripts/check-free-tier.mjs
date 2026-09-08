// `npm run keycheck` — probes which cinema tiers are reachable right now.
//
// The text, image and audio probes each complete a free Pollinations "setup"
// quest the first time they run, so this doubles as the fastest way to earn a
// starting Pollen balance. Nothing here spends Pollen except the video probe,
// which is skipped unless the balance clearly affords it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GEN = "https://gen.pollinations.ai";
const VIDEO_POLLEN_PER_SECOND = 0.08;
const CLIP_SECONDS = Number(process.env.DUEL_VIDEO_SECONDS ?? 6);

function loadKey() {
  const fromEnv = (process.env.POLLINATIONS_API_KEY ?? "").trim();
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(`${ROOT}.env.local`, "utf8").match(/^POLLINATIONS_API_KEY=(.+)$/m)?.[1].trim() ?? "";
  } catch {
    return "";
  }
}

const KEY = loadKey();
const auth = KEY ? { authorization: `Bearer ${KEY}` } : {};
const PROMPT = "a white dragon on a duel arena, cel-shaded anime, no text";

async function probe(label, run, { ms = 60000 } = {}) {
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const note = await run(ctl.signal);
    return { label, ok: true, note, took: ((Date.now() - started) / 1000).toFixed(1) };
  } catch (error) {
    const why = error.name === "AbortError" ? "timed out" : error.message;
    return { label, ok: false, note: why, took: ((Date.now() - started) / 1000).toFixed(1) };
  } finally {
    clearTimeout(timer);
  }
}

async function expectBinary(url, kind, signal, init = {}) {
  const res = await fetch(url, { headers: { ...auth, ...(init.headers ?? {}) }, ...init, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = (await res.arrayBuffer()).byteLength;
  if (bytes < 512) throw new Error("empty response");
  return `${kind} · ${(bytes / 1024).toFixed(0)} KB`;
}

async function balance() {
  if (!KEY) return null;
  try {
    const res = await fetch(`${GEN}/account/balance`, { headers: auth });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.accountBalance?.total ?? body?.balance ?? null;
  } catch {
    return null;
  }
}

const q = (extra) => new URLSearchParams({ width: "512", height: "288", seed: "7", ...extra });

console.log(KEY
  ? "POLLINATIONS_API_KEY found — checking every tier.\n"
  : "No POLLINATIONS_API_KEY — checking the keyless tiers only.\n"
    + "Get a free key at https://enter.pollinations.ai/keys, then: npm run key -- <key>\n");

const before = await balance();
const results = [];

results.push(await probe("tier 1  still  (no key)", (signal) =>
  expectBinary(`https://image.pollinations.ai/prompt/${encodeURIComponent(PROMPT)}?${q({ nologo: "true" })}`, "image/jpeg", signal)));

if (KEY) {
  results.push(await probe("quest   text   (keyed)", async (signal) => {
    const res = await fetch(`${GEN}/v1/chat/completions`, {
      method: "POST", signal,
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5.4-nano", max_tokens: 8,
        messages: [{ role: "user", content: "Say DUEL." }],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    return `“${(body.choices?.[0]?.message?.content ?? "").trim().slice(0, 24)}”`;
  }));

  results.push(await probe("tier 1  still  (keyed)", (signal) =>
    expectBinary(`${GEN}/image/${encodeURIComponent(PROMPT)}?${q({ model: "black-forest-labs/flux.1-schnell" })}`, "image/jpeg", signal)));

  results.push(await probe("tier 3  voice  (keyed)", (signal) =>
    expectBinary(`${GEN}/v1/audio/speech`, "audio/mpeg", signal, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "NamanSoni78/aura-2-atlas-en", input: "It is time to duel.", response_format: "mp3",
      }),
    })));

  const pollen = await balance();
  const cost = CLIP_SECONDS * VIDEO_POLLEN_PER_SECOND;
  if (pollen !== null && pollen < cost) {
    results.push({
      label: "tier 2  video  (keyed)", ok: false, took: "-",
      note: `skipped — needs ${cost.toFixed(2)} pollen, balance is ${pollen.toFixed(2)}`,
    });
  } else {
    results.push(await probe("tier 2  video  (keyed)", (signal) =>
      expectBinary(`${GEN}/video/${encodeURIComponent(PROMPT)}?${q({ model: "amazon/nova-reel-v1", duration: String(CLIP_SECONDS), aspectRatio: "16:9" })}`, "video/mp4", signal),
    { ms: 300000 }));
  }
}

console.log("tier 0  procedural           ✓  always available (canvas, no network)");
for (const r of results) {
  console.log(`${r.label.padEnd(28)} ${r.ok ? "✓" : "✗"}  ${r.note}${r.took !== "-" ? ` · ${r.took}s` : ""}`);
}

const after = await balance();
if (after !== null) {
  const gained = before === null ? 0 : after - before;
  console.log(`\nbalance    ${after.toFixed(2)} pollen${gained > 0 ? `  (+${gained.toFixed(2)} earned from setup quests)` : ""}`);
  console.log(`that buys  ~${Math.floor(after / VIDEO_POLLEN_PER_SECOND)}s of video · ${Math.floor(after / (CLIP_SECONDS * VIDEO_POLLEN_PER_SECOND))} clips of ${CLIP_SECONDS}s`);
}
const down = results.filter((r) => !r.ok);
console.log(down.length
  ? `\n${down.length} tier(s) unavailable — the duel still plays on the tiers above.`
  : "\nEvery tier is reachable.");
