// Hold to see the real board.
//
// Live mode's honest problem: a generated clip will not accurately depict five
// monster zones, so a player can lose track of what is actually on the field.
// The fix is a gesture, not a panel. If it turns out a player holds this open
// constantly, the HUD is under-informing -- that is a bug in the bars, not an
// argument for pinning the board back on screen.

import { renderZones } from "../../render.js";

const HOLD_KEY = "Tab";
const FADE_MS = 200;
const TOUCH_HOLD_MS = 350;

export function createTelestrator({ root, rows, getState, onZoneClick, sticky = false }) {
  let shown = false;
  let pinned = false;
  let touchTimer = 0;

  function paint() {
    const state = getState();
    if (!state) return;
    // The same renderer and the same zone ids as tactical mode: one board, two
    // presentations, so the two can never disagree about what is on the field.
    for (const [side, row, container] of rows) {
      renderZones(state, side, container, { row, onZoneClick });
    }
  }

  function show() {
    if (shown) return;
    shown = true;
    paint();
    root.hidden = false;
    // A frame between unhide and the class so the transition actually runs.
    requestAnimationFrame(() => root.classList.add("is-open"));
  }

  function hide() {
    if (!shown || pinned) return;
    shown = false;
    root.classList.remove("is-open");
    setTimeout(() => { if (!shown) root.hidden = true; }, FADE_MS);
  }

  function onKeyDown(event) {
    if (event.key !== HOLD_KEY || event.repeat) return;
    event.preventDefault();           // Tab would otherwise walk the focus ring
    if (sticky) { pinned = !pinned; pinned ? show() : (pinned = false, hide()); return; }
    show();
  }

  function onKeyUp(event) {
    if (event.key !== HOLD_KEY || sticky) return;
    event.preventDefault();
    hide();
  }

  function onTouchStart() {
    clearTimeout(touchTimer);
    touchTimer = setTimeout(show, TOUCH_HOLD_MS);
  }

  function onTouchEnd() {
    clearTimeout(touchTimer);
    hide();
  }

  return {
    attach(doc = document) {
      doc.addEventListener("keydown", onKeyDown);
      doc.addEventListener("keyup", onKeyUp);
      root.addEventListener("touchstart", onTouchStart, { passive: true });
      root.addEventListener("touchend", onTouchEnd);
      root.addEventListener("touchcancel", onTouchEnd);
    },
    detach(doc = document) {
      doc.removeEventListener("keydown", onKeyDown);
      doc.removeEventListener("keyup", onKeyUp);
      clearTimeout(touchTimer);
    },
    /** Repaint while open, so the board does not go stale under the finger. */
    refresh() { if (shown) paint(); },
    setSticky(value) { sticky = value; if (!value) { pinned = false; hide(); } },
    show,
    hide() { pinned = false; hide(); },
    get open() { return shown; },
  };
}
