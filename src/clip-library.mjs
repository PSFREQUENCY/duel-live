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

/**
 * The same words in any order. Used only as a fallback after an exact match,
 * so `play yugi summon` finds `play-summon-yugi` without a rename. Safe
 * because no two clip keys share a word set -- a test enforces that.
 */
export const clipWordSet = (name) =>
    normaliseClipKey(name).split("-").filter(Boolean).sort().join("-");

let cache = { at: 0, dir: null, index: new Map(), byWords: new Map() };

export async function scanClips(dir) {
    const now = Date.now();
    if (cache.dir === dir && now - cache.at < RESCAN_MS) return cache.index;

    const index = new Map();
    const byWords = new Map();
    try {
        for (const file of await readdir(dir)) {
            if (!VIDEO.has(extname(file).toLowerCase())) continue;
            const key = normaliseClipKey(file);
            // First match wins, so a stray duplicate cannot flip which file
            // plays between two scans.
            if (!index.has(key)) index.set(key, file);
            const words = clipWordSet(file);
            if (!byWords.has(words)) byWords.set(words, file);
        }
    } catch {
        // No clips directory yet is normal, not an error.
    }
    cache = { at: now, dir, index, byWords };
    return index;
}

/** The filename backing a clip key, or null when nothing matches. */
export async function findClip(dir, key) {
    if (!key) return null;
    const index = await scanClips(dir);
    return index.get(normaliseClipKey(key))
        ?? cache.byWords.get(clipWordSet(key))
        ?? null;
}

export async function clipCount(dir) {
    return (await scanClips(dir)).size;
}

/** Clip keys present on disk, for the coverage report. */
export async function clipKeys(dir) {
    return [...(await scanClips(dir)).keys()];
}

/** Word-set keys present on disk, so a report can resolve transposed names. */
export async function clipWordSets(dir) {
    await scanClips(dir);
    return [...cache.byWords.keys()];
}

export async function clipIsReadable(dir, file) {
    try {
        return (await stat(join(dir, file))).size > 1024;
    } catch {
        return false;
    }
}
