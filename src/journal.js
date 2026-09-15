// A record of what actually happened, so a bug can be looked at rather than
// remembered.
//
// The replay format already reproduces a duel from its seed and choices, which
// is the right way to re-run one. It is the wrong way to diagnose one: it says
// what was played and nothing about what the player saw, which shot was on
// screen, or what the interface did at the moment it went wrong. This keeps
// both -- the replay for re-running, and a timeline for reading.

const LIMIT = 600;                       // entries; a long duel is ~450
const STORE_KEY = "duel-live:journal";

const now = () => (globalThis.performance?.now?.() ?? 0);

/** Just enough of the board to tell what was on the table. */
export function snapshotOf(state) {
  if (!state) return null;
  const side = (key) => {
    const seat = state.sides[key];
    return {
      duelist: seat.duelistId,
      lp: seat.lp,
      hand: seat.hand.length,
      deck: seat.deck.length,
      monsters: seat.monsters.map((inst) => (inst
        ? { card: inst.cardId, position: inst.position, faceDown: Boolean(inst.faceDown) }
        : null)),
      backrow: seat.backrow.map((inst) => (inst
        ? { card: inst.cardId, faceDown: Boolean(inst.faceDown) }
        : null)),
      graveyard: seat.graveyard.map((inst) => inst.cardId),
    };
  };
  return {
    turn: state.turn,
    phase: state.phase,
    activeSide: state.activeSide,
    pending: state.pending ? { kind: state.pending.kind, side: state.pending.side } : null,
    winner: state.winner ?? null,
    player: side("player"),
    opponent: side("opponent"),
  };
}

export function createJournal({ store = globalThis.localStorage, limit = LIMIT } = {}) {
  let entries = [];
  let duel = null;
  const startedAt = Date.now();

  const push = (type, data) => {
    entries.push({ at: Math.round(now()), type, ...data });
    // Keep the tail: the end of a duel is where the bug was noticed.
    if (entries.length > limit) entries = entries.slice(-limit);
    return entries.length;
  };

  function persist() {
    // Best effort. A private window or a full quota is not an error worth
    // interrupting a duel over.
    try { store?.setItem(STORE_KEY, JSON.stringify(toJSON())); } catch { /* not available */ }
  }

  function toJSON() {
    return {
      version: 1,
      startedAt: new Date(startedAt).toISOString(),
      duel,
      entries,
      userAgent: globalThis.navigator?.userAgent ?? null,
    };
  }

  return {
    /** A new duel resets the timeline; the previous one is already persisted. */
    duelStarted(info) {
      entries = [];
      duel = { ...info, at: new Date().toISOString() };
      push("duel", { ...info });
      persist();
    },
    setContext(patch) { duel = { ...duel, ...patch }; },

    events(list, state) {
      for (const event of list) push("event", { event });
      if (state) push("state", { state: snapshotOf(state) });
      persist();
    },
    action(kind, detail) { push("action", { kind, detail }); persist(); },
    shot(shot) {
      push("shot", { key: shot?.key, lane: shot?.lane, tier: shot?.tier, actor: shot?.actor });
    },
    error(error, context) {
      push("error", { message: String(error?.message ?? error), stack: error?.stack ?? null, context });
      persist();
    },
    /** A player saying "this is wrong", which is the entry that matters most. */
    report(text, extra = {}) {
      push("report", { text, ...extra });
      persist();
      return toJSON();
    },

    toJSON,
    get size() { return entries.length; },
    get entries() { return entries.slice(); },
    /** The last duel recorded, including one that ended in a crash. */
    recover() {
      try { return JSON.parse(store?.getItem(STORE_KEY) ?? "null"); } catch { return null; }
    },
    clear() { entries = []; try { store?.removeItem(STORE_KEY); } catch { /* fine */ } },
  };
}

/** A readable digest, for the top of a bug report. */
export function summarise(journal) {
  const data = journal.toJSON ? journal.toJSON() : journal;
  const counts = {};
  for (const entry of data.entries) counts[entry.type] = (counts[entry.type] ?? 0) + 1;
  const last = [...data.entries].reverse().find((entry) => entry.type === "state");
  const errors = data.entries.filter((entry) => entry.type === "error");
  return {
    duel: data.duel,
    at: data.startedAt,
    counts,
    errors: errors.map((entry) => entry.message),
    board: last?.state ?? null,
  };
}
