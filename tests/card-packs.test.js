// WP9: card packs. Cards were already data; this makes them a loadable format,
// so the engine is not bound to any one card set and a deck builder becomes a
// small UI over this shape.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  COPY_LIMIT, EXTRA_DECK_MAX, MAIN_DECK_MAX, MAIN_DECK_MIN, PACK_VERSION,
  packFromCards, shotKeyFor, validateCard, validateDeck, validatePack,
} from "../src/card-packs.js";
import { CARDS } from "../src/cards/index.js";
import { DUELISTS } from "../src/duelists.js";

const built = packFromCards(CARDS, DUELISTS, { packId: "test", name: "Test" });
const deckOf = (n, id = "a") => ({ main: Array(n).fill(0).map((_, i) => `${id}${i}`), extra: [] });

test("the existing card set validates as a pack", () => {
  assert.deepEqual(validatePack(built), [],
    "if the real set will not round-trip, the format cannot carry a real set");
  assert.equal(built.version, PACK_VERSION);
  assert.ok(built.cards.length > 70);
  assert.equal(built.decks.length, 4);
});

test("the exported pack on disk matches what the code produces", () => {
  const onDisk = JSON.parse(
    readFileSync(new URL("../packs/duel-live-classic.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(validatePack(onDisk), []);
  assert.equal(onDisk.cards.length, built.cards.length,
    "packs/ is stale — run npm run pack");
});

test("a monster carries everything the engine needs to play it", () => {
  const dragon = built.cards.find((card) => card.id === "blueEyes");
  assert.equal(dragon.type, "monster");
  for (const field of ["level", "atk", "def", "attribute", "family"]) {
    assert.ok(dragon[field] !== undefined, `missing ${field}`);
  }
  assert.equal(dragon.atk, 3000);
  assert.equal(dragon.shotKey, "summon.light.dragon");
});

test("a spell or trap carries its speed, timings and effect", () => {
  const trap = built.cards.find((card) => card.id === "mirrorForce");
  assert.equal(trap.type, "trap");
  assert.equal(trap.spellSpeed, 2);
  assert.ok(Array.isArray(trap.timings) && trap.timings.length > 0);
  assert.ok(trap.effect?.op, "an effect without an op cannot be resolved");

  const counter = built.cards.find((card) => card.id === "negateAttack");
  assert.equal(counter.spellSpeed, 3, "a Counter Trap must carry its speed");
});

test("a broken card is reported rather than accepted", () => {
  assert.deepEqual(validateCard({ id: "x", name: "X", type: "spell" }), []);
  assert.ok(validateCard({ name: "No id", type: "spell" }).some((p) => p.includes("id")));
  assert.ok(validateCard({ id: "x", name: "X", type: "wardrobe" }).some((p) => p.includes("wardrobe")));
  const monster = validateCard({ id: "m", name: "M", type: "monster", level: 99, atk: -1, def: 0 });
  assert.ok(monster.some((p) => p.includes("out of range")));
  assert.ok(monster.some((p) => p.includes("negative")));
});

test("deck rules are enforced: size, extra deck, three copies", () => {
  assert.deepEqual(validateDeck(deckOf(MAIN_DECK_MIN)), []);
  assert.ok(validateDeck(deckOf(MAIN_DECK_MIN - 1)).some((p) => p.includes("minimum")));
  assert.ok(validateDeck(deckOf(MAIN_DECK_MAX + 1)).some((p) => p.includes("maximum")));
  assert.ok(
    validateDeck({ main: Array(MAIN_DECK_MIN).fill("same"), extra: [] })
      .some((p) => p.includes(`limit is ${COPY_LIMIT}`)),
  );
  assert.ok(
    validateDeck({ ...deckOf(MAIN_DECK_MIN), extra: Array(EXTRA_DECK_MAX + 1).fill(0).map((_, i) => `e${i}`) })
      .some((p) => p.includes("extra deck")),
  );
});

test("a deck cannot reference a card the pack does not contain", () => {
  const ids = new Set(built.cards.map((card) => card.id));
  const problems = validateDeck({ main: [...Array(40).fill(0).map((_, i) => `x${i}`)], extra: [] }, ids);
  assert.ok(problems.some((p) => p.includes("not in this pack")));
});

test("every deck in the pack is legal by its own rules", () => {
  const ids = new Set(built.cards.map((card) => card.id));
  for (const deck of built.decks) {
    assert.deepEqual(validateDeck(deck, ids), [], `${deck.name} is not a legal deck`);
  }
});

test("every card gets a shot key, so nothing is unrenderable", () => {
  for (const card of built.cards) {
    assert.ok(card.shotKey, `${card.id} has no shot key`);
    assert.doesNotMatch(card.shotKey, /undefined/, `${card.id} has a broken shot key`);
  }
  assert.equal(shotKeyFor(CARDS.darkMagician), "summon.dark.spellcaster");
  assert.equal(shotKeyFor(CARDS.mirrorForce), "trap");
  assert.equal(shotKeyFor(CARDS.darkHole), "spell");
});

test("a pack with a duplicate id is refused", () => {
  const twins = { ...built, cards: [...built.cards, built.cards[0]] };
  assert.ok(validatePack(twins).some((p) => p.includes("duplicate")));
});

test("tokens are not shipped in a pack, since they are never in a deck", () => {
  assert.equal(built.cards.some((card) => card.id === "sheepToken"), false);
});
