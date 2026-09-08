import { MONSTERS, FUSION_MONSTERS } from "./monsters.js";
import { SPELLS } from "./spells.js";
import { TRAPS } from "./traps.js";

export { MONSTERS, FUSION_MONSTERS, SPELLS, TRAPS };

export const CARDS = { ...MONSTERS, ...SPELLS, ...TRAPS };

export function getCard(id) {
  const card = CARDS[id];
  if (!card) throw new Error(`Unknown card id: ${id}`);
  return card;
}

export const isMonster = (card) => card?.kind === "monster";
export const isSpell = (card) => card?.kind === "spell";
export const isTrap = (card) => card?.kind === "trap";
