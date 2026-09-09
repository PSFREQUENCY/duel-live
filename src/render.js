// DOM rendering of everything outside the canvas: zones, hand, life points, log.
// Reads duel state; never writes to it.

import { CARDS, getCard } from "./cards/index.js";
import { effectiveStats } from "./duel-engine.js";
import { ATTRIBUTE_PALETTE } from "./cinema/procedural-stage.js";
import { zoneId } from "./duel-board.js";
import { DUELISTS, getMatchup } from "./duelists.js";
import { groupByTurn } from "./duel-log.js";

const el = (id) => document.getElementById(id);
const KIND_LABEL = { monster: "MON", spell: "SPELL", trap: "TRAP" };

function accentFor(card) {
  if (card.kind === "spell") return "#6ee7a8";
  if (card.kind === "trap") return "#ff9ec4";
  return (ATTRIBUTE_PALETTE[card.attribute] ?? ATTRIBUTE_PALETTE.DARK).core;
}

export function renderZones(state, side, container, {
  onZoneClick, onZoneHover, onZoneInspect,
  targets = new Set(), ready = new Set(), row = "monsters",
}) {
  container.classList.toggle("is-choosing", targets.size > 0);
  container.innerHTML = "";
  state.sides[side][row].forEach((inst, index) => {
    // A real button: focusable, activatable by keyboard, and announced.
    const zone = document.createElement("button");
    zone.type = "button";
    zone.className = `zone zone--${row}`;
    zone.dataset.index = String(index);
    zone.dataset.zone = zoneId(side, row === "monsters" ? "mon" : "st", index);
    zone.dataset.side = side;
    if (inst) zone.dataset.uid = inst.uid;
    if (inst) {
      const card = getCard(inst.cardId);
      zone.classList.add("is-filled");
      zone.style.setProperty("--slot-accent", accentFor(card));
      if (inst.faceDown) zone.classList.add("is-facedown");
      if (row === "monsters" && inst.position === "defense") zone.classList.add("is-defense");
      if (targets.has(inst.uid)) zone.classList.add("is-target");
      if (ready.has(inst.uid)) zone.classList.add("is-ready");
      if (!inst.faceDown) {
        const name = document.createElement("span");
        name.className = "zone-name";
        name.textContent = card.name;
        zone.append(name);
        if (row === "monsters") {
          const stat = document.createElement("span");
          stat.className = "zone-stat";
          const s = effectiveStats(state, side, inst);
          stat.textContent = inst.position === "attack" ? `${s.atk}` : `${s.def}D`;
          zone.append(stat);
        }
      }
      const canAct = ready.has(inst.uid) || targets.has(inst.uid);
      zone.setAttribute("aria-label", ariaFor(state, side, inst, row, index, canAct));
      zone.title = inst.faceDown
        ? (canAct ? "Face-down — click to flip into Attack Position" : "Face-down card")
        : `${card.name}${card.kind === "monster" ? ` — ${card.atk}/${card.def}` : ""}`
          + (canAct && row === "monsters" ? " — click to change position" : "");
      if (onZoneClick) zone.addEventListener("click", () => onZoneClick(inst, side, row));
      if (onZoneHover) {
        zone.addEventListener("pointerenter", () => onZoneHover(inst, side, zone));
        zone.addEventListener("pointerleave", () => onZoneHover(null, side, zone));
        zone.addEventListener("focus", () => onZoneHover(inst, side, zone));
      }
      // A touch screen has no hover, so a long press pins the panel instead.
      if (onZoneInspect) {
        zone.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          onZoneInspect(inst, side, zone);
        });
      }
    }
    if (!inst) {
      zone.disabled = true;
      zone.setAttribute("aria-label",
        `Empty ${row === "monsters" ? "monster" : "spell and trap"} zone ${index + 1}`);
    }
    container.append(zone);
  });
}

// What a screen reader says about a zone: whose it is, what is in it, and
// whether it can be acted on right now.
function ariaFor(state, side, inst, row, index, canAct) {
  const owner = DUELISTS[state.sides[side].duelistId]?.name ?? side;
  const place = `${row === "monsters" ? "monster" : "spell and trap"} zone ${index + 1}`;
  if (inst.faceDown) {
    return `${owner}, ${place}: face-down card${canAct ? ", activatable" : ""}`;
  }
  const card = getCard(inst.cardId);
  const stats = card.kind === "monster"
    ? `, ${effectiveStats(state, side, inst).atk} attack, ${inst.position === "attack" ? "attack" : "defence"} position`
    : "";
  return `${owner}, ${place}: ${card.name}${stats}${canAct ? ", selectable" : ""}`;
}

export function renderHand(state, container, { onPlay, onInspect, actions, whyNot }) {
  container.innerHTML = "";
  const byUid = new Map();
  for (const action of actions) {
    if (!byUid.has(action.uid)) byUid.set(action.uid, []);
    byUid.get(action.uid).push(action);
  }
  for (const inst of state.sides.player.hand) {
    const card = getCard(inst.cardId);
    const options = byUid.get(inst.uid) ?? [];
    const button = document.createElement("button");
    button.className = "card";
    button.type = "button";
    button.style.setProperty("--card-accent", accentFor(card));
    button.innerHTML = `
      <div class="card-top">
        <span class="card-kind">${KIND_LABEL[card.kind]}</span>
        ${card.kind === "monster" ? `<span class="card-level">L${card.level}</span>` : ""}
      </div>
      <div class="card-name"></div>
      <div class="card-stats"></div>
      <div class="card-text"></div>`;
    button.querySelector(".card-name").textContent = card.name;
    button.querySelector(".card-stats").textContent = card.kind === "monster"
      ? `${card.atk} ATK / ${card.def} DEF` : `${card.sub ?? ""}`.toUpperCase();
    button.querySelector(".card-text").textContent = card.text ?? card.art ?? "";
    // Why a card will not respond is the most useful thing the panel can say.
    const blocked = options.length ? null : whyNot?.(inst);
    button.disabled = false;              // a click must still explain itself
    button.classList.toggle("is-blocked", Boolean(blocked));
    button.setAttribute("aria-label",
      `${card.name}${blocked ? `, unplayable: ${blocked}` : ", playable"}`);
    button.addEventListener("click", () => onPlay(inst, options, blocked));
    if (onInspect) {
      button.addEventListener("pointerenter", () => onInspect(inst, button, blocked));
      button.addEventListener("pointerleave", () => onInspect(null, button, null));
      button.addEventListener("focus", () => onInspect(inst, button, blocked));
    }
    container.append(button);
  }
}

export function renderDuelists(state) {
  const matchup = getMatchup(state.matchupId);
  el("matchup-name").textContent = matchup.name;
  for (const [side, prefix] of [["player", "me"], ["opponent", "foe"]]) {
    const s = state.sides[side];
    const duelist = DUELISTS[s.duelistId];
    el(`${prefix}-name`).textContent = duelist.name;
    el(`${prefix}-title`).textContent = duelist.title;
    el(`${prefix}-pip`).style.background = duelist.accent;
    // Both strips carry the same counters in the same order, so a glance at one
    // reads the same as a glance at the other.
    el(`${prefix}-hand`).textContent = `H ${s.hand.length}`;
    el(`${prefix}-deck`).textContent = `D ${s.deck.length}`;
    el(`${prefix}-deck`).classList.toggle("is-low", s.deck.length < 5);
    el(`${prefix}-gy`).textContent = `GY ${s.graveyard.length}`;
    el(`${prefix}-extra`).textContent = `EX ${s.extra.length}`;
    const banished = s.banished ?? [];
    const banishedNode = el(`${prefix}-banished`);
    banishedNode.hidden = banished.length === 0;
    banishedNode.textContent = `BAN ${banished.length}`;
  }

}

const lastLp = { player: null, opponent: null };
export function renderLifePoints(state, max = 8000) {
  for (const [side, prefix] of [["player", "me"], ["opponent", "foe"]]) {
    const lp = state.sides[side].lp;
    const fill = el(`${prefix}-lp-fill`);
    const num = el(`${prefix}-lp`);
    fill.style.width = `${Math.max(0, (lp / max) * 100)}%`;
    fill.classList.toggle("is-low", lp <= max * 0.25);
    num.textContent = String(lp);
    if (lastLp[side] !== null && lp < lastLp[side]) {
      num.classList.remove("is-hit");
      void num.offsetWidth;
      num.classList.add("is-hit");
    }
    lastLp[side] = lp;
  }
}

export function resetLifePointTracking() {
  lastLp.player = null;
  lastLp.opponent = null;
}

export function renderPhase(phase, { locked = [] } = {}) {
  const order = ["draw", "standby", "main1", "battle", "main2", "end"];
  const at = order.indexOf(phase);
  for (const node of document.querySelectorAll(".phase")) {
    const index = order.indexOf(node.dataset.phase);
    node.classList.toggle("is-now", node.dataset.phase === phase);
    node.classList.toggle("is-past", index >= 0 && index < at);
    node.classList.toggle("is-locked", locked.includes(node.dataset.phase));
  }
}

/**
 * Render the log as collapsible turns, newest first, with the current turn open.
 * Rebuilt wholesale each time: the list is short and correctness beats a diff.
 */
export function renderLog(container, lines, { onHighlight } = {}) {
  const turns = groupByTurn(lines);
  container.innerHTML = "";

  for (const [i, turn] of [...turns].reverse().entries()) {
    const block = document.createElement("details");
    block.className = "log-turn";
    block.open = i === 0;                    // the turn being played stays open
    block.style.setProperty("--turn-accent",
      turn.side === "player" ? "var(--accent)" : "var(--danger)");

    const heading = document.createElement("summary");
    heading.textContent = turn.heading;
    const list = document.createElement("ul");
    list.className = "log-lines";

    for (const line of turn.lines) {
      const row = document.createElement("li");
      row.className = `log-line is-${line.weight}${line.muted ? " is-muted" : ""}`;
      row.append(document.createTextNode(line.text));
      if (line.detail) {
        const detail = document.createElement("span");
        detail.className = "log-detail";
        detail.textContent = `  ${line.detail}`;
        row.append(detail);
      }
      if (line.chainLink) {
        const link = document.createElement("span");
        link.className = "log-chain";
        link.textContent = `CL${line.chainLink}`;
        row.append(link);
      }
      if (onHighlight && line.zones?.length) {
        row.classList.add("is-linked");
        row.addEventListener("pointerenter", () => onHighlight(line.zones));
        row.addEventListener("pointerleave", () => onHighlight([]));
      }
      list.append(row);
    }
    block.append(heading, list);
    container.append(block);
  }
  container.scrollTop = 0;
}

export { el, CARDS };
