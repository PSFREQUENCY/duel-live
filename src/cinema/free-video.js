// Tiered cinema provider. Every tier is free; higher tiers are slower and need
// a free key, so the runway always falls back rather than stalling the duel.
//
//   0 procedural  canvas holograms      no key, no network, instant
//   1 still       AI key art + camera   no key, ~1-20s
//   2 video       AI video clip         free key, ~30-120s
//
// Tier 2 is prefetched while tier 0/1 is on screen, exactly so the player never
// waits on a generator.

import { archetypeFor } from "./archetypes.js";

export const TIERS = ["procedural", "still", "video"];

// "archetype" reuses one clip across every shot that reads the same way, so a
// fixed library covers the whole game. "exact" generates per shot -- better
// fidelity, but nothing is ever reused.
export const REUSE_MODES = ["archetype", "exact"];
let reuseMode = "archetype";
export const setReuseMode = (mode) => { reuseMode = REUSE_MODES.includes(mode) ? mode : "archetype"; };
export const getReuseMode = () => reuseMode;

const jobs = new Map();
let capability = { still: true, video: false, voice: false, realtime: false, checked: false };

export function getCapability() {
  return { ...capability };
}

export async function probeCapability(fetchImpl = fetch) {
  try {
    const res = await fetchImpl("/api/capability");
    if (res.ok) capability = { ...(await res.json()), checked: true };
  } catch {
    capability = { still: false, video: false, voice: false, realtime: false, checked: true };
  }
  return getCapability();
}

export function highestTier(requested = "video") {
  const cap = getCapability();
  const wanted = TIERS.indexOf(requested);
  let best = 0;
  if (cap.still && wanted >= 1) best = 1;
  if (cap.video && wanted >= 2) best = 2;
  return TIERS[best];
}

function shotBody(shot, tier) {
  // Stills are cheap and unique per shot; only video is worth generalising.
  const archetype = tier === "video" && reuseMode === "archetype" ? archetypeFor(shot) : null;
  return {
    id: shot.id,
    tier,
    kind: shot.kind,
    prompt: archetype?.prompt ?? shot.prompt,
    reuseKey: archetype?.key ?? "",
    seconds: shot.seconds ?? 6,
  };
}

// Kicks off generation without awaiting it, so the caller can keep playing the
// procedural shot while the network works.
export function prefetch(shot, tier = highestTier(), fetchImpl = fetch) {
  if (tier === "procedural") return null;
  // Shots sharing an archetype share a job, so a reused clip is fetched once.
  const archetype = tier === "video" && reuseMode === "archetype" ? archetypeFor(shot) : null;
  const key = `${archetype?.key ?? shot.id}:${tier}`;
  if (jobs.has(key)) return jobs.get(key);
  const job = fetchImpl("/api/shot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(shotBody(shot, tier)),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`shot ${res.status}`);
      const data = await res.json();
      if (!data.url) throw new Error("shot returned no url");
      return { ...data, tier, shotId: shot.id };
    })
    .catch((error) => ({ error: String(error), tier, shotId: shot.id }));
  jobs.set(key, job);
  return job;
}

// Resolves as soon as a usable asset exists, or `null` once the budget is spent
// -- callers treat null as "stay procedural", never as an error.
export async function resolve(shot, { tier = highestTier(), timeoutMs = 0, fetchImpl = fetch } = {}) {
  if (tier === "procedural") return null;
  const job = prefetch(shot, tier, fetchImpl);
  if (!job) return null;
  if (!timeoutMs) {
    const result = await job;
    return result.error ? null : result;
  }
  const raced = await Promise.race([
    job,
    new Promise((done) => setTimeout(() => done({ timeout: true }), timeoutMs)),
  ]);
  if (raced.timeout || raced.error) return null;
  return raced;
}

export function clearJobs() {
  jobs.clear();
}

export function jobCount() {
  return jobs.size;
}

// A shot is worth spending a slow video generation on only if it is a moment
// the player will remember. Everything else stays on the fast tiers.
export function deservesVideo(shot) {
  if (shot.clipKey) return true;
  return shot.kind === "fusion" || shot.kind === "finish" || shot.kind === "direct"
    || (shot.kind === "clash" && (shot.event?.attackerAtk ?? 0) >= 2000)
    || (shot.kind === "summon" && (shot.event?.atk ?? 0) >= 2400)
    || shot.kind === "trap";
}

export function planTiers(shots, { videoBudget = 2 } = {}) {
  const best = highestTier();
  let left = best === "video" ? videoBudget : 0;
  return shots.map((shot) => {
    if (left > 0 && deservesVideo(shot)) {
      left -= 1;
      return { shot, tier: "video" };
    }
    return { shot, tier: best === "procedural" ? "procedural" : "still" };
  });
}
