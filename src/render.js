// DOM rendering of everything outside the canvas: zones, hand, life points, log.
// Reads duel state; never writes to it.

import { CARDS, getCard } from "./cards/index.js";
import { effectiveStats } from "./duel-engine.js";
import { ATTRIBUTE_PALETTE } from "./cinema/procedural-stage.js";
import { DUELISTS, getMatchup } from "./duelists.js";

const el = (id) => document.getElementById(id);
const KIND_LABEL = { monster: "MON", spell: "SPELL", trap: "TRAP" };

function accentFor(card) {
  if (card.kind === "spell") return "#6ee7a8";
  if (card.kind === "trap") return "#ff9ec4";
  return (ATTRIBUTE_PALETTE[card.attribute] ?? ATTRIBUTE_PALETTE.DARK).core;
}

export function renderZones(state, side, container, {
  onZoneClick, onZoneHover, targets = new Set(), ready = new Set(), row = "monsters",
}) {
  container.innerHTML = "";
  state.sides[side][row].forEach((inst, index) => {
    const zone = document.createElement("div");
    zone.className = "zone";
    zone.dataset.index = String(index);
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
      const canAct = ready.has(inst.uid);
      zone.title = inst.faceDown
        ? (canAct ? "Face-down — click to flip into Attack Position" : "Face-down card")
        : `${card.name}${card.kind === "monster" ? ` — ${card.atk}/${card.def}` : ""}`
          + (canAct && row === "monsters" ? " — click to change position" : "");
      if (onZoneClick) zone.addEventListener("click", () => onZoneClick(inst, side, row));
      if (onZoneHover) {
        zone.addEventListener("pointerenter", () => onZoneHover(inst, side, zone));
        zone.addEventListener("pointerleave", () => onZoneHover(null, side, zone));
      }
    }
    container.append(zone);
  });
}

export function renderHand(state, container, { onPlay, actions }) {
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
    button.disabled = options.length === 0;
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
    if (options.length) button.addEventListener("click", () => onPlay(inst, options));
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
    el(`${prefix}-deck`).textContent = `D ${s.deck.length}`;
    el(`${prefix}-gy`).textContent = `GY ${s.graveyard.length}`;
    if (prefix === "foe") el("foe-hand").textContent = `H ${s.hand.length}`;
  }
  el("me-turn").textContent = `T${state.turn}`;
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

const BIG = new Set(["win", "fusion", "directAttack"]);

export function logEvent(list, event, state) {
  const text = describe(event, state);
  if (!text) return;
  const li = document.createElement("li");
  li.textContent = text;
  li.classList.add(event.side === "player" ? "is-me" : "is-foe");
  if (BIG.has(event.type)) li.classList.add("is-big");
  list.prepend(li);
  while (list.children.length > 60) list.lastChild.remove();
}

function who(state, side) {
  return DUELISTS[state.sides[side]?.duelistId]?.name ?? side;
}

export function describe(event, state) {
  const name = who(state, event.side);
  switch (event.type) {
    case "phase": return event.phase === "draw" ? `— Turn ${event.turn}: ${name} —` : null;
    case "draw": return event.side === "player" ? `${name} draws ${event.card}.` : `${name} draws.`;
    case "summon": return `${name} ${event.how === "fusion" ? "Fusion Summons" : event.how === "set" ? "sets a monster" : "summons"}${event.how === "set" ? "" : ` ${event.card}`}.`;
    case "set": return `${name} sets a ${event.kind}.`;
    case "activate": return `${name} activates ${event.card}.`;
    case "declare": return `${event.card} attacks ${event.target === "direct" ? "directly" : event.target}.`;
    case "clash": return `${event.attacker} (${event.attackerAtk}) meets ${event.defender} (${event.defenderValue}).`;
    case "destroy": return `${event.card} is destroyed.`;
    case "damage": return `${who(state, event.side)} takes ${event.amount} damage → ${event.lp} LP.`;
    case "directAttack": return `Direct attack! ${event.damage} damage.`;
    case "fusion": return `Fusion Summon: ${event.card}!`;
    case "dice": return `Dice roll: ${event.roll}.`;
    case "hats": return event.hit ? "The attack finds the real monster." : "The attack hits an empty hat.";
    case "flip": return `${event.card} is flipped face-up.`;
    case "position": return `${event.card} switches to ${event.position}.`;
    case "fieldShift": return `${event.label} takes hold.`;
    case "bounce": return `${event.card} returns to the hand.`;
    case "win": return `${who(state, event.side)} wins — ${event.reason === "deckout" ? "deck out" : "life points depleted"}.`;
    default: return null;
  }
}

export { el, CARDS };
