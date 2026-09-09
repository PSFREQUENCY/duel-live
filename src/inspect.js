// Card inspection: the hover panel over the board, and the graveyard view.
// Both read through describeCard, so a card never reads two ways in one duel.

import { getCard } from "./cards/index.js";
import { describeCard, rebornTarget } from "./card-detail.js";
import { DUELISTS } from "./duelists.js";

const el = (id) => document.getElementById(id);
const KIND_ACCENT = { spell: "#6ee7a8", trap: "#ff9ec4" };

function accentFor(cardId) {
  const card = getCard(cardId);
  return KIND_ACCENT[card.kind] ?? "#4fc9f0";
}

// ------------------------------------------------------------ hover panel ---

export function createHoverPanel() {
  const panel = el("hover-card");
  let showing = null;
  let pinned = false;

  function hide() {
    panel.hidden = true;
    showing = null;
    pinned = false;
  }

  function show(detail, cardId, anchor, whyNot) {
    panel.hidden = false;
    panel.style.setProperty("--hover-accent", accentFor(cardId));
    panel.innerHTML = "";

    const title = document.createElement("h3");
    title.textContent = detail.name;
    const meta = document.createElement("p");
    meta.className = "hover-meta";
    meta.textContent = detail.meta.join(" · ");
    panel.append(title, meta);

    if (detail.stats) {
      const stats = document.createElement("p");
      stats.className = "hover-stats";
      for (const [key, value] of [["ATK", detail.stats.atk], ["DEF", detail.stats.def]]) {
        const span = document.createElement("span");
        span.textContent = `${key} ${value}`;
        if (detail.stats.modified) span.className = "is-modified";
        stats.append(span);
      }
      panel.append(stats);
    }
    if (detail.text) {
      const text = document.createElement("p");
      text.className = "hover-text";
      text.textContent = detail.text;
      panel.append(text);
    }
    if (detail.note) {
      const note = document.createElement("p");
      note.className = "hover-note";
      note.textContent = detail.note;
      panel.append(note);
    }
    // The single most useful line on the panel: why a click will do nothing.
    if (whyNot) {
      const blocked = document.createElement("p");
      blocked.className = "hover-blocked";
      blocked.textContent = `Can't play — ${whyNot}.`;
      panel.append(blocked);
    }
    position(anchor);
    showing = cardId;
  }

  // Flips to whichever side of the card has room, so the panel never runs off
  // the edge of a small window.
  function position(anchor) {
    const box = anchor.getBoundingClientRect();
    const size = panel.getBoundingClientRect();
    const margin = 12;
    let x = box.right + margin;
    if (x + size.width > window.innerWidth - margin) x = box.left - size.width - margin;
    if (x < margin) x = margin;
    let y = box.top + box.height / 2 - size.height / 2;
    y = Math.max(margin, Math.min(y, window.innerHeight - size.height - margin));
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
  }

  return {
    hide,
    /** Show the panel for a card instance, unless it is a face-down enemy card. */
    inspect(inst, side, anchor, state, { whyNot = null, sticky = false } = {}) {
      if (!inst) return hide();
      // A face-down card you do not own stays a mystery.
      if (inst.faceDown && side !== "player") return hide();
      if (showing === inst.uid && !sticky) return;
      show(describeCard(inst.cardId, { state, side, inst }), inst.cardId, anchor, whyNot);
      showing = inst.uid;
      pinned = sticky;
    },
    /** Pinned by a tap; a hover must not steal it away. */
    get isPinned() { return pinned; },
    unpin() { pinned = false; },
  };
}

// -------------------------------------------------------------- graveyard ---

function graveyardList(entries, rebornUid) {
  const list = document.createElement("ul");
  list.className = "gy-list";
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "gy-empty";
    empty.textContent = "Empty.";
    return empty;
  }
  for (const inst of entries) {
    const card = getCard(inst.cardId);
    const row = document.createElement("li");
    row.style.setProperty("--gy-accent", accentFor(inst.cardId));
    if (inst.uid === rebornUid) row.classList.add("is-reborn");

    const name = document.createElement("span");
    name.textContent = card.name;
    const stat = document.createElement("span");
    stat.className = "gy-stat";
    stat.textContent = card.kind === "monster"
      ? `${card.atk}/${card.def}`
      : (card.kind === "spell" ? "Spell" : "Trap");
    row.append(name, stat);
    list.append(row);
  }
  return list;
}

export function showGraveyard(state) {
  const columns = el("graveyard-columns");
  columns.innerHTML = "";
  const target = rebornTarget(state);

  for (const side of ["player", "opponent"]) {
    const column = document.createElement("div");
    column.className = "gy-column";
    const heading = document.createElement("h3");
    const duelist = DUELISTS[state.sides[side].duelistId];
    heading.textContent = `${duelist.name} — ${state.sides[side].graveyard.length}`;
    column.append(heading, graveyardList(state.sides[side].graveyard, target?.uid));
    columns.append(column);
  }

  el("graveyard-note").textContent = target
    ? `Monster Reborn can revive any monster here — either Graveyard. The strongest, ${getCard(target.cardId).name}, is highlighted.`
    : "No monster in either Graveyard yet, so Monster Reborn has nothing to revive.";
  el("graveyard-modal").hidden = false;
}
