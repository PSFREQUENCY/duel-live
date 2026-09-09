// Why a card in your hand will not respond to a click.
//
// A card that simply does nothing when clicked teaches nothing. Saying which
// rule is in the way teaches the rules better than a tutorial would.

import { getCard } from "./cards/index.js";
import {
  canNormalSummon, isMainPhase, legalActions, requirementMet, tributesRequired,
} from "./duel-engine.js";
import { monstersOn } from "./duel-state.js";
import { needsChoice, targetOptions, targetSpecFor } from "./duel-targets.js";

/**
 * Null when the card's own action is available; otherwise the reason it is not.
 *
 * A Trap or Spell can almost always be *set*, so asking whether anything at all
 * is legal answers the wrong question. The player wants to know why they cannot
 * summon this monster or activate this spell.
 */
export function whyNotPlayable(state, side, inst) {
  if (!state || !inst) return null;
  const card = getCard(inst.cardId);
  const wanted = card.kind === "monster" ? "summon" : "activate";
  const available = legalActions(state, side)
    .some((action) => action.uid === inst.uid && action.type === wanted);
  if (available) return null;
  if (state.winner) return "the duel is over";
  if (state.activeSide !== side) return "it is not your turn";
  if (state.pending) return "there is a choice to answer first";
  if (!isMainPhase(state)) {
    return state.phase === "battle"
      ? "cards are played in a Main Phase, not the Battle Phase"
      : `cards are played in a Main Phase, not the ${state.phase} phase`;
  }

  if (card.kind === "monster") return whyNotMonster(state, side, card);
  return whyNotSpell(state, side, card);
}

function whyNotMonster(state, side, card) {
  if (card.fusion) return "Fusion Monsters are summoned with Polymerization, not from the hand";
  if (card.noNormalSummon) return `${card.name} cannot be Normal Summoned`;
  if (state.sides[side].normalSummonUsed) return "you have already Normal Summoned this turn";
  if (monstersOn(state, side).length >= 5) return "your monster zones are full";

  const need = tributesRequired(card);
  if (need > 0) {
    const have = monstersOn(state, side).length;
    return have === 0
      ? `Level ${card.level} needs ${need} tribute${need > 1 ? "s" : ""}, and you control none`
      : `Level ${card.level} needs ${need} tributes; you control ${have}`;
  }
  return "it cannot be summoned right now";
}

function whyNotSpell(state, side, card) {
  const s = state.sides[side];
  if (card.kind === "trap") {
    return s.backrow.every(Boolean)
      ? "your spell and trap zones are full"
      : "a Trap is set face-down and fires on its own trigger";
  }
  if (s.backrow.every(Boolean) && card.sub === "equip") return "your spell and trap zones are full";
  if (!requirementMet(state, side, card)) return requirementText(card);

  const spec = targetSpecFor(card);
  if (spec && !targetOptions(state, side, spec, card).length) {
    return `there is nothing for ${card.name} to target`;
  }
  if (card.effect?.op === "fusionSummon") return "you do not hold the materials for a Fusion Summon";
  if (card.effect?.op === "revive") return "there is no monster in either Graveyard to revive";
  if (card.effect?.op === "takeControl") {
    return s.lp <= (card.effect.cost ?? 0)
      ? `you cannot pay ${card.effect.cost} Life Points`
      : "your opponent controls no monster to take";
  }
  if (card.effect?.op === "tokens" || card.effect?.op === "summonFromDeck") {
    return "your monster zones are full";
  }
  return "it has no legal effect right now";
}

function requirementText(card) {
  const required = card.effect?.requires;
  const name = typeof required === "string" ? getCard(required)?.name : null;
  return name ? `you need ${name} on the field` : "its requirement is not met";
}

/** Whether a click on this card in hand will do anything at all. */
export const isPlayable = (state, side, inst) => whyNotPlayable(state, side, inst) === null;

export { needsChoice };
