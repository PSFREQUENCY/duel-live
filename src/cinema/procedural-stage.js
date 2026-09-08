// Tier 0 cinema: a seeded holographic arena drawn entirely on a 2D canvas.
// No key, no network, no assets -- this is what plays the instant a duel starts
// and what every higher tier falls back to.

const ATTRIBUTE_PALETTE = {
  DARK:  { core: "#b96bff", edge: "#4a1d7a", glow: "#e0b8ff" },
  LIGHT: { core: "#8fe6ff", edge: "#1d5f7a", glow: "#e8fbff" },
  FIRE:  { core: "#ff8a3c", edge: "#7a2a08", glow: "#ffd9b0" },
  WIND:  { core: "#7fe6a8", edge: "#1c5c39", glow: "#d6ffe8" },
  EARTH: { core: "#f0c264", edge: "#6b4a12", glow: "#fff0c8" },
  WATER: { core: "#5fb2ff", edge: "#14406e", glow: "#cfe8ff" },
};

const SILHOUETTE = {
  Dragon: drawDragon,
  "Winged Beast": drawWinged,
  Warrior: drawWarrior,
  "Beast-Warrior": drawWarrior,
  Spellcaster: drawCaster,
  Fiend: drawFiend,
  Beast: drawBeast,
  Fairy: drawWinged,
  "Sea Serpent": drawDragon,
};

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------ silhouettes ---

function limb(ctx, x1, y1, x2, y2, w) {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawDragon(ctx, s, rng) {
  ctx.beginPath();
  ctx.moveTo(-s * 0.1, s * 0.9);
  ctx.quadraticCurveTo(-s * 0.35, s * 0.1, 0, -s * 0.55);
  ctx.quadraticCurveTo(s * 0.28, -s * 0.95, s * 0.6, -s * 0.75);
  ctx.quadraticCurveTo(s * 0.3, -s * 0.55, s * 0.16, -s * 0.42);
  ctx.quadraticCurveTo(s * 0.5, s * 0.2, s * 0.24, s * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 2; i += 1) {
    const flip = i ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(flip * s * 0.05, -s * 0.35);
    ctx.quadraticCurveTo(flip * s * (0.9 + rng() * 0.3), -s * (1.15 + rng() * 0.25), flip * s * 1.15, -s * 0.1);
    ctx.quadraticCurveTo(flip * s * 0.6, -s * 0.3, flip * s * 0.08, -s * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawWinged(ctx, s, rng) {
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.05, s * 0.2, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -s * 0.68, s * 0.17, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  for (let i = 0; i < 2; i += 1) {
    const flip = i ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(flip * s * 0.12, -s * 0.35);
    for (let f = 0; f < 4; f += 1) {
      const t = (f + 1) / 4;
      ctx.lineTo(flip * s * (0.3 + t * 0.95), -s * (0.55 + t * 0.5 + rng() * 0.1));
      ctx.lineTo(flip * s * (0.25 + t * 0.9), -s * (0.2 + t * 0.35));
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  limb(ctx, -s * 0.1, s * 0.42, -s * 0.2, s * 0.9, s * 0.09);
  limb(ctx, s * 0.1, s * 0.42, s * 0.2, s * 0.9, s * 0.09);
}

function drawWarrior(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(-s * 0.26, -s * 0.35);
  ctx.lineTo(s * 0.26, -s * 0.35);
  ctx.lineTo(s * 0.17, s * 0.35);
  ctx.lineTo(-s * 0.17, s * 0.35);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -s * 0.55, s * 0.16, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  limb(ctx, -s * 0.24, -s * 0.28, -s * 0.5, s * 0.1, s * 0.1);
  limb(ctx, s * 0.24, -s * 0.28, s * 0.52, -s * 0.15, s * 0.1);
  limb(ctx, -s * 0.12, s * 0.35, -s * 0.2, s * 0.92, s * 0.11);
  limb(ctx, s * 0.12, s * 0.35, s * 0.22, s * 0.92, s * 0.11);
  ctx.lineWidth = s * 0.06;
  ctx.beginPath();
  ctx.moveTo(s * 0.52, -s * 0.15);
  ctx.lineTo(s * 0.62, -s * 1.0);
  ctx.stroke();
}

function drawCaster(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.5);
  ctx.quadraticCurveTo(-s * 0.5, s * 0.2, -s * 0.34, s * 0.92);
  ctx.lineTo(s * 0.34, s * 0.92);
  ctx.quadraticCurveTo(s * 0.5, s * 0.2, 0, -s * 0.5);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -s * 0.62, s * 0.15, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.lineWidth = s * 0.055;
  ctx.beginPath();
  ctx.moveTo(s * 0.42, s * 0.75);
  ctx.lineTo(s * 0.5, -s * 0.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s * 0.5, -s * 0.95, s * 0.13, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
}

function drawFiend(ctx, s, rng) {
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, s * 0.9);
  ctx.quadraticCurveTo(-s * 0.42, -s * 0.2, 0, -s * 0.5);
  ctx.quadraticCurveTo(s * 0.42, -s * 0.2, s * 0.3, s * 0.9);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -s * 0.66, s * 0.17, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  for (let i = 0; i < 2; i += 1) {
    const flip = i ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(flip * s * 0.1, -s * 0.78);
    ctx.quadraticCurveTo(flip * s * 0.42, -s * (1.2 + rng() * 0.2), flip * s * 0.2, -s * 1.25);
    ctx.quadraticCurveTo(flip * s * 0.2, -s * 0.95, flip * s * 0.05, -s * 0.8);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  limb(ctx, -s * 0.3, -s * 0.25, -s * 0.62, s * 0.25, s * 0.09);
  limb(ctx, s * 0.3, -s * 0.25, s * 0.62, s * 0.25, s * 0.09);
}

function drawBeast(ctx, s, rng) {
  ctx.beginPath();
  ctx.ellipse(0, s * 0.1, s * 0.55, s * 0.32, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.arc(-s * 0.55, -s * 0.2, s * 0.22, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  for (let i = 0; i < 4; i += 1) {
    const x = -s * 0.35 + (i % 2) * s * 0.7;
    limb(ctx, x, s * 0.3, x + (rng() - 0.5) * s * 0.15, s * 0.92, s * 0.11);
  }
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.0);
  ctx.quadraticCurveTo(s * 0.95, -s * 0.35, s * 0.8, -s * 0.6);
  ctx.lineWidth = s * 0.07;
  ctx.stroke();
}

function drawGeneric(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.85);
  for (let i = 1; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * s * 0.62, Math.sin(a) * s * 0.85);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

// ------------------------------------------------------------- public API ---

export function drawMonster(ctx, card, { x, y, scale, flip = false, alpha = 1, t = 0 }) {
  const palette = ATTRIBUTE_PALETTE[card.attribute] ?? ATTRIBUTE_PALETTE.DARK;
  const rng = seededRng(hash(card.id));
  const bob = Math.sin(t * 0.0022 + hash(card.id) % 100) * scale * 0.03;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y + bob);
  if (flip) ctx.scale(-1, 1);
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = scale * 0.5;
  const grad = ctx.createLinearGradient(0, -scale, 0, scale);
  grad.addColorStop(0, palette.glow);
  grad.addColorStop(0.45, palette.core);
  grad.addColorStop(1, palette.edge);
  ctx.fillStyle = grad;
  ctx.strokeStyle = palette.glow;
  ctx.lineWidth = scale * 0.035;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  (SILHOUETTE[card.type] ?? drawGeneric)(ctx, scale, rng);
  ctx.restore();
  return palette;
}

function drawFloorGrid(ctx, w, h, horizon, accent, t) {
  ctx.save();
  ctx.strokeStyle = `${accent}77`;
  ctx.lineWidth = 1.4;
  const drift = (t * 0.02) % 40;
  for (let i = 0; i < 22; i += 1) {
    const y = horizon + ((i * 40 + drift) ** 1.35) / 90;
    if (y > h) break;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  for (let i = -14; i <= 14; i += 1) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + i * (w / 26), horizon);
    ctx.lineTo(w / 2 + i * (w / 4), h);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawArena(ctx, w, h, { accentA, accentB, t = 0 }) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#0a1024");
  sky.addColorStop(0.5, "#141d3c");
  sky.addColorStop(1, "#070b1a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const horizon = h * 0.62;
  const halo = ctx.createRadialGradient(w / 2, horizon, 10, w / 2, horizon, w * 0.78);
  halo.addColorStop(0, `${accentA}77`);
  halo.addColorStop(0.45, `${accentA}22`);
  halo.addColorStop(1, "transparent");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  // A bright band on the horizon line keeps the arena reading as a lit stage
  // rather than an empty black rectangle.
  const band = ctx.createLinearGradient(0, horizon - h * 0.09, 0, horizon + h * 0.05);
  band.addColorStop(0, "transparent");
  band.addColorStop(0.62, `${accentB}66`);
  band.addColorStop(1, "transparent");
  ctx.fillStyle = band;
  ctx.fillRect(0, horizon - h * 0.09, w, h * 0.14);

  drawFloorGrid(ctx, w, h, horizon, accentB, t);
  return horizon;
}

export function drawBeam(ctx, from, to, palette, progress) {
  const x = from.x + (to.x - from.x) * progress;
  const y = from.y + (to.y - from.y) * progress;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const grad = ctx.createLinearGradient(from.x, from.y, x, y);
  grad.addColorStop(0, "transparent");
  grad.addColorStop(1, palette.glow);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 14 + Math.sin(progress * Math.PI) * 22;
  ctx.lineCap = "round";
  ctx.shadowColor = palette.core;
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
}

export function drawImpact(ctx, x, y, palette, progress) {
  const r = progress * 190;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.max(0, 1 - progress);
  ctx.strokeStyle = palette.glow;
  ctx.lineWidth = 10 * (1 - progress) + 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const len = r * (0.7 + (i % 3) * 0.22);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawScanlines(ctx, w, h, t) {
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = "#9fe8ff";
  for (let y = (t * 0.05) % 4; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  ctx.restore();
}

export { ATTRIBUTE_PALETTE };
