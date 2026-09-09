// Card packs.
//
// Cards are already data; this makes them a *loadable* format, so the engine is
// not bound to any one card set. Adding a card becomes editing JSON, a deck
// builder becomes a small UI over this shape, and the public default can ship
// with no third-party names in it.

import { spellSpeed } from "./duel-chain.js";
import { timingsFor } from "./duel-damage-step.js";

export const PACK_VERSION = 1;

const REQUIRED = ["id", "name", "type"];

/** Validate one card. Returns a list of problems; empty means it is fine. */
export function validateCard(card) {
  const problems = [];
  for (const field of REQUIRED) {
    if (!card?.[field]) problems.push(`missing ${field}`);
  }
  if (card?.type === "monster") {
    for (const field of ["level", "atk", "def", "attribute", "family"]) {
      if (card[field] === undefined) problems.push(`monster missing ${field}`);
    }
    if (card.level < 1 || card.level > 12) problems.push(`level ${card.level} is out of range`);
    if (card.atk < 0 || card.def < 0) problems.push("negative stats");
  } else if (card?.type && !["spell", "trap"].includes(card.type)) {
    problems.push(`unknown type ${card.type}`);
  }
  return problems;
}

/** Validate a whole pack, decks included. */
export function validatePack(pack) {
  const problems = [];
  if (pack?.version !== PACK_VERSION) problems.push(`pack version must be ${PACK_VERSION}`);
  if (!pack?.packId) problems.push("missing packId");
  if (!Array.isArray(pack?.cards) || !pack.cards.length) problems.push("pack has no cards");

  const ids = new Set();
  for (const card of pack?.cards ?? []) {
    for (const problem of validateCard(card)) problems.push(`${card.id ?? "?"}: ${problem}`);
    if (ids.has(card.id)) problems.push(`${card.id}: duplicate id`);
    ids.add(card.id);
  }

  for (const deck of pack?.decks ?? []) {
    problems.push(...validateDeck(deck, ids).map((p) => `${deck.name ?? "?"}: ${p}`));
  }
  return problems;
}

export const MAIN_DECK_MIN = 40;
export const MAIN_DECK_MAX = 60;
export const EXTRA_DECK_MAX = 15;
export const COPY_LIMIT = 3;

/** The rules a deck must satisfy: size, extra deck size, three copies. */
export function validateDeck(deck, knownIds = null) {
  const problems = [];
  const main = deck?.main ?? [];
  const extra = deck?.extra ?? [];

  if (main.length < MAIN_DECK_MIN) problems.push(`main deck has ${main.length}, minimum is ${MAIN_DECK_MIN}`);
  if (main.length > MAIN_DECK_MAX) problems.push(`main deck has ${main.length}, maximum is ${MAIN_DECK_MAX}`);
  if (extra.length > EXTRA_DECK_MAX) problems.push(`extra deck has ${extra.length}, maximum is ${EXTRA_DECK_MAX}`);

  const counts = {};
  for (const id of [...main, ...extra]) {
    counts[id] = (counts[id] ?? 0) + 1;
    if (knownIds && !knownIds.has(id)) problems.push(`${id} is not in this pack`);
  }
  for (const [id, n] of Object.entries(counts)) {
    if (n > COPY_LIMIT) problems.push(`${n} copies of ${id}; the limit is ${COPY_LIMIT}`);
  }
  return [...new Set(problems)];
}

/**
 * Turn the in-repo card table into a pack. Running the existing set through the
 * same format is what proves the format can carry a real card set rather than a
 * toy one.
 */
export function packFromCards(cards, duelists, { packId, name }) {
  const out = Object.values(cards).filter((card) => !card.token).map((card) => {
    const base = {
      id: card.id, name: card.name, type: card.kind,
      shotKey: shotKeyFor(card),
    };
    if (card.kind === "monster") {
      return {
        ...base, level: card.level, atk: card.atk, def: card.def,
        attribute: card.attribute, family: card.type,
        ...(card.fusion && { fusion: card.fusion }),
      };
    }
    return {
      ...base,
      sub: card.sub,
      text: card.text,
      spellSpeed: spellSpeed(card),
      timings: timingsFor(card),
      ...(card.trigger && { trigger: card.trigger }),
      ...(card.effect && { effect: card.effect }),
    };
  });

  return {
    version: PACK_VERSION,
    packId,
    name,
    cards: out,
    decks: Object.values(duelists).map((duelist) => ({
      name: duelist.name,
      duelistId: duelist.id,
      main: duelist.deck,
      extra: duelist.extra,
    })),
  };
}

const FAMILY_SLUG = {
  Dragon: "dragon", "Sea Serpent": "dragon", Warrior: "warrior", "Beast-Warrior": "warrior",
  Spellcaster: "spellcaster", Fiend: "fiend", Beast: "beast",
  "Winged Beast": "winged", Fairy: "winged",
};

/** The clip this card's summon should play, in the archetype key's own shape. */
export function shotKeyFor(card) {
  if (card.kind !== "monster") return card.kind === "trap" ? "trap" : "spell";
  return `summon.${card.attribute.toLowerCase()}.${FAMILY_SLUG[card.type] ?? "other"}`;
}
