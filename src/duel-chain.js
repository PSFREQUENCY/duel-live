// The chain.
//
// Cards do not resolve when they are activated. They stack, the other player
// gets to answer, and the stack resolves backwards. That ordering is the most
// confusing thing about the real card game and the thing that makes a trap feel
// like a trap, so it is modelled properly rather than as one response window.

import { getCard } from "./cards/index.js";
import { other } from "./duel-state.js";

export const PASS = Symbol("pass");

/**
 * Spell Speed.
 *
 * 1 — Normal, Continuous, Equip and Field Spells. Only from your own Main
 *     Phase, only onto an empty chain, so a Speed 1 card is always Chain Link 1.
 * 2 — Traps and Quick-Play Spells.
 * 3 — Counter Traps, which may answer anything including each other.
 */
export function spellSpeed(card) {
  if (!card) return 1;
  if (card.kind === "trap") return card.sub === "counter" ? 3 : 2;
  if (card.kind === "spell") return card.sub === "quick" ? 2 : 1;
  return 1;
}

/** A card may only be chained to one of equal or lower Spell Speed. */
export function canChainTo(card, chain) {
  const speed = spellSpeed(card);
  if (!chain?.links.length) return true;
  if (speed < 2) return false;
  const topSpeed = chain.links[chain.links.length - 1].spellSpeed;
  return speed >= topSpeed;
}

function linkFor(state, side, inst) {
  const card = getCard(inst.cardId);
  return {
    uid: inst.uid,
    cardId: inst.cardId,
    name: card.name,
    controller: side,
    spellSpeed: spellSpeed(card),
    from: state.sides[side].hand.some((c) => c.uid === inst.uid) ? "hand" : "field",
  };
}

/**
 * Start a chain with its first link. `trigger` records what opened the window
 * so the engine can resume it once the chain has resolved.
 */
export function openChain(state, side, inst, trigger = null) {
  state.chain = {
    links: [linkFor(state, side, inst)],
    respondingSide: other(side),
    passCount: 0,
    trigger,
  };
  return state.chain;
}

/** Open an empty chain, used when a trigger offers a window before any card. */
export function openWindow(state, respondingSide, trigger = null) {
  state.chain = { links: [], respondingSide, passCount: 0, trigger };
  return state.chain;
}

/** Add a link, or pass. Two consecutive passes close the chain. */
export function respond(state, side, inst) {
  const chain = state.chain;
  if (!chain || chain.respondingSide !== side) return chain;
  if (inst === PASS || !inst) {
    chain.passCount += 1;
  } else {
    chain.links.push(linkFor(state, side, inst));
    chain.passCount = 0;
  }
  chain.respondingSide = other(side);
  return chain;
}

/** A chain closes once both players have passed in a row. */
export const chainClosed = (chain) => Boolean(chain) && chain.passCount >= 2;

/**
 * The cards a player may add right now.
 *
 * One source of legality for both the interface and the opponent, so the two
 * cannot disagree about what is playable.
 */
export function legalResponses(state, side) {
  const chain = state.chain;
  if (!chain || chain.respondingSide !== side) return [];
  const s = state.sides[side];
  const out = [];
  // A card already on the chain is waiting to resolve; it cannot be added twice.
  const onChain = new Set(chain.links.map((link) => link.uid));

  for (const inst of s.backrow) {
    if (!inst || !inst.faceDown || onChain.has(inst.uid)) continue;
    const card = getCard(inst.cardId);
    if (card.kind !== "trap" && card.sub !== "quick") continue;
    // Nothing set this turn is live yet.
    if (inst.setOnTurn !== undefined && inst.setOnTurn >= state.turn) continue;
    if (!canChainTo(card, chain)) continue;
    out.push({ uid: inst.uid, name: card.name, spellSpeed: spellSpeed(card), from: "field" });
  }

  // A Quick-Play Spell may be played from the hand, but only on your own turn.
  if (state.activeSide === side) {
    for (const inst of s.hand) {
      if (onChain.has(inst.uid)) continue;
      const card = getCard(inst.cardId);
      if (card.kind !== "spell" || card.sub !== "quick") continue;
      if (!canChainTo(card, chain)) continue;
      out.push({ uid: inst.uid, name: card.name, spellSpeed: spellSpeed(card), from: "hand" });
    }
  }
  return out;
}

/**
 * Simultaneous triggers go on the chain turn-player-first (SEGOC), each group
 * in the order its controller chooses.
 */
export function buildSimultaneousChain(triggers, turnPlayerSide) {
  const mine = triggers.filter((t) => t.controller === turnPlayerSide);
  const theirs = triggers.filter((t) => t.controller !== turnPlayerSide);
  return [...mine, ...theirs];
}

/** The links in the order they will resolve: last on, first off. */
export const resolutionOrder = (chain) => [...(chain?.links ?? [])].reverse();
