// What you can actually fuse, and what you are missing.
//
// Polymerization is the one card in the deck whose legality depends on a
// recipe the player cannot see anywhere. Holding it and being told "there is
// nothing to fuse" is accurate and useless -- the question is always which
// two cards, and whether the missing one is in the deck or already gone.

import { getCard } from "./cards/index.js";

const nameOf = (id) => getCard(id)?.name ?? id;

/** Where each copy of a card currently is, from the player's own point of view. */
function locate(state, side) {
  const seat = state.sides[side];
  const where = new Map();
  const note = (inst, place) => {
    if (!inst) return;
    const list = where.get(inst.cardId) ?? [];
    list.push({ place, uid: inst.uid });
    where.set(inst.cardId, list);
  };
  for (const inst of seat.hand) note(inst, "hand");
  // A face-down monster of your own is still yours to know about.
  for (const inst of seat.monsters) note(inst, "field");
  for (const inst of seat.graveyard) note(inst, "graveyard");
  return where;
}

const AVAILABLE = new Set(["hand", "field"]);

/**
 * Every fusion in the Extra Deck, with each material marked by where it is.
 *
 * Sorted so the ones you can do right now come first, then the ones you are one
 * card away from -- which is the order the question is actually asked in.
 */
export function fusionOptions(state, side) {
  const seat = state.sides[side];
  const where = locate(state, side);

  const rows = seat.extra.map((inst) => {
    const card = getCard(inst.cardId);
    const used = new Map();
    const materials = (card.fusion ?? []).map((id) => {
      const copies = where.get(id) ?? [];
      const taken = used.get(id) ?? 0;
      const at = copies[taken];
      used.set(id, taken + 1);
      return {
        id,
        name: nameOf(id),
        place: at?.place ?? "missing",
        have: Boolean(at) && AVAILABLE.has(at.place),
      };
    });
    const missing = materials.filter((m) => !m.have);
    return {
      uid: inst.uid,
      name: card.name,
      atk: card.atk,
      def: card.def,
      materials,
      ready: missing.length === 0,
      missing: missing.map((m) => m.name),
    };
  });

  return rows.sort((a, b) => (b.ready - a.ready) || (a.missing.length - b.missing.length)
    || b.atk - a.atk);
}

/** One line per fusion, for the card panel. */
export function describeFusion(row) {
  const recipe = row.materials.map((m) => m.name).join(" + ");
  if (row.ready) return `${recipe} — ready`;
  if (row.missing.length === row.materials.length) return `${recipe} — you have none of these`;
  return `${recipe} — missing ${row.missing.join(" and ")}`;
}

/** Whether a fusion is possible at all right now. */
export const anyFusionReady = (state, side) =>
  fusionOptions(state, side).some((row) => row.ready);
