// Server-side video providers. Each adapter exposes the same shape, so the
// server can try them in order and take whichever is configured, affordable and
// working -- no single provider is load-bearing.
//
// Adapter contract:
//   id            short name used in config and logs
//   label         human name for the capability report
//   configured()  are its credentials present?
//   seconds(n)    the duration this provider will actually accept
//   cost(n)       rough units, only meaningful within a provider
//   maxPrompt     hard character cap the API enforces, if any
//   generate({ prompt, seconds, seed, quality, signal }) -> Buffer

import { fitPrompt } from "./cinema/world.js";

const GEN = "https://gen.pollinations.ai";
const GOOGLE = "https://generativelanguage.googleapis.com/v1beta";
const HIGGS = "https://api.higgsfield.ai";

const env = (name) => (process.env[name] ?? "").trim();
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(n)));
const wait = (ms, signal) => new Promise((done, fail) => {
  const timer = setTimeout(done, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); fail(new Error("aborted")); }, { once: true });
});

async function asBuffer(res, what) {
  if (!res.ok) throw new Error(`${what} ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2048) throw new Error(`${what} returned an empty clip`);
  return buf;
}

// Long-running providers all follow submit → poll → download; only the field
// names differ, so the loop lives here once.
async function pollUntilDone({ poll, isDone, isFailed, urlOf, signal, everyMs = 5000, tries = 60 }) {
  for (let i = 0; i < tries; i += 1) {
    await wait(everyMs, signal);
    const body = await poll();
    if (isFailed(body)) throw new Error(`generation failed: ${JSON.stringify(body).slice(0, 160)}`);
    if (isDone(body)) {
      const url = urlOf(body);
      if (!url) throw new Error("finished without a video url");
      return url;
    }
  }
  throw new Error("timed out waiting for the clip");
}

// ------------------------------------------------------------ pollinations ---

const pollinations = {
  id: "pollinations",
  label: "Pollinations · nova-reel",
  model: env("DUEL_VIDEO_MODEL") || "amazon/nova-reel-v1",
  // nova-reel rejects a prompt over 512 characters outright.
  maxPrompt: 512,
  configured: () => Boolean(env("POLLINATIONS_API_KEY")),
  // nova-reel-v1 advertises min_duration 6, so a shorter ask is rejected.
  seconds: (n) => clamp(n, 6, 10),
  cost: (n) => clamp(n, 6, 10) * 0.08,
  costUnit: "pollen",
  async generate({ prompt, seconds, seed, quality, signal }) {
    const size = quality === "480" ? { width: 854, height: 480 } : { width: 1280, height: 720 };
    const q = new URLSearchParams({
      model: pollinations.model, seed: String(seed), aspectRatio: "16:9",
      duration: String(pollinations.seconds(seconds)),
      width: String(size.width), height: String(size.height),
    });
    const res = await fetch(`${GEN}/video/${encodeURIComponent(prompt)}?${q}`, {
      headers: { authorization: `Bearer ${env("POLLINATIONS_API_KEY")}` }, signal,
    });
    return asBuffer(res, "pollinations");
  },
};

// ------------------------------------------------------------------ google ---

const google = {
  id: "google",
  label: "Google · Veo 3.1",
  model: env("DUEL_GOOGLE_VIDEO_MODEL") || "veo-3.1-fast-generate-preview",
  maxPrompt: 2000,
  configured: () => Boolean(env("GEMINI_API_KEY")),
  // Veo accepts 4, 6 or 8 seconds only. Scanning ascending with a strict
  // comparison makes ties break toward the shorter, cheaper duration.
  seconds: (n) => [4, 6, 8].reduce((best, v) => (Math.abs(v - n) < Math.abs(best - n) ? v : best)),
  cost: (n) => google.seconds(n),
  costUnit: "seconds",
  async generate({ prompt, seconds, seed, signal }) {
    const key = env("GEMINI_API_KEY");
    const headers = { "x-goog-api-key": key, "content-type": "application/json" };
    const start = await fetch(`${GOOGLE}/models/${google.model}:predictLongRunning`, {
      method: "POST", headers, signal,
      body: JSON.stringify({
        instances: [{ prompt }],
        // Veo has no 480p tier; 720p is its floor.
        parameters: {
          aspectRatio: "16:9", resolution: "720p",
          durationSeconds: String(google.seconds(seconds)),
          numberOfVideos: 1, seed,
        },
      }),
    });
    if (!start.ok) throw new Error(`google ${start.status}: ${(await start.text()).slice(0, 160)}`);
    const { name } = await start.json();
    if (!name) throw new Error("google returned no operation name");

    const uri = await pollUntilDone({
      signal,
      poll: async () => (await fetch(`${GOOGLE}/${name}`, { headers, signal })).json(),
      isDone: (body) => body.done === true,
      isFailed: (body) => Boolean(body.error),
      urlOf: (body) => body?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri,
    });
    return asBuffer(await fetch(uri, { headers: { "x-goog-api-key": key }, signal }), "google download");
  },
};

// -------------------------------------------------------------- higgsfield ---

const higgsfield = {
  id: "higgsfield",
  label: "Higgsfield · Seedance Lite",
  path: env("DUEL_HIGGSFIELD_PATH") || "/bytedance/seedance/v1/lite/text-to-video",
  maxPrompt: 2000,
  configured: () => Boolean(env("HIGGSFIELD_API_KEY_ID") && env("HIGGSFIELD_API_KEY_SECRET")),
  seconds: (n) => clamp(n, 3, 10),
  cost: (n) => clamp(n, 3, 10),
  costUnit: "seconds",
  async generate({ prompt, seconds, quality, signal }) {
    const auth = `Key ${env("HIGGSFIELD_API_KEY_ID")}:${env("HIGGSFIELD_API_KEY_SECRET")}`;
    const headers = { authorization: auth, "content-type": "application/json" };
    const start = await fetch(`${HIGGS}${higgsfield.path}`, {
      method: "POST", headers, signal,
      body: JSON.stringify({
        prompt,
        duration: higgsfield.seconds(seconds),
        // The one provider here with a genuine 480p tier.
        resolution: quality === "720" ? "720" : "480",
        aspect_ratio: "16:9",
      }),
    });
    if (!start.ok) throw new Error(`higgsfield ${start.status}: ${(await start.text()).slice(0, 160)}`);
    const job = await start.json();
    const statusUrl = job.status_url ?? `${HIGGS}/requests/${job.request_id}/status`;

    const url = await pollUntilDone({
      signal, everyMs: 4000,
      poll: async () => (await fetch(statusUrl, { headers: { authorization: auth }, signal })).json(),
      isDone: (body) => body.status === "completed",
      isFailed: (body) => ["failed", "canceled", "nsfw"].includes(body.status),
      urlOf: (body) => body?.video?.url,
    });
    return asBuffer(await fetch(url, { signal }), "higgsfield download");
  },
};

// ------------------------------------------------------------------ chain ---

export const ADAPTERS = { higgsfield, pollinations, google };

const DEFAULT_ORDER = ["higgsfield", "pollinations", "google"];

export function providerOrder() {
  const configured = env("DUEL_VIDEO_PROVIDERS");
  const names = configured ? configured.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_ORDER;
  return names.map((name) => ADAPTERS[name]).filter(Boolean);
}

export const availableProviders = () => providerOrder().filter((p) => p.configured());

/**
 * Try each configured provider in turn. `canAfford` lets the caller veto one
 * (a spent Pollen balance, say) without removing it from the chain entirely.
 */
export async function generateVideo(request, { canAfford = () => true, onAttempt } = {}) {
  const chain = availableProviders();
  if (!chain.length) throw new Error("no video provider is configured");
  const problems = [];
  for (const provider of chain) {
    if (!(await canAfford(provider, provider.seconds(request.seconds)))) {
      problems.push(`${provider.id}: not affordable`);
      continue;
    }
    onAttempt?.(provider);
    try {
      // Each provider gets the prompt shortened to what it will actually accept.
      const prompt = fitPrompt(request.prompt, provider.maxPrompt);
      return {
        buffer: await provider.generate({ ...request, prompt }),
        provider: provider.id,
      };
    } catch (error) {
      problems.push(`${provider.id}: ${error.message}`);
    }
  }
  throw new Error(problems.join(" | "));
}
