// One description of a card, shared by the hover panel and the graveyard view,
// so a card never reads two different ways in the same duel.

import { getCard } from "./cards/index.js";
import { effectiveStats } from "./duel-engine.js";

const SUB_LABEL = {
  normal: "Normal", continuous: "Continuous", quick: "Quick-Play", equip: "Equip", counter: "Counter",
};

/** Everything worth showing about one card, already formatted. */
export function describeCard(cardId, { state, side, inst } = {}) {
  const card = getCard(cardId);
  const detail = {
    name: card.name,
    kind: card.kind,
    accent: card.kind === "spell" ? "#6ee7a8" : card.kind === "trap" ? "#ff9ec4" : null,
    meta: [],
    stats: null,
    text: card.text ?? "",
    note: null,
  };

  if (card.kind === "monster") {
    detail.meta = [`Level ${card.level}`, card.attribute, card.type];
    // Live numbers when the card is on the field, printed ones otherwise, so a
    // buffed monster never shows a stale value.
    const live = state && side && inst ? effectiveStats(state, side, inst) : null;
    detail.stats = live
      ? { atk: live.atk, def: live.def, modified: live.atk !== card.atk || live.def !== card.def }
      : { atk: card.atk, def: card.def, modified: false };
    detail.text = card.text ?? monsterNote(card);
  } else {
    detail.meta = [card.kind === "spell" ? "Spell" : "Trap", SUB_LABEL[card.sub] ?? card.sub]
      .filter(Boolean);
    if (card.kind === "trap") detail.note = triggerNote(card.trigger);
  }

  if (inst?.faceDown) detail.note = "Face-down";
  else if (inst?.position === "defense") detail.note = "Defence Position";
  return detail;
}

// Monsters mostly have no rules text, so say what makes this one different
// rather than leaving the panel blank.
function monsterNote(card) {
  if (card.fusion) return `Fusion Summon with ${card.fusion.length} materials.`;
  if (card.atkPerFoeType) {
    return `Gains ${card.atkPerFoeType.atk} ATK for each ${card.atkPerFoeType.type} the opponent controls.`;
  }
  if (card.atkPerAlly) {
    return `Gains ${card.atkPerAlly.atk} ATK and ${card.atkPerAlly.def} DEF for each ${card.atkPerAlly.name} you control.`;
  }
  if (card.onSummonBuff) return "Gains ATK for each copy of its partner in either Graveyard.";
  if (card.doubleTributeFor) return `Counts as two tributes for a ${card.doubleTributeFor} monster.`;
  if (card.reflectBattleDamage) return "Your opponent takes the same battle damage you do.";
  if (card.noNormalSummon) return "Cannot be Normal Summoned.";
  if (card.treatedAs) return `Treated as ${card.treatedAs}.`;
  if (card.mustAttack) return "Must attack if able.";
  if (card.token) return "A token. Cannot be revived.";
  return card.art ? `${card.art[0].toUpperCase()}${card.art.slice(1)}.` : "";
}

const triggerNote = (trigger) =>
  trigger === "onAttack" ? "Fires when you are attacked."
    : trigger === "onSummon" ? "Fires when a monster is summoned."
      : null;

/** What Monster Reborn would take right now: the strongest monster in either Graveyard. */
export function rebornTarget(state) {
  const pool = [...state.sides.player.graveyard, ...state.sides.opponent.graveyard]
    .filter((c) => getCard(c.cardId).kind === "monster" && !getCard(c.cardId).token);
  return pool.sort((a, b) => getCard(b.cardId).atk - getCard(a.cardId).atk)[0] ?? null;
}
