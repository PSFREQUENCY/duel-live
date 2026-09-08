// `npm run clips:preview` — builds a filmstrip for every clip in clips/.
//
// A clip is ten seconds long and often opens on two seconds of empty arena, so
// a single frame is not evidence of what is in it. One frame per second is.

import { mkdir, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { clipKeys } from "../src/clip-library.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLIPS = join(ROOT, "clips");
const OUT = join(CLIPS, "previews");
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";

const run = (args) =>
    new Promise((done) => {
        const child = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("error", () => done({ ok: false, stderr: `${FFMPEG} not found` }));
        child.on("close", (code) => done({ ok: code === 0, stderr }));
    });

const files = (await readdir(CLIPS).catch(() => []))
    .filter((f) => /\.(mp4|webm|mov|m4v)$/i.test(f));

if (!files.length) {
    console.log("Nothing in clips/ yet. See prompts/ALL-PROMPTS.md.");
    process.exit(0);
}

await mkdir(OUT, { recursive: true });
const known = new Set(await clipKeys(CLIPS));
let made = 0;
let failed = 0;

for (const file of files) {
    const name = file.replace(/\.[^.]+$/, "");
    const target = join(OUT, `${name}.jpg`);
    // fps=1 with a 5x2 tile gives ten seconds at a glance.
    const result = await run([
        "-v", "error", "-i", join(CLIPS, file),
        "-vf", "fps=1,scale=300:-1,tile=5x2", "-frames:v", "1", target, "-y",
    ]);
    if (result.ok) { made += 1; console.log(`  ${file.padEnd(30)} → previews/${name}.jpg`); }
    else { failed += 1; console.log(`  ${file.padEnd(30)} failed — ${result.stderr.trim().slice(0, 70)}`); }
}

console.log(`\n${made} filmstrip${made === 1 ? "" : "s"} in clips/previews/${failed ? `, ${failed} failed` : ""}`);
console.log(`${known.size} clip${known.size === 1 ? "" : "s"} indexed. Check a strip before trusting a filename.`);
if (failed) console.log("ffmpeg is required; set FFMPEG_PATH if it is not on PATH.");
