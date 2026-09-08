// Duel Live server. Serves the static app and brokers the free cinema
// providers, so the API key (when there is one) never reaches the browser.
//
// Every generated asset is cached under .local/media and replayed from disk.

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const MEDIA_DIR = join(ROOT, ".local", "media");
const PORT = Number(process.env.PORT ?? 4174);
const KEY = (process.env.POLLINATIONS_API_KEY ?? "").trim();

const CFG = {
  video: process.env.DUEL_VIDEO_MODEL ?? "amazon/nova-reel-v1",
  image: process.env.DUEL_IMAGE_MODEL ?? "black-forest-labs/flux.1-schnell",
  voice: process.env.DUEL_VOICE_MODEL ?? "NamanSoni78/aura-2-atlas-en",
  realtime: process.env.DUEL_REALTIME_MODEL ?? "openai/gpt-realtime-2.1-mini",
  seconds: Number(process.env.DUEL_VIDEO_SECONDS ?? 6),
  width: Number(process.env.DUEL_VIDEO_WIDTH ?? 768),
  height: Number(process.env.DUEL_VIDEO_HEIGHT ?? 432),
};

const GEN = "https://gen.pollinations.ai";
const ANON_IMAGE = "https://image.pollinations.ai/prompt";

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".mp4": "video/mp4",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".mp3": "audio/mpeg", ".svg": "image/svg+xml",
};

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

const digest = (parts) => createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);

async function readBody(req, limit = 1 << 20) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("payload too large");
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

function authHeaders() {
  return KEY ? { authorization: `Bearer ${KEY}` } : {};
}

// ------------------------------------------------------------- generation ---

function videoUrl(prompt, seconds, seed) {
  const q = new URLSearchParams({
    model: CFG.video, width: String(CFG.width), height: String(CFG.height),
    seed: String(seed), duration: String(Math.min(seconds, 10)), aspectRatio: "16:9",
  });
  return `${GEN}/video/${encodeURIComponent(prompt)}?${q}`;
}

function stillUrl(prompt, seed) {
  const q = new URLSearchParams({
    model: CFG.image, width: String(CFG.width), height: String(CFG.height),
    seed: String(seed), nologo: "true", safe: "true",
  });
  // With no key the anonymous host still serves images, so tier 1 stays free.
  return KEY ? `${GEN}/image/${encodeURIComponent(prompt)}?${q}`
    : `${ANON_IMAGE}/${encodeURIComponent(prompt)}?${q}`;
}

async function fetchOnce(url, file, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: authHeaders(), signal: ctl.signal });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 512) throw new Error("upstream returned an empty asset");
    await mkdir(MEDIA_DIR, { recursive: true });
    await writeFile(file, buf);
    return { file, cached: false };
  } finally {
    clearTimeout(timer);
  }
}

// One retry only. A confirmed failure is cheap to redo; a blind resubmission of
// an accepted generation is not.
async function fetchToCache(url, name, timeoutMs) {
  const file = join(MEDIA_DIR, name);
  if (await exists(file)) return { file, cached: true };
  try {
    return await fetchOnce(url, file, timeoutMs);
  } catch (error) {
    if (String(error).includes("abort")) throw error;
    await new Promise((done) => setTimeout(done, 1200));
    return fetchOnce(url, file, timeoutMs);
  }
}

// Free video is metered in "pollen", and a free balance is small. Cache the
// number briefly so the UI can show it and stop asking for video before the
// balance runs out mid-duel.
const VIDEO_POLLEN_PER_SECOND = 0.08;
let balanceCache = { at: 0, pollen: null };

async function pollenBalance() {
  if (!KEY) return null;
  if (Date.now() - balanceCache.at < 60000) return balanceCache.pollen;
  try {
    const res = await fetch(`${GEN}/account/balance`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    balanceCache = { at: Date.now(), pollen: body?.accountBalance?.total ?? body?.balance ?? null };
  } catch {
    balanceCache = { at: Date.now(), pollen: null };
  }
  return balanceCache.pollen;
}

const affordsVideo = (pollen, seconds) =>
  pollen === null || pollen >= seconds * VIDEO_POLLEN_PER_SECOND;

const inflight = new Map();
function once(key, work) {
  if (!inflight.has(key)) {
    inflight.set(key, work().finally(() => setTimeout(() => inflight.delete(key), 50)));
  }
  return inflight.get(key);
}

async function handleShot(req, res) {
  const body = await readBody(req);
  const { prompt, tier = "still", seconds = CFG.seconds, id = "" } = body;
  if (!prompt || typeof prompt !== "string") return json(res, 400, { error: "prompt required" });
  if (tier === "video" && !KEY) return json(res, 402, { error: "video tier needs a free key" });
  if (tier === "video" && !affordsVideo(await pollenBalance(), seconds)) {
    return json(res, 402, { error: "not enough free pollen for a video clip", pollen: balanceCache.pollen });
  }

  const seed = parseInt(digest([id, prompt]).slice(0, 8), 16) % 2147483647;
  const ext = tier === "video" ? ".mp4" : ".jpg";
  const name = `${digest([tier, prompt, String(seed)])}${ext}`;
  const url = tier === "video" ? videoUrl(prompt, seconds, seed) : stillUrl(prompt, seed);

  try {
    const result = await once(name, () => fetchToCache(url, name, tier === "video" ? 240000 : 60000));
    return json(res, 200, { url: `/media/${name}`, tier, cached: result.cached, seed });
  } catch (error) {
    return json(res, 502, { error: String(error.message ?? error), tier });
  }
}

const VOICE_BY_DUELIST = {
  yugi: "NamanSoni78/aura-2-orpheus-en", kaiba: "NamanSoni78/aura-2-atlas-en",
  joey: "NamanSoni78/aura-2-amalthea-en", mai: "NamanSoni78/aura-2-thalia-en",
};

async function handleVoice(req, res) {
  const { text, duelist } = await readBody(req);
  if (!KEY) return json(res, 402, { error: "voice tier needs a free key" });
  if (!text) return json(res, 400, { error: "text required" });
  const model = VOICE_BY_DUELIST[duelist] ?? CFG.voice;
  const name = `${digest(["voice", model, text])}.mp3`;
  const file = join(MEDIA_DIR, name);
  try {
    if (!(await exists(file))) {
      const upstream = await fetch(`${GEN}/v1/audio/speech`, {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ model, input: text, voice: "default", response_format: "mp3" }),
      });
      if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
      await mkdir(MEDIA_DIR, { recursive: true });
      await writeFile(file, Buffer.from(await upstream.arrayBuffer()));
    }
    res.writeHead(200, { "content-type": "audio/mpeg", "cache-control": "public, max-age=86400" });
    createReadStream(file).pipe(res);
  } catch (error) {
    json(res, 502, { error: String(error.message ?? error) });
  }
}

// ----------------------------------------------------------------- static ---

async function serveStatic(req, res, pathname) {
  const rel = normalize(pathname === "/" ? "/index.html" : pathname);
  // Generated media lives outside the source tree, under .local/media.
  const file = rel.startsWith("/media/") ? join(MEDIA_DIR, rel.slice("/media/".length)) : join(ROOT, rel);
  if (!file.startsWith(ROOT)) return json(res, 403, { error: "forbidden" });
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not a file");
    res.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "content-length": info.size,
      "cache-control": rel.startsWith("/media/") ? "public, max-age=604800" : "no-cache",
    });
    createReadStream(file).pipe(res);
  } catch {
    json(res, 404, { error: "not found" });
  }
}

const ROUTES = {
  "GET /api/capability": async (req, res) => {
    const pollen = await pollenBalance();
    const canVideo = Boolean(KEY) && affordsVideo(pollen, CFG.seconds);
    json(res, 200, {
      still: true, video: canVideo, voice: Boolean(KEY), realtime: Boolean(KEY),
      keyPresent: Boolean(KEY), pollen,
      videoClipsLeft: pollen === null ? null : Math.floor(pollen / (CFG.seconds * VIDEO_POLLEN_PER_SECOND)),
      models: { video: CFG.video, image: CFG.image, realtime: CFG.realtime },
    });
  },
  "POST /api/shot": handleShot,
  "POST /api/voice": handleVoice,
  "GET /api/realtime": (req, res) => json(res, KEY ? 200 : 402, KEY
    ? { url: `${GEN}/v1/realtime?model=${encodeURIComponent(CFG.realtime)}`, model: CFG.realtime }
    : { error: "realtime tier needs a free key" }),
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  res.setHeader("access-control-allow-origin", "*");
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
  const route = ROUTES[`${req.method} ${url.pathname}`];
  try {
    if (route) await route(req, res);
    else await serveStatic(req, res, url.pathname);
  } catch (error) {
    json(res, 500, { error: String(error.message ?? error) });
  }
});

server.listen(PORT, () => {
  const tiers = KEY ? "procedural + still + video + voice" : "procedural + still (no key set)";
  console.log(`Duel Live  →  http://localhost:${PORT}/`);
  console.log(`Cinema tiers available: ${tiers}`);
});
