// Index of hand-made clips in clips/.
//
// Files arrive from whatever tool generated them, so names come in with spaces,
// underscores, mixed case and different containers. Matching is done on a
// normalised form rather than an exact filename, so a clip you drop in works
// without being renamed first.

import { readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";

const VIDEO = new Set([".mp4", ".webm", ".mov", ".m4v"]);
const RESCAN_MS = 5_000;

/** `Arena Cliff.mp4`, `arena_cliff.MOV` and `arena-cliff.webm` all key alike. */
export function normaliseClipKey(name) {
    return name
        .replace(/\.[^.]+$/, "")
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-");
}

let cache = { at: 0, dir: null, index: new Map() };

export async function scanClips(dir) {
    const now = Date.now();
    if (cache.dir === dir && now - cache.at < RESCAN_MS) return cache.index;

    const index = new Map();
    try {
        for (const file of await readdir(dir)) {
            if (!VIDEO.has(extname(file).toLowerCase())) continue;
            const key = normaliseClipKey(file);
            // First match wins, so a stray duplicate cannot flip which file
            // plays between two scans.
            if (!index.has(key)) index.set(key, file);
        }
    } catch {
        // No clips directory yet is normal, not an error.
    }
    cache = { at: now, dir, index };
    return index;
}

/** The filename backing a clip key, or null when nothing matches. */
export async function findClip(dir, key) {
    if (!key) return null;
    return (await scanClips(dir)).get(normaliseClipKey(key)) ?? null;
}

export async function clipCount(dir) {
    return (await scanClips(dir)).size;
}

/** Clip keys present on disk, for the coverage report. */
export async function clipKeys(dir) {
    return [...(await scanClips(dir)).keys()];
}

export async function clipIsReadable(dir, file) {
    try {
        return (await stat(join(dir, file))).size > 1024;
    } catch {
        return false;
    }
}
