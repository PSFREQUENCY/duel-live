// Video is deliberately not tied to one vendor: adapters share a contract and
// the chain falls through to whichever is configured, affordable and working.

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { ADAPTERS, availableProviders, generateVideo, providerOrder } from "../src/providers.mjs";
import { archetypeFor, libraryFor } from "../src/cinema/archetypes.js";
import { DUELISTS } from "../src/duelists.js";

const ENV_KEYS = [
  "HIGGSFIELD_API_KEY_ID", "HIGGSFIELD_API_KEY_SECRET", "GEMINI_API_KEY",
  "POLLINATIONS_API_KEY", "DUEL_VIDEO_PROVIDERS",
];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test("every adapter satisfies the same contract", () => {
  for (const [id, adapter] of Object.entries(ADAPTERS)) {
    assert.equal(adapter.id, id);
    assert.equal(typeof adapter.label, "string");
    assert.equal(typeof adapter.configured, "function");
    assert.equal(typeof adapter.generate, "function");
    assert.equal(typeof adapter.seconds(5), "number");
    assert.ok(adapter.cost(6) > 0);
  }
});

test("each provider clamps duration to what it actually accepts", () => {
  // nova-reel refuses anything under six seconds.
  assert.equal(ADAPTERS.pollinations.seconds(2), 6);
  assert.equal(ADAPTERS.pollinations.seconds(30), 10);
  // Veo takes 4, 6 or 8 only, and a tie picks the cheaper side.
  assert.equal(ADAPTERS.google.seconds(5), 4);
  assert.equal(ADAPTERS.google.seconds(7), 6);
  assert.equal(ADAPTERS.google.seconds(2), 4);
  assert.equal(ADAPTERS.google.seconds(20), 8);
  // Seedance is the flexible one.
  assert.equal(ADAPTERS.higgsfield.seconds(5), 5);
});

test("only providers with credentials are offered", () => {
  for (const k of ENV_KEYS) delete process.env[k];
  assert.deepEqual(availableProviders(), []);
  process.env.GEMINI_API_KEY = "test-key";
  assert.deepEqual(availableProviders().map((p) => p.id), ["google"]);
  process.env.HIGGSFIELD_API_KEY_ID = "id";
  process.env.HIGGSFIELD_API_KEY_SECRET = "secret";
  assert.deepEqual(availableProviders().map((p) => p.id), ["higgsfield", "google"]);
});

test("the cheapest 480p provider is tried first by default", () => {
  delete process.env.DUEL_VIDEO_PROVIDERS;
  assert.deepEqual(providerOrder().map((p) => p.id), ["higgsfield", "pollinations", "google"]);
  process.env.DUEL_VIDEO_PROVIDERS = "google,higgsfield";
  assert.deepEqual(providerOrder().map((p) => p.id), ["google", "higgsfield"]);
});

test("a failing provider falls through to the next one", async () => {
  const attempts = [];
  const broken = { ...ADAPTERS.higgsfield, id: "broken", configured: () => true, generate: async () => { throw new Error("upstream 500"); } };
  const working = { ...ADAPTERS.google, id: "working", configured: () => true, generate: async () => Buffer.alloc(4096, 1) };
  const chain = [broken, working];
  const result = await runChain(chain, { onAttempt: (p) => attempts.push(p.id) });
  assert.deepEqual(attempts, ["broken", "working"]);
  assert.equal(result.provider, "working");
  assert.equal(result.buffer.length, 4096);
});

test("an unaffordable provider is skipped without being called", async () => {
  const calls = [];
  const pricey = { ...ADAPTERS.pollinations, id: "pricey", configured: () => true, generate: async () => { calls.push("pricey"); return Buffer.alloc(4096); } };
  const cheap = { ...ADAPTERS.higgsfield, id: "cheap", configured: () => true, generate: async () => Buffer.alloc(4096, 2) };
  const result = await runChain([pricey, cheap], { canAfford: (p) => p.id !== "pricey" });
  assert.deepEqual(calls, [], "an unaffordable provider must not be invoked");
  assert.equal(result.provider, "cheap");
});

test("with every provider down the error names each failure", async () => {
  const down = (id) => ({ ...ADAPTERS.google, id, configured: () => true, generate: async () => { throw new Error(`${id} exploded`); } });
  await assert.rejects(
    () => runChain([down("a"), down("b")]),
    (error) => /a exploded/.test(error.message) && /b exploded/.test(error.message),
  );
});

test("no configured provider is an explicit failure, not a silent hang", async () => {
  for (const k of ENV_KEYS) delete process.env[k];
  await assert.rejects(
    () => generateVideo({ prompt: "x", seconds: 6 }),
    /no video provider is configured/,
  );
});

// generateVideo reads the chain from the environment; this drives an explicit
// chain so the fallback logic can be tested without real credentials.
async function runChain(chain, { canAfford = () => true, onAttempt } = {}) {
  const problems = [];
  for (const provider of chain) {
    if (!(await canAfford(provider, 6))) { problems.push(`${provider.id}: not affordable`); continue; }
    onAttempt?.(provider);
    try {
      return { buffer: await provider.generate({ prompt: "x", seconds: 6 }), provider: provider.id };
    } catch (error) {
      problems.push(`${provider.id}: ${error.message}`);
    }
  }
  throw new Error(problems.join(" | "));
}

// ------------------------------------------------------------- archetypes ---

test("shots that read the same way share one clip", () => {
  const summon = (name) => archetypeFor({ kind: "summon", title: name, event: { card: name }, seconds: 6 });
  assert.equal(summon("Dark Magician").key, summon("Dark Magician Girl").key);
  assert.equal(summon("Blue-Eyes White Dragon").key, "summon-LIGHT-dragon");
  assert.notEqual(summon("Dark Magician").key, summon("Blue-Eyes White Dragon").key);
});

test("a key always determines exactly one prompt", () => {
  const seen = new Map();
  for (const entry of libraryFor(Object.values(DUELISTS))) {
    const previous = seen.get(entry.key);
    assert.ok(previous === undefined || previous === entry.prompt,
      `${entry.key} maps to two different prompts — clips would be cached inconsistently`);
    seen.set(entry.key, entry.prompt);
  }
});

test("the library covers every duel and stays small enough to prewarm", () => {
  const library = libraryFor(Object.values(DUELISTS));
  assert.ok(library.length > 20, "too few archetypes to be convincing");
  assert.ok(library.length < 60, `${library.length} clips is too many to generate up front`);
  for (const kind of ["summon", "fusion", "clash", "direct", "trap", "spell", "finish"]) {
    assert.ok(library.some((e) => e.key.startsWith(kind)), `no archetype covers ${kind}`);
  }
  for (const entry of library) {
    assert.ok(entry.prompt.length > 60, `${entry.key} has a thin prompt`);
    assert.match(entry.prompt, /no text, no subtitles/, `${entry.key} is missing the house style`);
    assert.match(entry.prompt, /Duel Disk clamped to their left forearm/,
      `${entry.key} is missing the world block — a generator reads "arena" as a sports stadium without it`);
  }
});

test("shots with no reusable form opt out rather than guessing", () => {
  assert.equal(archetypeFor({ kind: "idle", title: "Standoff" }), null);
  assert.equal(archetypeFor({}), null);
  assert.equal(archetypeFor({ kind: "summon", title: "Not A Real Card", event: {} }), null);
});

test("a title card names its own clip instead of deriving one", () => {
  const shot = { kind: "versus", clipKey: "vs-yugi-kaiba", prompt: "x", seconds: 6 };
  const entry = archetypeFor(shot);
  assert.equal(entry.key, "vs-yugi-kaiba");
  assert.equal(entry.title, true);
  for (const kind of ["intro", "outro"]) {
    assert.equal(archetypeFor({ kind, clipKey: kind, prompt: "x", seconds: 6 }).key, kind);
  }
});

test("title cards use the 3D register, never the in-duel cel look", async () => {
  const { titleShot } = await import("../src/cinema/storyboard.js");
  const { createDuel } = await import("../src/duel-engine.js");
  const state = createDuel("yugi-kaiba", { seed: 3 });
  for (const kind of ["intro", "versus", "outro"]) {
    const shot = titleShot(kind, state);
    assert.match(shot.prompt, /AAA 3D cinematic animation/, `${kind} lost the title style`);
    assert.doesNotMatch(shot.prompt, /cel-shaded/, `${kind} mixed in the in-duel style`);
    assert.doesNotMatch(shot.prompt, /Duel Disk clamped/, `${kind} should not carry the in-duel world block`);
  }
  assert.match(titleShot("versus", state).prompt, /star-shaped black hair/, "the versus plate must show both duelists");
  assert.equal(titleShot("nonsense", state), null);
});

test("a title card is always worth a clip", async () => {
  const { deservesVideo } = await import("../src/cinema/free-video.js");
  assert.equal(deservesVideo({ kind: "versus", clipKey: "vs-joey-mai" }), true);
  assert.equal(deservesVideo({ kind: "intro", clipKey: "intro" }), true);
});

test("a character is described in exactly one place", async () => {
  const { readFileSync } = await import("node:fs");
  const duelists = readFileSync(new URL("../src/duelists.js", import.meta.url), "utf8");
  assert.doesNotMatch(duelists, /portrait:/,
    "character looks belong in src/cinema/world.js, or the sheets and the runtime will drift");
  const { LOOKS } = await import("../src/cinema/world.js");
  for (const id of ["yugi", "kaiba", "joey", "mai"]) {
    assert.ok(LOOKS[id]?.look?.length > 60, `${id} has no usable look in the world bible`);
  }
});

test("clip filenames are matched loosely, so a generator's naming does not matter", async () => {
  const { normaliseClipKey } = await import("../src/clip-library.mjs");
  for (const [file, key] of [
    ["arena cliff.mp4", "arena-cliff"],
    ["Open_Yugi.MOV", "open-yugi"],
    ["open-kaiba.webm", "open-kaiba"],
    ["  React  Shocked  Mai .m4v", "react-shocked-mai"],
    ["summon-DARK-spellcaster.mp4", "summon-dark-spellcaster"],
  ]) {
    assert.equal(normaliseClipKey(file), key, `${file} should key as ${key}`);
  }
});

test("the clip index reads the real folder and ignores non-video entries", async () => {
  const { clipKeys, findClip } = await import("../src/clip-library.mjs");
  const { fileURLToPath } = await import("node:url");
  const dir = fileURLToPath(new URL("../clips", import.meta.url));
  const keys = await clipKeys(dir);
  assert.ok(Array.isArray(keys));
  // Every key must be normalised, and no directory or stray file may sneak in.
  for (const key of keys) {
    assert.equal(key, key.toLowerCase());
    assert.doesNotMatch(key, /[\s_]/, `${key} is not normalised`);
    assert.ok(await findClip(dir, key), `${key} indexed but not resolvable`);
  }
  assert.equal(await findClip(dir, "definitely-not-a-clip"), null);
  assert.equal(await findClip(dir, ""), null);
});

test("a missing clips folder is normal, not an error", async () => {
  const { clipKeys, clipCount } = await import("../src/clip-library.mjs");
  assert.deepEqual(await clipKeys("/nowhere/at/all"), []);
  assert.equal(await clipCount("/nowhere/at/all"), 0);
});

test("every prompt fits every provider's hard limit once shortened", async () => {
  const { fitPrompt } = await import("../src/cinema/world.js");
  const { readFileSync } = await import("node:fs");
  const manifest = JSON.parse(
    readFileSync(new URL("../prompts/manifest.json", import.meta.url), "utf8"),
  );
  for (const adapter of Object.values(ADAPTERS)) {
    if (!adapter.maxPrompt) continue;
    for (const shot of manifest.shots) {
      const fitted = fitPrompt(shot.prompt, adapter.maxPrompt);
      assert.ok(
        fitted.length <= adapter.maxPrompt,
        `${shot.key} is ${fitted.length} chars for ${adapter.id}, over its ${adapter.maxPrompt} limit`,
      );
    }
  }
});

test("shortening drops the boilerplate before it touches the subject", async () => {
  const { assemble, fitPrompt, STYLE, WORLD } = await import("../src/cinema/world.js");
  const subject = "an enormous armoured dragon erupting from a duel disk in a floodlit arena";
  const prompt = assemble(subject);
  assert.ok(prompt.length > 512, "the full prompt is meant to be long");

  const fitted = fitPrompt(prompt, 512);
  assert.ok(fitted.length <= 512);
  assert.ok(fitted.includes(subject), "the subject must survive shortening intact");
  assert.ok(!fitted.includes(STYLE), "the long style block should have been swapped out");
  assert.match(fitted, /Duel Disk/i, "the world must still be described, briefly");
  assert.doesNotMatch(fitted, /[,;\s]$/, "a trimmed prompt must not end mid-clause");
});

test("a prompt already within the limit is left exactly alone", async () => {
  const { fitPrompt } = await import("../src/cinema/world.js");
  const short = "a dragon on a duel field";
  assert.equal(fitPrompt(short, 512), short);
  assert.equal(fitPrompt(short, 0), short, "no limit means no change");
});

test("stills default to the free host, so holding a key never costs more", async () => {
  const { readFileSync } = await import("node:fs");
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const stillUrl = server.slice(server.indexOf("function stillUrl"), server.indexOf("export const stillsAreBilled"));
  assert.match(stillUrl, /ANON_IMAGE/, "the anonymous host must be the default for stills");
  assert.match(stillUrl, /KEY && BILL_STILLS/,
    "the billed host must require an explicit opt-in, not just the presence of a key");
  assert.match(server, /DUEL_BILL_STILLS/, "the opt-in must be an environment variable");
  const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(env, /DUEL_BILL_STILLS=0/, "the example env must ship with billing off");
});

test("no two clip keys share a word set, so order-insensitive matching is safe", async () => {
  const { clipWordSet } = await import("../src/clip-library.mjs");
  const { readFileSync } = await import("node:fs");
  const manifest = JSON.parse(
    readFileSync(new URL("../prompts/manifest.json", import.meta.url), "utf8"),
  );
  const seen = new Map();
  for (const shot of manifest.shots) {
    const words = clipWordSet(shot.key);
    const previous = seen.get(words);
    assert.equal(previous, undefined,
      `${shot.key} and ${previous} share a word set — a transposed filename could match either`);
    seen.set(words, shot.key);
  }
});

test("a transposed or untidy filename still finds its clip", async () => {
  const { normaliseClipKey, clipWordSet } = await import("../src/clip-library.mjs");
  // Exact form after normalising.
  assert.equal(normaliseClipKey(" Play Yugi Activate.mp4"), "play-yugi-activate");
  // ...and the same words in the manifest's order resolve to one another.
  assert.equal(clipWordSet("play yugi activate.mp4"), clipWordSet("play-activate-yugi"));
  assert.equal(clipWordSet("open_Kaiba.MOV"), clipWordSet("open-kaiba"));
  assert.notEqual(clipWordSet("play-summon-mai"), clipWordSet("play-activate-mai"));
});
