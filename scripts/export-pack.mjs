// `npm run pack` — write the in-repo card set out as a loadable pack.
//
// Running the existing set through the same format is what proves the format
// can carry a real card set rather than a toy one.

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { packFromCards, validatePack } from "../src/card-packs.js";
import { CARDS } from "../src/cards/index.js";
import { DUELISTS } from "../src/duelists.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const pack = packFromCards(CARDS, DUELISTS, {
  packId: "duel-live-classic",
  name: "Duel Live — Classic",
});

const problems = validatePack(pack);
if (problems.length) {
  console.error(`${problems.length} problem(s) in the pack:`);
  for (const problem of problems.slice(0, 20)) console.error(`  ${problem}`);
  process.exit(1);
}

await mkdir(join(ROOT, "packs"), { recursive: true });
const path = join(ROOT, "packs", `${pack.packId}.json`);
await writeFile(path, `${JSON.stringify(pack, null, 2)}\n`);

const monsters = pack.cards.filter((c) => c.type === "monster").length;
console.log(`packs/${pack.packId}.json`);
console.log(`  ${pack.cards.length} cards (${monsters} monsters) · ${pack.decks.length} decks`);
for (const deck of pack.decks) {
  console.log(`  ${deck.name.padEnd(16)} main ${deck.main.length} · extra ${deck.extra.length}`);
}
