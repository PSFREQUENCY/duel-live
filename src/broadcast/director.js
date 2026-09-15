// Engine event → a cut sequence, budgeted by how much the moment is worth.
//
// The engine has already decided the duel. Nothing here can change it; the only
// question is how it is shown. That separation is what lets the reel drop shots
// under pressure without the duel ever being wrong.

import { CARDS } from "../cards/index.js";
import { dramaFor, holdMultiplier, shotBudget } from "./drama.js";
import { GRAMMAR, beatFor, resolveKey, shotFrom } from "./shot-grammar.js";
import { truncate } from "./reel.js";

const FAMILY = {
  Dragon: "dragon", "Sea Serpent": "dragon",
  Warrior: "warrior", "Beast-Warrior": "warrior",
  Spellcaster: "spellcaster", Fiend: "fiend",
  Beast: "beast", "Winged Beast": "winged", Fairy: "winged",
};
export const FAMILIES = [...new Set([...Object.values(FAMILY), "other"])];
export const ATTRIBUTES = ["DARK", "LIGHT", "FIRE", "WIND", "EARTH", "WATER"];

let byName = null;
function cardNamed(name) {
  byName ??= Object.fromEntries(Object.values(CARDS).map((c) => [c.name, c]));
  return byName[name] ?? null;
}

function creature(name) {
  const card = cardNamed(name);
  if (!card || card.kind !== "monster") return { attr: "DARK", fam: "other" };
  return { attr: card.attribute ?? "DARK", fam: FAMILY[card.type] ?? "other" };
}

const other = (side) => (side === "player" ? "opponent" : "player");
const duelistOn = (state, side) => state?.sides?.[side]?.duelistId ?? "yugi";

/** The placeholders the table can ask for, resolved from one engine event. */
function varsFor(event, state) {
  const actor = event.side ?? "player";
  const subject = creature(event.attacker ?? event.card ?? event.title ?? "");
  const damage = event.damage ?? event.amount ?? 0;
  return {
    ...subject,
    atk: duelistOn(state, actor),
    def: duelistOn(state, other(actor)),
    opp: duelistOn(state, other(actor)),
    winner: duelistOn(state, event.side === "draw" ? "player" : actor),
    // A big monster earns a harder reaction than a small one; that variance is
    // the difference between a reaction shot and a reaction cutaway.
    mood: (event.atk ?? 0) >= 2000 ? "pressed" : "steady",
    weight: damage >= 1500 ? "heavy" : "light",
    phase: event.phase === "battle" ? "battle" : "end",
    cardType: event.reveal ? "trap" : "spell",
  };
}

// A phase change is a breather, not a beat. It earns a shot only when nothing
// more interesting is happening -- otherwise it is filler between real moments.
const BREATHER_MAX_DRAMA = 0.3;

/**
 * One sequence per event, or null when the event does not earn one.
 *
 * The sequence is already truncated to its drama budget, so the reel receives
 * what the director intends rather than everything that might be shown.
 */
export function directEvent(event, state, { eventId = event.type, recentDrama = 0 } = {}) {
  const beat = beatFor(event);
  if (!beat) return null;
  const drama = dramaFor(event, state);
  // A phase event always scores 0.15 on its own, so gating on that would fire a
  // stinger at every phase of every turn. The rule only does work read against
  // the drama around it: a breather belongs in a quiet stretch, not on the beat
  // after a trap flip.
  if (beat === "phase" && recentDrama > BREATHER_MAX_DRAMA) return null;

  const vars = varsFor(event, state);
  const multiplier = holdMultiplier(drama);
  const shots = GRAMMAR[beat]
    .map(([template, rank]) => shotFrom(resolveKey(template, vars), rank, { multiplier }));

  return { eventId, drama, beat, shots: truncate(shots, shotBudget(drama)) };
}

// How fast the memory of a loud moment fades. A breather two events after a
// lethal swing still reads as interrupting it; six events later it does not.
const DRAMA_DECAY = 0.7;

/**
 * A turn's worth of events as sequences, in order.
 *
 * Phase stingers are held back and at most one survives, and only when the turn
 * produced nothing else. A duel changes phase six times a turn; a stinger on
 * each is not a breather, it is a metronome. The breather earns its place only
 * on a turn where nothing happened -- which is exactly the turn that would
 * otherwise fall through to the ambient lane.
 */
export function direct(events, state, { turn = state?.turn ?? 1, recentDrama = 0 } = {}) {
  const out = [];
  const breathers = [];
  let recent = recentDrama;
  events.forEach((event, i) => {
    const sequence = directEvent(event, state, {
      eventId: `t${turn}-${i}-${event.type}`, recentDrama: recent,
    });
    recent *= DRAMA_DECAY;
    if (!sequence) return;
    recent = Math.max(recent, sequence.drama);
    if (sequence.beat === "phase") breathers.push(sequence);
    else out.push(sequence);
  });
  if (out.length) return out;
  // Entering the Battle Phase is the transition worth marking; ending a turn is
  // bookkeeping, and only stands in when there is nothing else at all.
  const battle = breathers.find((s) => s.shots[0].key === "phase.battle");
  const chosen = battle ?? breathers[0];
  return chosen ? [chosen] : [];
}

/**
 * A director with memory, for callers that hand it events a few at a time.
 *
 * `direct` is batch-scoped and pure, which is right for a whole turn but wrong
 * for the live app: it presents each action as it happens, so a batch holding
 * nothing but a phase change always looks like an empty turn and earns a
 * stinger. Thirteen stingers in ten turns is a metronome. The rule the spec
 * wants -- a breather only where nothing else is happening -- needs to be
 * judged across a turn, not across a batch.
 */
export function createDirector() {
  let turn = 0;
  let actedThisTurn = false;
  let breatherTurn = -1;
  let recent = 0;

  return {
    direct(events, state) {
      const now = state?.turn ?? turn;
      if (now !== turn) { turn = now; actedThisTurn = false; }

      const sequences = direct(events, state, { turn, recentDrama: recent });
      const real = sequences.filter((sequence) => sequence.beat !== "phase");
      if (real.length) {
        actedThisTurn = true;
        recent = Math.max(...real.map((sequence) => sequence.drama));
        return real;
      }
      recent *= DRAMA_DECAY;
      // One breather per turn at most, and never on a turn that did something.
      if (actedThisTurn || breatherTurn === turn) return [];
      breatherTurn = turn;
      return sequences;
    },
    reset() { turn = 0; actedThisTurn = false; breatherTurn = -1; recent = 0; },
  };
}
