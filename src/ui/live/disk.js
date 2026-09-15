// The control surface, for when the video is the screen.
//
// The player still plays. What changes is that the board stops being the
// primary display, so everything they need to act has to live in the letterbox
// bars and the card they are touching -- and the hand must never be occluded by
// anything, because it is the one thing they are always reaching for.

import { getCard } from "../../cards/index.js";
import { effectiveStats } from "../../duel-state.js";
import { whyNotPlayable } from "../../why-not.js";
import { describeCard } from "../../card-detail.js";
import { fusionList } from "../../inspect.js";

const KIND_LABEL = { monster: "MON", spell: "SPELL", trap: "TRAP" };

// The fan is a strip, not a panel: a monster's numbers fit, a spell's rules text
// does not. The full text belongs in the selection panel, where there is room
// for it to be read rather than clipped.
function statLine(state, side, inst, card) {
  if (card.kind !== "monster") return "";
  const s = effectiveStats(state, side, inst);
  return `${s.atk} / ${s.def}`;
}

/** The longer form, for the panel and for the screen reader. */
function describe(state, side, inst, card) {
  if (card.kind !== "monster") return card.text ?? "";
  const s = effectiveStats(state, side, inst);
  return `${s.atk} ATK / ${s.def} DEF`;
}

/**
 * Hover, and long-press on a touch screen.
 *
 * Live mode had no way to read a card without committing to selecting it, which
 * meant the answer to "what does this do" was "click it and find out" -- on a
 * card that might be a trap you did not mean to play.
 */
function wireInspect(node, { inst, side, whyNot, onInspect }) {
  if (!onInspect) return node;
  node.addEventListener("mouseenter", () => onInspect({ inst, side, anchor: node, whyNot }));
  node.addEventListener("mouseleave", () => onInspect({ inst: null }));
  node.addEventListener("focus", () => onInspect({ inst, side, anchor: node, whyNot }));
  node.addEventListener("blur", () => onInspect({ inst: null }));
  // A touch screen has no hover, so a long press pins the panel instead.
  node.addEventListener("contextmenu", (event) => {
    event.preventDefault?.();
    onInspect({ inst, side, anchor: node, whyNot, sticky: true });
  });
  return node;
}

function cardButton(state, inst, { blocked, onSelect, selected, onInspect }) {
  const card = getCard(inst.cardId);
  const node = document.createElement("button");
  node.type = "button";
  node.className = `fan-card fan-card--${card.kind}`;
  node.dataset.uid = inst.uid;
  if (blocked) node.classList.add("is-blocked");
  if (selected) node.classList.add("is-selected");
  node.innerHTML = `<span class="fan-kind">${KIND_LABEL[card.kind]}</span>`
    + `<span class="fan-name"></span><span class="fan-stat"></span>`;
  node.querySelector(".fan-name").textContent = card.name;
  node.querySelector(".fan-stat").textContent = statLine(state, "player", inst, card);
  node.setAttribute("aria-label",
    `${card.name}. ${describe(state, "player", inst, card)}${blocked ? `. ${blocked}` : ""}`);
  node.addEventListener("click", () => onSelect(inst, blocked));
  return wireInspect(node, { inst, side: "player", whyNot: blocked, onInspect });
}

/** The fanned hand along the bottom bar. Never scrolled, never covered. */
export function renderFan(container, state, { actions, onSelect, selectedUid, onInspect }) {
  container.innerHTML = "";
  const hand = state?.sides?.player?.hand ?? [];
  hand.forEach((inst, i) => {
    const mine = actions.filter((action) => action.uid === inst.uid);
    const blocked = mine.length ? null : whyNotPlayable(state, "player", inst);
    const node = cardButton(state, inst, {
      blocked, onSelect, onInspect, selected: inst.uid === selectedUid,
    });
    // A fan, not a row: the lean is what makes it read as cards in a hand.
    const centre = (hand.length - 1) / 2;
    const offset = i - centre;
    node.style.setProperty("--lean", `${offset * 2.6}deg`);
    node.style.setProperty("--lift", `${Math.abs(offset) * 5}px`);
    container.append(node);
  });
  container.dataset.count = String(hand.length);
}

/** The zoomed card and its legal actions — or why there are none. */
export function renderSelection(panel, state, inst, { actions, onAction, onClose }) {
  panel.innerHTML = "";
  if (!inst) { panel.hidden = true; return; }
  const card = getCard(inst.cardId);
  panel.hidden = false;

  const head = document.createElement("div");
  head.className = "sel-head";
  head.innerHTML = `<h3></h3><p class="sel-stat"></p><p class="sel-text"></p>`;
  head.querySelector("h3").textContent = card.name;
  head.querySelector(".sel-stat").textContent = describe(state, "player", inst, card);
  head.querySelector(".sel-text").textContent = card.text ?? "";
  panel.append(head);

  // The recipe list, wherever the card is looked at.
  const detail = describeCard(inst.cardId, { state, side: "player", inst });
  if (detail.fusions?.length) panel.append(fusionList(detail.fusions));

  const mine = actions.filter((action) => action.uid === inst.uid);
  if (mine.length) {
    const list = document.createElement("div");
    list.className = "sel-actions";
    for (const action of mine) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-accent sel-action";
      btn.textContent = action.label ?? action.type;
      btn.addEventListener("click", () => onAction(action));
      list.append(btn);
    }
    panel.append(list);
  } else {
    // The player must never have to guess why a card will not respond.
    const why = document.createElement("p");
    why.className = "sel-blocked";
    why.textContent = whyNotPlayable(state, "player", inst) ?? "Nothing to do with this card yet.";
    panel.append(why);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.className = "sel-close";
  close.setAttribute("aria-label", "Close card");
  close.textContent = "×";
  close.addEventListener("click", onClose);
  panel.append(close);
}

// Life points count rather than snap: the number moving is what sells the hit,
// and it is the only place in the HUD where the animation carries information.
export function createCounter(node, { duration = 700 } = {}) {
  let shown = null;
  let raf = 0;
  return function set(value) {
    if (shown === null || !node) { shown = value; if (node) node.textContent = String(value); return; }
    if (value === shown) return;
    const from = shown;
    const started = performance.now();
    shown = value;
    cancelAnimationFrame(raf);
    const step = (now) => {
      const p = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - p) ** 3;
      node.textContent = String(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
}

/**
 * The response ribbon. A chain window is itself a dramatic beat, so this is the
 * one place where play is allowed to hold up the cinema rather than the other
 * way round.
 */
export function renderRibbon(ribbon, responses, { onRespond, onPass, deadline, now = () => performance.now() }) {
  ribbon.innerHTML = "";
  ribbon.hidden = responses.length === 0;
  if (!responses.length) return () => {};

  const ring = document.createElement("div");
  ring.className = "ribbon-ring";
  ribbon.append(ring);

  const label = document.createElement("span");
  label.className = "ribbon-label";
  label.textContent = "Respond?";
  ribbon.append(label);

  for (const response of responses) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn ribbon-option";
    btn.textContent = response.label;
    btn.addEventListener("click", () => onRespond(response));
    ribbon.append(btn);
  }
  const pass = document.createElement("button");
  pass.type = "button";
  pass.className = "btn ribbon-pass";
  pass.textContent = "Pass";
  pass.addEventListener("click", onPass);
  ribbon.append(pass);

  const started = now();
  let raf = 0;
  const tick = () => {
    const left = Math.max(0, 1 - (now() - started) / deadline);
    ring.style.setProperty("--left", left.toFixed(3));
    if (left > 0) raf = requestAnimationFrame(tick);
  };
  tick();
  return () => { cancelAnimationFrame(raf); ribbon.hidden = true; ribbon.innerHTML = ""; };
}

/**
 * A compact always-visible picture of one side's field.
 *
 * The telestrator was meant to be the answer to "what is actually on the
 * board", but it is behind a held key, so a player who does not know the
 * gesture sees an opponent who apparently has no cards at all. The spec's own
 * rule applies: if you find yourself holding the board open constantly, the HUD
 * is under-informing. This is the HUD informing.
 *
 * It never reveals more than the board does — a face-down is a face-down here
 * too.
 */
export function renderFieldStrip(container, state, side, { onPip, ready, targets, onInspect } = {}) {
  if (!state) return;
  container.innerHTML = "";
  const seat = state.sides[side];

  const row = (cards, kind) => {
    const group = document.createElement("span");
    group.className = `field-row field-row--${kind}`;
    cards.forEach((inst, index) => {
      // A real button: this is the only always-visible way to reach the board,
      // so attacking has to be possible from here. Behind a held key it is not
      // a control, it is a secret.
      const pip = document.createElement("button");
      pip.type = "button";
      pip.className = "field-pip";
      pip.dataset.index = String(index);
      if (inst) pip.dataset.uid = inst.uid;
      pip.addEventListener("click", () => onPip?.({ side, row: kind, inst, index }));
      if (!inst) { pip.classList.add("is-empty"); pip.disabled = true; group.append(pip); return; }
      const card = getCard(inst.cardId);
      pip.classList.add("is-filled");
      if (inst.faceDown) {
        pip.classList.add("is-facedown");
        pip.textContent = "▨";
        pip.title = kind === "monsters" ? "Face-down monster" : "Set spell or trap";
      } else if (kind === "monsters") {
        const s = effectiveStats(state, side, inst);
        pip.textContent = inst.position === "attack" ? String(s.atk) : `${s.def}D`;
        if (inst.position === "defense") pip.classList.add("is-defense");
        pip.title = `${card.name} — ${s.atk}/${s.def}`;
      } else {
        pip.textContent = "◆";
        pip.title = card.name;
        pip.classList.add(`is-${card.kind}`);
      }
      // The same two highlights the board uses: what you can act with, and what
      // you can point it at.
      if (ready?.has(inst.uid)) pip.classList.add("is-ready");
      if (targets?.has(inst.uid)) pip.classList.add("is-target");
      // The panel itself refuses to show a face-down card you do not own, so
      // this can be wired for both sides without leaking anything.
      wireInspect(pip, { inst, side, onInspect });
      group.append(pip);
    });
    return group;
  };

  container.append(row(seat.monsters, "monsters"), row(seat.backrow, "backrow"));
  container.setAttribute("aria-label", summariseField(state, side));
}

/** The same thing in words, for a screen reader. */
function summariseField(state, side) {
  const seat = state.sides[side];
  const monsters = seat.monsters.filter(Boolean);
  const backrow = seat.backrow.filter(Boolean);
  const named = monsters.filter((inst) => !inst.faceDown)
    .map((inst) => `${getCard(inst.cardId).name} ${effectiveStats(state, side, inst).atk}`);
  const hidden = monsters.length - named.length;
  const parts = [
    named.length ? named.join(", ") : null,
    hidden ? `${hidden} face-down monster${hidden > 1 ? "s" : ""}` : null,
    backrow.length ? `${backrow.length} spell or trap card${backrow.length > 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : "empty field";
}
