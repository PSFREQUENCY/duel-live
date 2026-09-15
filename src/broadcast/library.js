// The clip library live mode actually needs: the reachable keys, split by the
// tier their subject is filmed at. Kept apart from keys.js so the scripts can
// import a deck walk without pulling in the canvas.

import { CARDS } from "../cards/index.js";
import { DUELISTS } from "../duelists.js";
import { reachableKeys, splitByTier } from "./keys.js";

const FAMILY = {
  Dragon: "dragon", "Sea Serpent": "dragon",
  Warrior: "warrior", "Beast-Warrior": "warrior",
  Spellcaster: "spellcaster", Fiend: "fiend",
  Beast: "beast", "Winged Beast": "winged", Fairy: "winged",
};

function monstersIn(duelists) {
  const out = [];
  for (const duelist of duelists) {
    for (const id of [...duelist.deck, ...duelist.extra]) {
      const card = CARDS[id];
      if (!card || card.kind !== "monster" || card.token) continue;
      out.push({ attribute: card.attribute ?? "DARK", family: FAMILY[card.type] ?? "other" });
    }
  }
  return out;
}

/** Every key the live grammar can reach, split into stills and video. */
export function liveLibrary(duelists = Object.values(DUELISTS)) {
  const keys = reachableKeys(monstersIn(duelists), {
    duelists: duelists.map((d) => d.id),
  });
  return { keys, ...splitByTier(keys) };
}
