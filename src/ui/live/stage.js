// The full-bleed media layer, and the grade over it.
//
// Everything composites into one canvas -- clips, stills and the procedural
// fallback alike. Two reasons, and both matter. The grade has to sit over every
// tier uniformly or the seam between them becomes visible, which is the whole
// trick in §7. And a single composited canvas is what makes the episode export
// in §13 a capture rather than a re-render.

import { drawArena, drawScanlines } from "../../cinema/procedural-stage.js";

export const ASPECT = 2.39;          // committed to; the bars are HUD real estate

const reducedMotion = () =>
  globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

// A fixed noise tile costs one allocation and looks the same as per-frame noise
// once it is weaving. Regenerating it every frame is the expensive way to get
// an identical result.
function grainTile(doc, size = 128) {
  const tile = doc.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext("2d");
  const image = ctx.createImageData?.(size, size);
  if (!image?.data) return null;
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 120 + Math.random() * 80;
    image.data[i] = v; image.data[i + 1] = v; image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return tile;
}

/** Cover-fit, so a 16:9 clip fills a 2.39:1 frame instead of pillarboxing. */
function coverRect(srcW, srcH, w, h) {
  if (!srcW || !srcH) return { x: 0, y: 0, w, h };
  const scale = Math.max(w / srcW, h / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  return { x: (w - drawW) / 2, y: (h - drawH) / 2, w: drawW, h: drawH };
}

const sizeOf = (node) => (node?.tagName === "VIDEO"
  ? { w: node.videoWidth, h: node.videoHeight }
  : { w: node?.naturalWidth, h: node?.naturalHeight });

export function createStage({ canvas, media, accents, getState, onFrame }) {
  const ctx = canvas.getContext("2d");
  let grain = null;                     // null = untried, false = unavailable
  let raf = 0;
  let running = false;
  let frames = 0;
  let blanks = 0;
  let failures = 0;

  // Three-dimensionality comes from light dying. The vignette is where it dies.
  function vignette(w, h) {
    const g = ctx.createRadialGradient(w / 2, h * 0.46, h * 0.22, w / 2, h / 2, h * 0.95);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.62)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // One grade over every tier: bloom, grain, weave. Model variance hides inside
  // texture, and a perfectly clean frame is the thing that reads as synthetic.
  function grade(w, h, t) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.16;
    ctx.drawImage(canvas, -w * 0.012, -h * 0.012, w * 1.024, h * 1.024);  // halation
    ctx.restore();

    vignette(w, h);

    if (grain === null) grain = grainTile(canvas.ownerDocument ?? globalThis.document) ?? false;
    if (!grain) return;                 // no pixel access here; skip, do not retry
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.globalCompositeOperation = "overlay";
    const drift = reducedMotion() ? 0 : (t / 90) % 128;
    const pattern = ctx.createPattern(grain, "repeat");
    if (pattern) {
      ctx.translate(-drift, -((t / 140) % 128));
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w + 128, h + 128);
    }
    ctx.restore();
  }

  function drawMedia(w, h) {
    const node = media();
    if (!node || node.dataset?.ready !== "true") return false;
    const { w: sw, h: sh } = sizeOf(node);
    if (!sw || !sh) return false;
    const rect = coverRect(sw, sh, w, h);
    try {
      ctx.drawImage(node, rect.x, rect.y, rect.w, rect.h);
      return true;
    } catch {
      return false;   // a frame that is not decodable yet is not an error
    }
  }

  // A throw in here must never kill the loop. The reel's promise is that there
  // is always a shot on screen, and a dead animation frame breaks it in the one
  // way the player cannot recover from.
  function frame(now) {
    try { paint(now); } catch (error) {
      failures += 1;
      if (failures === 1) console.warn("stage paint failed; continuing", error);
    }
    frames += 1;
    if (running) raf = requestAnimationFrame(frame);
  }

  function paint(now) {
    const { width: w, height: h } = canvas;
    // Gate weave: a sub-pixel float that keeps the frame from sitting too still.
    const weave = reducedMotion() ? 0 : Math.sin(now / 1700) * 0.8;
    ctx.save();
    ctx.translate(weave, Math.cos(now / 2300) * 0.6);
    ctx.fillStyle = "#05070e";
    ctx.fillRect(-4, -4, w + 8, h + 8);
    const painted = drawMedia(w, h);
    if (!painted) {
      // The floor under the floor: the canvas can always draw the arena, so a
      // media layer that is not ready yet still yields a frame with a picture.
      const [a, b] = accents();
      drawArena(ctx, w, h, { accentA: a, accentB: b, t: reducedMotion() ? 0 : now });
      drawScanlines(ctx, w, h, reducedMotion() ? 0 : now);
      blanks += 1;
    }
    ctx.restore();
    grade(w, h, now);
    onFrame?.({ painted, now, state: getState?.() });
  }

  return {
    start() {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    /** Draw one frame synchronously — used by the export and by tests. */
    render(now = 0) { const was = running; running = false; frame(now); running = was; },
    get stats() { return { frames, medialess: blanks, failures }; },
  };
}
