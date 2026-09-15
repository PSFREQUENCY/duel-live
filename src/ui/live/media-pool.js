// Keys in, decodable elements out.
//
// The pool exists so the stage can ask "is there a picture for this key yet?"
// and get an answer immediately, every frame, without ever awaiting anything.
// A key that is still generating simply is not ready, and the stage draws the
// procedural floor instead. Nothing here is allowed to make the reel wait.

import { hasClip, resolve } from "../../cinema/free-video.js";
import { resolveClipKey } from "../../broadcast/clip-aliases.js";
import { shotRequestFor } from "../../broadcast/prompts.js";

const READY = "true";

/** A hidden element per asset, kept so a repeat key replays instantly. */
function makeNode(doc, tier, url) {
  const node = doc.createElement(tier === "video" ? "video" : "img");
  if (tier === "video") {
    node.muted = true;          // the score is the only audio; clips are SFX only
    node.loop = true;
    node.playsInline = true;
    node.preload = "auto";
    node.addEventListener("loadeddata", () => { node.dataset.ready = READY; });
    node.addEventListener("canplay", () => { node.play?.().catch(() => {}); });
  } else {
    node.addEventListener("load", () => { node.dataset.ready = READY; });
    node.decoding = "async";
  }
  node.addEventListener("error", () => { node.dataset.failed = READY; });
  node.src = url;
  return node;
}

export function createMediaPool({ doc = globalThis.document, tierFor, resolveImpl = resolve } = {}) {
  const nodes = new Map();        // key -> element
  const inflight = new Set();
  let requests = 0;

  function want(key, { actor } = {}) {
    if (!key || nodes.has(key) || inflight.has(key)) return;
    const tier = tierFor?.(key) ?? "still";
    if (tier === "procedural") return;
    const request = shotRequestFor(key, { tier });
    if (!request) return;
    inflight.add(key);
    requests += 1;
    // The reuse key is what makes one clip serve every shot that reads alike --
    // and what lets a key resolve to a hand-made clip shot under a different
    // naming scheme, which is better art at no cost.
    const reuseKey = resolveClipKey(key, { actor, hasClip });
    resolveImpl({ id: key, clipKey: reuseKey, kind: key.split(".")[0], ...request, reuseKey })
      .then((asset) => {
        inflight.delete(key);
        if (asset?.url) nodes.set(key, makeNode(doc, asset.tier ?? tier, asset.url));
      })
      .catch(() => { inflight.delete(key); });
  }

  return {
    /** Start fetching, and say nothing about when it will arrive. */
    want,
    /** Warm what is about to be needed, behind whatever is on screen now. */
    prefetch(shots) {
      for (const shot of shots) {
        if (typeof shot === "string") want(shot);
        else want(shot.key, { actor: shot.actor });
      }
    },
    /** The element for a key if it is decodable right now, else null. */
    get(key, options) {
      const node = nodes.get(key);
      if (!node) { want(key, options); return null; }
      if (node.dataset.failed === READY) return null;
      return node.dataset.ready === READY ? node : null;
    },
    has(key) { return nodes.has(key); },
    get stats() { return { held: nodes.size, inflight: inflight.size, requests }; },
    clear() { nodes.clear(); inflight.clear(); },
  };
}
