// Which cards an effect may be pointed at, and who decides.
//
// The engine used to pick for the player -- the strongest monster in the
// graveyard, the first matching host, the weakest card to discard. Those are
// the player's decisions. A spec here declares what an effect selects; the
// engine opens one window and the same list feeds the UI and the AI, so the two
// can never disagree about what is legal.

import { getCard } from "./cards/index.js";
import { effectiveStats, other } from "./duel-engine.js";
import { monstersOn } from "./duel-state.js";

const isMonsterCard = (inst) => getCard(inst.cardId).kind === "monster";

const POOLS = {
  foeMonster: (state, side) =>
    monstersOn(state, other(side)).map((inst) => entry(state, other(side), inst, "field")),

  anyMonster: (state, side) => [
    ...monstersOn(state, side).map((inst) => entry(state, side, inst, "field")),
    ...monstersOn(state, other(side)).map((inst) => entry(state, other(side), inst, "field")),
  ],

  ownMonster: (state, side) =>
    monstersOn(state, side).map((inst) => entry(state, side, inst, "field")),

  graveyardMonster: (state, side) => [
    ...state.sides[side].graveyard, ...state.sides[other(side)].graveyard,
  ].filter((inst) => isMonsterCard(inst) && !getCard(inst.cardId).token)
    .map((inst) => entry(state, side, inst, "graveyard")),

  foeBackrow: (state, side) =>
    state.sides[other(side)].backrow.filter(Boolean)
      .map((inst) => entry(state, other(side), inst, "backrow")),

  hand: (state, side) => state.sides[side].hand.map((inst) => entry(state, side, inst, "hand")),

  handDragon: (state, side) => state.sides[side].hand
    .filter((inst) => getCard(inst.cardId).type === "Dragon")
    .map((inst) => entry(state, side, inst, "hand")),
};

function entry(state, owner, inst, where) {
  const card = getCard(inst.cardId);
  const live = where === "field" && card.kind === "monster"
    ? effectiveStats(state, owner, inst) : null;
  return {
    uid: inst.uid,
    name: inst.faceDown && where !== "hand" ? "Face-down card" : card.name,
    detail: live ? `${live.atk} ATK` : (card.kind === "monster" ? `${card.atk} ATK` : card.kind),
    owner,
    where,
  };
}

/**
 * What a card asks the player to choose, or null when it needs no target.
 * Derived from the effect rather than declared per card, so a new card with a
 * known op gets targeting for free.
 */
export function targetSpecFor(card) {
  const effect = card?.effect;
  if (!effect) return null;
  switch (effect.op) {
    case "takeControl":
      return { pool: "foeMonster", count: 1, prompt: "Choose a monster to take control of" };
    case "revive":
      return {
        pool: "graveyardMonster", count: 1,
        prompt: "Choose a monster to revive", choosePosition: true,
      };
    case "ringOfDestruction":
      return { pool: "anyMonster", count: 1, prompt: "Choose a monster to destroy" };
    case "modifyAtk":
      return effect.target === "any"
        ? { pool: "anyMonster", count: 1, prompt: "Choose a monster to weaken" }
        : null;
    case "equip":
      return { pool: "ownMonster", count: 1, prompt: "Choose a monster to equip", filter: "equip" };
    case "destroyFoeBackrow":
      // De-Spell destroys Spells only, so it must not offer a Trap.
      return effect.limit
        ? {
          pool: "foeBackrow", count: effect.limit,
          prompt: `Choose a ${effect.only ?? "Spell or Trap"} to destroy`,
          onlyKind: effect.only ?? null,
        }
        : null;
    case "summonFromHand":
      return {
        pool: "handDragon", count: effect.count,
        prompt: "Choose Dragons to summon", optional: true, choosePosition: true,
      };
    case "draw":
      return effect.discard
        ? { pool: "hand", count: effect.discard, prompt: "Choose cards to discard", after: "draw" }
        : null;
    default:
      return null;
  }
}

/** The selectable cards for a spec, already labelled for the UI. */
export function targetOptions(state, side, spec, card) {
  if (!spec) return [];
  let options = (POOLS[spec.pool] ?? (() => []))(state, side);
  if (spec.filter === "equip") {
    options = options.filter((option) => equipFits(state, side, option.uid, card));
  }
  if (spec.onlyKind) {
    options = options.filter((option) => getCard(option.uid.split("#")[0]).kind === spec.onlyKind);
  }
  return options;
}

function equipFits(state, side, uid, card) {
  const req = card?.effect?.requires;
  if (!req) return true;
  const inst = monstersOn(state, side).find((m) => m.uid === uid);
  if (!inst) return false;
  const target = getCard(inst.cardId);
  if (req.attribute) return target.attribute === req.attribute;
  if (req.type) return target.type === req.type;
  if (req.name) return target.name === req.name || target.treatedAs === req.name;
  return true;
}

/** What the engine would have chosen on its own — the AI's pick, and the fallback. */
export function autoTargets(state, side, spec, card) {
  const options = targetOptions(state, side, spec, card);
  if (!options.length) return [];
  const byStrength = (a, b) => strength(state, b) - strength(state, a);
  const ranked = spec.pool === "hand"
    ? [...options].sort((a, b) => strength(state, a) - strength(state, b)) // discard the weakest
    : [...options].sort(byStrength);                                       // take the strongest
  return ranked.slice(0, spec.count).map((option) => option.uid);
}

function strength(state, option) {
  const card = getCard(option.uid.split("#")[0]);
  return card?.atk ?? 0;
}

/** True when the player has a real decision rather than a forced one. */
export function needsChoice(state, side, spec, card) {
  if (!spec) return false;
  const options = targetOptions(state, side, spec, card);
  return options.length > spec.count;
}
