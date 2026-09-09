// The duel log.
//
// A flat list of sentences is hard to read back: it does not say which turn you
// are looking at, it hides the arithmetic behind a summary, and it gives a line
// of dialogue the same weight as a life point swing. This groups by turn and
// tells the three apart.

import { getCard } from "./cards/index.js";
import { DUELISTS } from "./duelists.js";
import { other } from "./duel-state.js";
import { SUB_STEP_LABELS } from "./duel-damage-step.js";

/** Structural beats frame the turn; mechanical ones change it; dialogue colours it. */
export const WEIGHTS = { structural: "structural", mechanical: "mechanical", dialogue: "dialogue" };

const STRUCTURAL = new Set(["phase", "chainStart", "damageStep"]);
const QUIET = new Set(["damageStep"]);

const who = (state, side) => DUELISTS[state.sides[side]?.duelistId]?.name ?? side;

/**
 * One log line, or null for events not worth a line.
 *
 * `zones` names the board zones the line refers to, so hovering it can light
 * them up.
 */
export function lineFor(event, state) {
  if (QUIET.has(event.type)) return null;
  const weight = STRUCTURAL.has(event.type) ? "structural" : "mechanical";
  const base = { weight, turn: state.turn, side: event.side, zones: [], chainLink: event.chainLink };

  switch (event.type) {
    case "phase":
      return event.phase === "draw"
        ? { ...base, text: `Turn ${event.turn} — ${who(state, event.side)}`, isTurnStart: true, turn: event.turn }
        : { ...base, text: phaseName(event.phase), muted: true };

    case "draw":
      return { ...base, text: event.side === "player"
        ? `draws ${event.card}` : `${who(state, event.side)} draws` };

    case "summon": {
      const how = event.how === "fusion" ? "Fusion Summons"
        : event.how === "set" ? "sets a monster"
          : event.how === "reborn" ? "revives" : "summons";
      const name = event.how === "set" ? "" : ` ${event.card}`;
      return { ...base, text: `${who(state, event.side)} ${how}${name}`,
        detail: event.atk ? `${event.atk} ATK` : null };
    }

    case "set": return { ...base, text: `${who(state, event.side)} sets a ${event.kind}` };
    case "activate":
      return { ...base, text: `${who(state, event.side)} activates ${event.card}`,
        detail: event.chainLink ? `Chain Link ${event.chainLink}` : null };

    case "chainStart":
      return { ...base, text: event.links > 1
        ? `Chain of ${event.links} — resolving last to first` : "Chain" };

    case "declare":
      return { ...base, text: `${event.card} attacks ${event.target === "direct" ? "directly" : event.target}` };

    // The arithmetic is the interesting part, so show it rather than a summary.
    case "clash":
      return { ...base,
        text: `${event.attacker} ${event.attackerAtk} vs ${event.defender} ${event.defenderValue}`,
        detail: outcome(event) };

    case "damage":
      return { ...base, text: `${who(state, event.side)} takes ${event.amount}`,
        detail: `${event.lp} LP left` };

    case "directAttack":
      return { ...base, text: `Direct attack — ${event.damage}` };

    case "destroy": return { ...base, text: `${event.card} is destroyed`, muted: true };
    case "flip": return { ...base, text: `${event.card} is flipped face-up` };
    case "position": return { ...base, text: `${event.card} switches to ${event.position}` };
    case "fusion": return { ...base, text: `Fusion Summon: ${event.card}` };
    case "dice": return { ...base, text: `Dice roll: ${event.roll}` };
    case "hats": return { ...base, text: event.hit ? "The attack finds the real monster" : "The attack hits an empty hat" };
    case "fieldShift": return { ...base, text: `${event.label} takes hold` };
    case "bounce": return { ...base, text: `${event.card} returns to the hand`, muted: true };
    case "win":
      return { ...base, weight: "structural", text: event.reason === "doubleKnockout"
        ? "Both duelists hit zero — a draw"
        : `${who(state, event.side)} wins — ${event.reason === "deckout" ? "deck out" : "life points depleted"}` };
    default: return null;
  }
}

function outcome(event) {
  const { attackerAtk: a, defenderValue: d, defenderPosition } = event;
  if (a > d) {
    return defenderPosition === "attack" ? `→ ${a - d} damage` : "→ destroyed, no damage";
  }
  if (a < d) return `→ ${d - a} back at the attacker`;
  return "→ both destroyed";
}

const phaseName = (phase) => ({
  standby: "Standby Phase", main1: "Main Phase 1", battle: "Battle Phase",
  main2: "Main Phase 2", end: "End Phase",
}[phase] ?? phase);

/** Group lines into turns, newest turn first, so the log reads back sensibly. */
export function groupByTurn(lines) {
  const turns = [];
  for (const line of lines) {
    if (line.isTurnStart || !turns.length) {
      turns.push({ turn: line.turn, side: line.side, heading: line.isTurnStart ? line.text : `Turn ${line.turn}`, lines: [] });
      if (line.isTurnStart) continue;
    }
    turns[turns.length - 1].lines.push(line);
  }
  return turns;
}

export const dialogueLine = (name, text, turn) =>
  ({ weight: "dialogue", text: `${name}: “${text}”`, turn, zones: [] });

export { SUB_STEP_LABELS };
