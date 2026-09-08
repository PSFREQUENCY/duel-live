// Cinema player: owns the canvas loop, the shot queue, and the hand-off to a
// higher tier when one arrives in time. Nothing here can change the duel; it
// only renders what the engine already decided.

import { CARDS } from "../cards/index.js";
import { drawArena, drawBeam, drawImpact, drawMonster, drawScanlines } from "./procedural-stage.js";
import { prefetch, resolve } from "./free-video.js";
import { speak, stopVoice } from "./realtime-voice.js";

const byName = Object.fromEntries(Object.values(CARDS).map((c) => [c.name, c]));
const FACE_DOWN = { id: "facedown", attribute: "DARK", type: "Fiend", name: "?" };
const card = (name) => byName[name] ?? FACE_DOWN;

// Mirrors the .zones flex row in styles.css so a hologram is projected over the
// card it belongs to, rather than floating unrelated in the middle of the stage.
const ZONE_ROW_HEIGHT = 0.15;   // .zones { height: 15% }
const ZONE_ASPECT = 59 / 86;    // .zone { aspect-ratio: 59 / 86 }
const ZONE_GAP = 0.008;         // clamp(4px, 0.9vw, 10px), as a fraction of width

const ZONE_COUNT = 5;

// Row centres: opponent monsters sit at top 28%, the player's at bottom 28%.
const rowY = (side, h) => (side === "player" ? h * 0.645 : h * 0.355);

// `slot` is the real zone index, matching the five zones the DOM always renders.
function anchor(side, slot, w, h) {
  const zoneW = h * ZONE_ROW_HEIGHT * ZONE_ASPECT;
  const gap = w * ZONE_GAP;
  const rowW = ZONE_COUNT * zoneW + (ZONE_COUNT - 1) * gap;
  const startX = (w - rowW) / 2;
  return { x: startX + slot * (zoneW + gap) + zoneW / 2, y: rowY(side, h) };
}

// Attacks read better staged down the centre line than from a specific zone.
const centre = (side, w, h) => ({ x: w / 2, y: rowY(side, h) });

const involves = (event, name) =>
  event.card === name || event.attacker === name || event.defender === name;

function drawBoard(ctx, state, current, t) {
  const { width: w, height: h } = ctx.canvas;
  for (const side of ["opponent", "player"]) {
    state.sides[side].monsters.forEach((inst, slot) => {
      if (!inst) return;
      const spot = anchor(side, slot, w, h);
      const face = CARDS[inst.cardId]?.name ?? "";
      const focused = current?.shot.event && involves(current.shot.event, face);
      drawMonster(ctx, inst.faceDown ? FACE_DOWN : card(face), {
        x: spot.x, y: spot.y, scale: h * (inst.faceDown ? 0.05 : 0.075),
        flip: side === "opponent", alpha: inst.faceDown ? 0.4 : (focused ? 1 : 0.72), t,
      });
    });
  }
}

function drawStrike(ctx, shot, p, t, w, h) {
  const foeSide = shot.side === "player" ? "opponent" : "player";
  const from = centre(shot.side, w, h);
  const to = centre(foeSide, w, h);
  const lunge = Math.min(p * 1.6, 0.34);
  const palette = drawMonster(ctx, card(shot.event?.attacker ?? shot.event?.card ?? ""), {
    x: from.x + (to.x - from.x) * lunge, y: from.y + (to.y - from.y) * lunge,
    scale: h * 0.13, flip: shot.side === "opponent", alpha: 1, t,
  });
  if (p > 0.3) drawBeam(ctx, from, to, palette, Math.min(1, (p - 0.3) / 0.4));
  if (p > 0.62) drawImpact(ctx, to.x, to.y, palette, (p - 0.62) / 0.38);
}

function drawArrival(ctx, shot, p, t, w, h) {
  const rise = 1 - (1 - Math.min(p * 1.7, 1)) ** 3;
  drawMonster(ctx, card(shot.title), {
    x: w / 2, y: h * 0.5 + (1 - rise) * h * 0.22,
    scale: h * 0.19 * (0.6 + rise * 0.4), flip: shot.side === "opponent", alpha: rise, t,
  });
  if (shot.kind === "fusion" && p < 0.6) {
    drawImpact(ctx, w / 2, h * 0.55, { glow: "#ffd9b0", core: "#ff8a3c" }, p / 0.6);
  }
}

function drawCardFlash(ctx, shot, p, w, h) {
  const trap = shot.kind === "trap";
  const palette = { glow: trap ? "#ff9ec4" : "#8fe6ff", core: trap ? "#c2185b" : "#1d5f7a" };
  drawImpact(ctx, w / 2, h * 0.5, palette, p);
  ctx.save();
  ctx.globalAlpha = Math.max(0, 0.5 - p * 0.5);
  ctx.fillStyle = palette.glow;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawWhiteout(ctx, p, w, h) {
  ctx.save();
  ctx.globalAlpha = Math.min(0.45, p * 0.45);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawShotFx(ctx, shot, p, t) {
  const { width: w, height: h } = ctx.canvas;
  if (shot.kind === "clash" || shot.kind === "direct") drawStrike(ctx, shot, p, t, w, h);
  else if (shot.kind === "summon" || shot.kind === "fusion") drawArrival(ctx, shot, p, t, w, h);
  else if (shot.kind === "spell" || shot.kind === "trap") drawCardFlash(ctx, shot, p, w, h);
  else if (shot.kind === "finish") drawWhiteout(ctx, p, w, h);
}

// The DOM surface of the stage: the caption block and the two media layers.
// Split out so the queue closure below only has to own timing and ordering.
function createStageMedia({ still, video, caption }) {
  return {
    showCaption(shot, tierLabel) {
      if (!caption.root) return;
      caption.root.hidden = false;
      caption.kind.textContent = shot.kind.toUpperCase();
      caption.title.textContent = shot.title ?? "";
      caption.sub.textContent = shot.subtitle ?? "";
      caption.tier.textContent = tierLabel;
    },
    hideCaption() { if (caption.root) caption.root.hidden = true; },
    hide() {
      still.classList.remove("is-live");
      video.classList.remove("is-live");
      video.pause?.();
    },
    async attach(asset) {
      const node = asset.tier === "video" ? video : still;
      const spare = asset.tier === "video" ? still : video;
      node.hidden = false;
      node.src = asset.url;
      if (asset.tier === "video") node.loop = true;
      node.classList.add("is-live");
      spare.classList.remove("is-live");
      if (asset.tier === "video") {
        try { await node.play(); } catch { /* autoplay blocked; the frame still shows */ }
      }
      if (caption.tier) caption.tier.textContent = `${asset.tier} · ${asset.cached ? "cached" : "generated"}`;
    },
    showStill(url) {
      still.hidden = false;
      still.src = url;
      still.classList.add("is-live");
    },
  };
}

// A backlog of shots must not become a backlog of waiting. The pace is decided
// once for a whole turn's worth of shots and applied uniformly: a busy turn
// plays as one fast sequence rather than accelerating and then dragging on the
// tail, which is both quicker and easier to read.
export function paceFor(batchSize) {
  if (batchSize <= 1) return 1;
  if (batchSize <= 3) return 0.72;
  if (batchSize <= 5) return 0.5;
  if (batchSize <= 8) return 0.36;
  return 0.26;
}

const MIN_SHOT_MS = 700;

export function createCinema({ canvas, still, video, caption, getState, accents, onShot }) {
  const stage = createStageMedia({ still, video, caption });
  const ctx = canvas.getContext("2d");
  const queue = [];
  let current = null;
  let startedAt = 0;
  let raf = 0;
  let running = false;
  let muted = false;
  let tierPref = "video";
  let idle = null;
  let drawFailures = 0;

  // A throw in here used to kill the loop permanently, which froze the queue and
  // with it the whole duel. The loop must always reschedule itself.
  function frame(now) {
    try {
      const state = getState();
      const [a, b] = accents();
      drawArena(ctx, canvas.width, canvas.height, { accentA: a, accentB: b, t: now });
      if (state) drawBoard(ctx, state, current, now);
      if (current) {
        const p = Math.min(1, (now - startedAt) / current.durationMs);
        if (state) drawShotFx(ctx, current.shot, p, now);
        if (p >= 1) finishShot();
      }
      drawScanlines(ctx, canvas.width, canvas.height, now);
    } catch (error) {
      drawFailures += 1;
      if (drawFailures === 1) console.warn("cinema draw failed; continuing", error);
      if (current) finishShot();
    }
    raf = requestAnimationFrame(frame);
  }

  function finishShot() {
    current = null;
    stage.hide();
    stage.hideCaption();
    pump();
  }

  function pump() {
    if (current) return;
    if (!queue.length) { showIdle(); return; }
    const { shot, tier, pace = 1 } = queue.shift();
    const ms = (shot.seconds ?? 3) * 1000 * pace;
    current = { shot, durationMs: Math.max(MIN_SHOT_MS, ms) };
    startedAt = performance.now();
    stage.showCaption(shot, tier === "procedural" ? "procedural" : `${tier} · generating`);
    onShot?.(shot);
    if (shot.voice) speak(shot.voice, getState()?.sides[shot.side]?.duelistId, { muted });
    // Look ahead so the next real asset is already in flight.
    for (const next of queue.slice(0, 2)) if (next.tier !== "procedural") prefetch(next.shot, next.tier);
    if (tier !== "procedural") {
      resolve(shot, { tier, timeoutMs: current.durationMs * 0.8 })
        .then((asset) => { if (asset && current?.shot.id === shot.id) stage.attach(asset); });
    }
  }

  function showIdle() {
    if (!idle || tierPref === "procedural") return;
    const shot = idle;
    idle = null;
    resolve(shot, { tier: "still" }).then((asset) => {
      if (!current && asset) stage.showStill(asset.url);
    });
  }

  return {
    start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } },
    // Cut the current shot short; with `all`, drop the whole backlog too.
    skip({ all = false } = {}) {
      if (all) queue.length = 0;
      if (current) finishShot();
      return true;
    },
    stop() { running = false; cancelAnimationFrame(raf); stopVoice(); },
    enqueue(plan) {
      const pace = paceFor(queue.length + plan.length + (current ? 1 : 0));
      queue.push(...plan.map((entry) => ({ ...entry, pace })));
      pump();
    },
    setIdle(shot) { idle = shot; },
    setTier(pref) { tierPref = pref; },
    setMuted(value) { muted = value; if (value) stopVoice(); },
    clear() {
      queue.length = 0; current = null; stage.hide(); stage.hideCaption(); stopVoice();
    },
    get busy() { return Boolean(current) || queue.length > 0; },
    get pendingCount() { return queue.length + (current ? 1 : 0); },
    get drawFailures() { return drawFailures; },
  };
}
