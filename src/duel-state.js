// Duel state construction, card instances, and derived stats.
// Pure data + pure readers -- no mutation of caller-owned state lives here.

import { getCard } from "./cards/index.js";
import { getDuelist, getMatchup } from "./duelists.js";

export const SIDES = ["player", "opponent"];
export const other = (side) => (side === "player" ? "opponent" : "player");

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

let uidCounter = 0;
export function makeInstance(cardId, owner) {
  uidCounter += 1;
  return {
    uid: `${cardId}#${uidCounter}`,
    cardId,
    owner,
    faceDown: false,
    position: "attack",
    hasAttacked: false,
    summonedThisTurn: false,
    bound: false,
    atkMod: 0,
    defMod: 0,
    equips: [],
  };
}

export function resetUidCounter(value = 0) {
  uidCounter = value;
}

/** Read the counter, so a speculative branch can put it back where it found it. */
export const uidCounterValue = () => uidCounter;

function createSide(duelistId, lifePoints, rng) {
  const duelist = getDuelist(duelistId);
  const deck = shuffle(duelist.deck, rng).map((id) => makeInstance(id, duelistId));
  return {
    duelistId,
    lp: lifePoints,
    deck,
    hand: [],
    extra: duelist.extra.map((id) => makeInstance(id, duelistId)),
    monsters: Array(5).fill(null),
    backrow: Array(5).fill(null),
    graveyard: [],
    // Banished cards and the Field Spell zone start empty and are shown only
    // once something reaches them.
    banished: [],
    field: null,
    normalSummonUsed: false,
    lockAttacksTurns: 0,
    gravityBind: 0,
    virusTurns: 0,
    virusThreshold: 0,
    hats: null,
  };
}

export function createDuel(matchupId, { seed = Date.now() } = {}) {
  const matchup = getMatchup(matchupId);
  if (!matchup) throw new Error(`Unknown matchup: ${matchupId}`);
  // Card ids must be reproducible, or a replay from the same seed refers to
  // cards that do not exist. Every instance in a duel is created in the same
  // order, so resetting the counter here is enough.
  resetUidCounter(0);
  const rng = mulberry32(seed);
  const state = {
    matchupId,
    seed,
    turn: 1,
    phase: "main1",
    activeSide: "player",
    winner: null,
    winReason: null,
    pending: null,
    rngCalls: 0,
    sides: {
      player: createSide(matchup.player, matchup.lifePoints, rng),
      opponent: createSide(matchup.opponent, matchup.lifePoints, rng),
    },
  };
  for (const side of SIDES) {
    for (let i = 0; i < 5; i += 1) drawInto(state.sides[side]);
  }
  return state;
}

export function drawInto(sideState) {
  const card = sideState.deck.shift();
  if (!card) return null;
  sideState.hand.push(card);
  return card;
}

export const cardOf = (inst) => getCard(inst.cardId);

function equipBonus(sideState, inst, key) {
  return inst.equips.reduce((sum, uid) => {
    const eq = sideState.backrow.find((s) => s && s.uid === uid);
    return sum + (eq ? (getCard(eq.cardId).effect?.[key] ?? 0) : 0);
  }, 0);
}

function conditionalAtk(state, side, inst) {
  const card = cardOf(inst);
  const mine = state.sides[side];
  const foe = state.sides[other(side)];
  let bonus = 0;
  if (card.atkPerFoeType) {
    const hits = foe.monsters.filter((s) => s && getCard(s.cardId).type === card.atkPerFoeType.type);
    bonus += hits.length * card.atkPerFoeType.atk;
  }
  if (card.atkPerAlly) {
    const hits = mine.monsters.filter((s) => s && s.uid !== inst.uid && matchesName(s, card.atkPerAlly.name));
    bonus += hits.length * card.atkPerAlly.atk;
  }
  if (card.onSummonBuff) {
    const hits = [...mine.graveyard, ...foe.graveyard]
      .filter((g) => card.onSummonBuff.perGraveyard.includes(g.cardId));
    bonus += hits.length * card.onSummonBuff.atk;
  }
  return bonus;
}

export function matchesName(inst, name) {
  const card = getCard(inst.cardId);
  return card.name === name || card.treatedAs === name;
}

export function effectiveStats(state, side, inst) {
  const card = cardOf(inst);
  const mine = state.sides[side];
  const atk = Math.max(0, Math.round(
    card.atk + inst.atkMod + equipBonus(mine, inst, "atk") + conditionalAtk(state, side, inst),
  ));
  const def = Math.max(0, Math.round(card.def + inst.defMod + equipBonus(mine, inst, "def")));
  return { atk, def };
}

export const monstersOn = (state, side) => state.sides[side].monsters.filter(Boolean);
export const emptyMonsterZone = (state, side) => state.sides[side].monsters.indexOf(null);
export const emptyBackrowZone = (state, side) => state.sides[side].backrow.indexOf(null);
