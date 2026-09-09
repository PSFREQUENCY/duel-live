// The board.
//
// Every zone has a stable id, so the storyboard, the animation layer and the
// targeting interface all address the same thing by name rather than by index
// into whichever array happens to hold it. "Move a card from p0.mon.1 to p0.gy"
// then becomes a sentence rather than a lookup.

export const SIDE_IDS = { player: "p0", opponent: "p1" };

export const ZONE_KINDS = ["mon", "st", "field", "deck", "extra", "gy", "banished", "hand"];

export const MONSTER_ZONES = 5;
export const SPELL_TRAP_ZONES = 5;

/** `p0.mon.2`, `p1.st.0`, `p0.field`, `p1.gy`. */
export const zoneId = (side, kind, index) =>
  index === undefined ? `${SIDE_IDS[side]}.${kind}` : `${SIDE_IDS[side]}.${kind}.${index}`;

export function parseZoneId(id) {
  const [prefix, kind, index] = String(id).split(".");
  const side = Object.keys(SIDE_IDS).find((key) => SIDE_IDS[key] === prefix);
  if (!side || !ZONE_KINDS.includes(kind)) return null;
  return { side, kind, index: index === undefined ? undefined : Number(index) };
}

/**
 * Board rows from the top of the screen down, with the local player at the
 * bottom. The two monster rows must meet across the centre line, or every
 * combat animation reads backwards.
 */
export const ROW_ORDER = [
  { id: "opponent-st", side: "opponent", kind: "st" },
  { id: "opponent-mon", side: "opponent", kind: "mon" },
  { id: "player-mon", side: "player", kind: "mon" },
  { id: "player-st", side: "player", kind: "st" },
];

export const CENTRE_LINE_AFTER = 1;   // index in ROW_ORDER the centre line follows

/** Where a card instance currently sits, or null when it is nowhere. */
export function locate(state, uid) {
  for (const side of ["player", "opponent"]) {
    const s = state.sides[side];
    for (const [kind, list] of [["mon", s.monsters], ["st", s.backrow]]) {
      const index = list.findIndex((inst) => inst?.uid === uid);
      if (index >= 0) return { side, kind, index, id: zoneId(side, kind, index) };
    }
    for (const [kind, list] of [["hand", s.hand], ["gy", s.graveyard],
      ["extra", s.extra], ["deck", s.deck], ["banished", s.banished ?? []]]) {
      if (list.some((inst) => inst.uid === uid)) return { side, kind, id: zoneId(side, kind) };
    }
    if (s.field?.uid === uid) return { side, kind: "field", id: zoneId(side, "field") };
  }
  return null;
}

/** A readable snapshot of every zone, for the interface and for tests. */
export function boardSnapshot(state) {
  const rows = ROW_ORDER.map((row) => ({
    ...row,
    zones: (row.kind === "mon" ? state.sides[row.side].monsters : state.sides[row.side].backrow)
      .map((inst, index) => ({ id: zoneId(row.side, row.kind, index), inst })),
  }));
  const piles = {};
  for (const side of ["player", "opponent"]) {
    const s = state.sides[side];
    piles[side] = {
      field: { id: zoneId(side, "field"), inst: s.field ?? null },
      deck: { id: zoneId(side, "deck"), count: s.deck.length },
      extra: { id: zoneId(side, "extra"), count: s.extra.length, cards: s.extra },
      gy: { id: zoneId(side, "gy"), count: s.graveyard.length, cards: s.graveyard },
      banished: { id: zoneId(side, "banished"), count: (s.banished ?? []).length,
        cards: s.banished ?? [] },
      hand: { id: zoneId(side, "hand"), count: s.hand.length },
    };
  }
  return { rows, piles };
}
