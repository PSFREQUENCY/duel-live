// `npm run shotlist` — writes prompts/ from the game's own data, so the list
// can never drift from the cards, duelists and archetypes the engine uses.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { libraryFor } from "../src/cinema/archetypes.js";
import { DUELISTS as GAME_DUELISTS } from "../src/duelists.js";
import { CONNECTIVE_SHOTS, DUELIST_SHOTS } from "./shot-bible.mjs";
import { ARENAS, assemble, LOOKS, STYLE, WORLD } from "../src/cinema/world.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "prompts");

function duelistShots() {
  const out = [];
  for (const [id, duelist] of Object.entries(LOOKS)) {
    for (const shot of DUELIST_SHOTS) {
      const subject = shot.subject
        .replaceAll("{look}", duelist.look)
        .replaceAll("{arena}", ARENAS[duelist.arena]);
      out.push({
        key: `${shot.id}-${id}`,
        category: "duelist",
        duelist: duelist.name,
        label: `${duelist.name} — ${shot.label}`,
        priority: shot.priority,
        seconds: shot.seconds,
        prompt: assemble(subject),
      });
    }
  }
  return out;
}

function monsterShots() {
  // Archetype prompts describe the creature; the bible supplies the world it
  // is being projected into, so hand-made clips match generated ones.
  return libraryFor(Object.values(GAME_DUELISTS)).map((entry) => ({
    key: entry.key,
    category: "monster",
    label: entry.key.replace(/-/g, " · "),
    priority: entry.key.startsWith("summon") || entry.key.startsWith("clash") ? 2 : 3,
    seconds: entry.seconds ?? 6,
    // Archetype prompts are already assembled through the same world bible.
    prompt: entry.prompt,
  }));
}

const connectiveShots = () => CONNECTIVE_SHOTS.map((shot) => ({
  key: shot.id,
  category: "arena",
  label: shot.label,
  priority: shot.priority,
  seconds: shot.seconds,
  prompt: assemble(shot.subject),
}));

const shots = [...duelistShots(), ...monsterShots(), ...connectiveShots()]
  .sort((a, b) => a.priority - b.priority || a.category.localeCompare(b.category) || a.key.localeCompare(b.key));

const byPriority = (n) => shots.filter((s) => s.priority === n);
const csvCell = (value) => `"${String(value).replaceAll('"', '""')}"`;

function sheet(list, heading) {
  const lines = [`## ${heading}`, ""];
  for (const shot of list) {
    lines.push(`### \`${shot.key}.mp4\` — ${shot.label}`, "",
      `*${shot.seconds}s · 16:9 · 480p is fine*`, "", "```", shot.prompt, "```", "");
  }
  return lines.join("\n");
}

await mkdir(OUT, { recursive: true });

await writeFile(join(OUT, "manifest.json"), `${JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  total: shots.length,
  style: STYLE,
  world: WORLD,
  shots,
}, null, 2)}\n`);

await writeFile(join(OUT, "manifest.csv"),
  `${["key", "filename", "category", "priority", "seconds", "label", "prompt"].join(",")}\n${
    shots.map((s) => [s.key, `${s.key}.mp4`, s.category, s.priority, s.seconds, s.label, s.prompt]
      .map(csvCell).join(",")).join("\n")}\n`);

await writeFile(join(OUT, "ALL-PROMPTS.md"), [
  "# Duel Live — every prompt", "",
  `${shots.length} clips. Generate at **16:9**, **480p is enough**, durations as noted.`,
  "Save each file as the filename in its heading and drop it in `clips/`.", "",
  "The first two sentences of every prompt are identical on purpose — that shared",
  "style and world block is what makes separate generations cut together as one show.",
  "Do not edit them.", "",
  sheet(byPriority(1), "Priority 1 — do these first (the game feels finished with just these)"),
  sheet(byPriority(2), "Priority 2 — depth"),
  sheet(byPriority(3), "Priority 3 — completeness"),
].join("\n"));

await writeFile(join(OUT, "CHECKLIST.md"), [
  "# Clip checklist", "",
  "Tick as you generate. `npm run clips` reports the same thing from what is",
  "actually in `clips/`.", "",
  ...[1, 2, 3].flatMap((p) => [
    `## Priority ${p} — ${byPriority(p).length} clips`, "",
    ...byPriority(p).map((s) => `- [ ] \`${s.key}.mp4\` — ${s.label} (${s.seconds}s)`), "",
  ]),
].join("\n"));

const counts = shots.reduce((acc, s) => ({ ...acc, [s.category]: (acc[s.category] ?? 0) + 1 }), {});
console.log(`prompts/  ${shots.length} clips  ·  ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`priority  1: ${byPriority(1).length}   2: ${byPriority(2).length}   3: ${byPriority(3).length}`);
console.log("wrote     ALL-PROMPTS.md · CHECKLIST.md · manifest.json · manifest.csv");
