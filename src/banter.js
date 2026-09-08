// Banter director. Reads what the engine actually did and picks a line for it,
// plus — sometimes — a retort from the other duelist, so exchanges read like a
// conversation rather than two people narrating in parallel.

import { BANTER, REPLY_FOR } from "./banter-lines.js";
import { CARDS } from "./cards/index.js";
import { DUELISTS } from "./duelists.js";
import { other } from "./duel-state.js";

const BIG_ATK = 2400;
const BIG_HIT = 1500;
const LOW_LIFE = 2000;
const LEAD = 3000;

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

// The moment a single event represents, if any. Returns null for the ordinary
// beats that would make the duelists chatter over nothing.
export function situationFor(event, state) {
  const side = event.side;
  if (!side || !state.sides[side]) return null;
  const ace = DUELISTS[state.sides[side].duelistId].ace;

  if (event.type === "summon") {
    if (event.how === "token" || event.how === "set" || event.faceDown) return null;
    if (event.how === "fusion") return "fusion";
    const cardId = idFor(event.card);
    if (cardId === ace) return "ace";
    if ((event.atk ?? 0) >= BIG_ATK) return "bigSummon";
    return null;
  }
  if (event.type === "activate" && event.reveal) return "trap";
  if (event.type === "directAttack") return "direct";
  if (event.type === "damage" && event.amount >= BIG_HIT) return "hurt";
  if (event.type === "draw" && idFor(event.card) === ace) return "topdeck";
  return null;
}

let nameToId = null;
function idFor(name) {
  nameToId ??= Object.fromEntries(Object.entries(CARDS).map(([id, card]) => [card.name, id]));
  return nameToId[name] ?? null;
}

function moodLine(state, side, rng) {
  const mine = state.sides[side].lp;
  const theirs = state.sides[other(side)].lp;
  if (mine <= LOW_LIFE) return "low";
  if (mine - theirs >= LEAD) return "winning";
  if (theirs - mine >= LEAD) return "losing";
  return null;
}

const linesFor = (duelistId, bucket, situation) => BANTER[duelistId]?.[bucket]?.[situation] ?? null;

/**
 * Turn one turn's events into a short exchange. At most two lines per call, so
 * the duelists punctuate the action instead of talking over it.
 */
export function directBanter(events, state, rng = Math.random, { moodChance = 0.22 } = {}) {
  for (const event of events) {
    const situation = situationFor(event, state);
    if (!situation) continue;
    const side = event.side;
    const duelistId = state.sides[side].duelistId;
    const found = linesFor(duelistId, "say", situation);
    if (!found) continue;

    const out = [{
      side,
      duelistId,
      situation,
      text: pick(found, rng).replace("{card}", event.card ?? ""),
    }];

    const replyKey = REPLY_FOR[situation];
    const foeSide = other(side);
    const foeId = state.sides[foeSide].duelistId;
    const reply = replyKey ? linesFor(foeId, "reply", replyKey) : null;
    if (reply && rng() < 0.55) {
      out.push({ side: foeSide, duelistId: foeId, situation: replyKey, text: pick(reply, rng) });
    }
    return out;
  }

  // Nothing dramatic happened. Occasionally let whoever is ahead or behind speak.
  if (rng() > moodChance) return [];
  const side = state.activeSide;
  const mood = moodLine(state, side, rng);
  if (!mood) return [];
  const duelistId = state.sides[side].duelistId;
  const found = linesFor(duelistId, "say", mood);
  return found ? [{ side, duelistId, situation: mood, text: pick(found, rng) }] : [];
}

export function openingExchange(state, rng = Math.random) {
  return ["player", "opponent"].map((side) => {
    const duelist = DUELISTS[state.sides[side].duelistId];
    return { side, duelistId: duelist.id, situation: "open", text: duelist.lines.open };
  });
}

export function closingExchange(state) {
  if (!state.winner) return [];
  const loser = other(state.winner);
  return [
    { side: state.winner, duelistId: state.sides[state.winner].duelistId, situation: "win", text: DUELISTS[state.sides[state.winner].duelistId].lines.win },
    { side: loser, duelistId: state.sides[loser].duelistId, situation: "lose", text: DUELISTS[state.sides[loser].duelistId].lines.lose },
  ];
}
