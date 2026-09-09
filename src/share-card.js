// The share card: a finished duel drawn to a canvas in either social format.
//
// Drawn rather than screenshotted so it reads at thumbnail size on a timeline,
// where a capture of the game UI would be an unreadable smear. The two formats
// are separate compositions rather than one layout stretched: landscape sets
// the ace beside the numbers, portrait stacks them.

import { CARDS } from "./cards/index.js";
import { ATTRIBUTE_PALETTE, drawMonster } from "./cinema/procedural-stage.js";
import { headline, statTiles } from "./duel-stats.js";
import { getMatchup } from "./duelists.js";

export const FORMATS = {
  landscape: { id: "landscape", label: "16:9", width: 1280, height: 720, columns: 3 },
  portrait: { id: "portrait", label: "9:16", width: 1080, height: 1920, columns: 2 },
};

export const DEFAULT_FORMAT = "landscape";
export const getFormat = (id) => FORMATS[id] ?? FORMATS[DEFAULT_FORMAT];

const INK = "#e8eefc";
const DIM = "#92a1c4";
const FAINT = "#5f6d90";
const GOLD = "#f4c531";
const MONO = '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';
const SANS = 'Inter, "Helvetica Neue", Arial, sans-serif';

// --------------------------------------------------------------- painting ---

function backdrop(ctx, { width, height }, accentA, accentB) {
  const sky = ctx.createLinearGradient(0, 0, width, height);
  sky.addColorStop(0, "#080c1a");
  sky.addColorStop(0.5, "#111a33");
  sky.addColorStop(1, "#080a16");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  for (const [x, y, colour] of [
    [width * 0.2, height * 0.35, accentA],
    [width * 0.85, height * 0.7, accentB],
  ]) {
    const glow = ctx.createRadialGradient(x, y, 10, x, y, Math.max(width, height) * 0.45);
    glow.addColorStop(0, `${colour}44`);
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.save();
  ctx.strokeStyle = `${accentB}22`;
  ctx.lineWidth = 1;
  for (let y = height * 0.62; y < height; y += height * 0.036) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function label(ctx, text, x, y, size, colour = FAINT) {
  ctx.font = `600 ${size}px ${MONO}`;
  ctx.fillStyle = colour;
  ctx.letterSpacing = `${Math.round(size * 0.16)}px`;
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = "0px";
}

// Wraps on words so a long headline never runs off the edge.
function wrap(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawHeader(ctx, stats, box, scale) {
  const matchup = getMatchup(stats.matchupId);
  label(ctx, "Duel Live", box.x, box.y + 14 * scale, 13 * scale, "#4fc9f0");

  ctx.font = `500 ${15 * scale}px ${SANS}`;
  ctx.fillStyle = FAINT;
  ctx.fillText(matchup?.name ?? "", box.x, box.y + 40 * scale);

  const size = 52 * scale;
  ctx.font = `700 ${size}px ${SANS}`;
  ctx.fillStyle = INK;
  let y = box.y + 100 * scale;
  for (const line of wrap(ctx, headline(stats), box.width)) {
    ctx.fillText(line, box.x, y);
    y += size * 1.08;
  }

  if (stats.winner) {
    ctx.font = `400 ${20 * scale}px ${SANS}`;
    ctx.fillStyle = DIM;
    ctx.fillText(`over ${stats.duelists[stats.loser].name}`, box.x, y + 6 * scale);
    y += 30 * scale;
  }
  return y;
}

function drawTiles(ctx, stats, box, scale, columns) {
  const tiles = statTiles(stats);
  const gap = 18 * scale;
  const boxW = (box.width - gap * (columns - 1)) / columns;
  const boxH = 92 * scale;

  tiles.forEach((tile, i) => {
    const x = box.x + (i % columns) * (boxW + gap);
    const y = box.y + Math.floor(i / columns) * (boxH + gap);
    ctx.fillStyle = "rgba(18, 26, 48, 0.82)";
    ctx.strokeStyle = "rgba(120, 160, 220, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 10 * scale);
    ctx.fill();
    ctx.stroke();

    label(ctx, tile.label, x + 16 * scale, y + 28 * scale, 12 * scale);
    ctx.font = `700 ${34 * scale}px ${MONO}`;
    ctx.fillStyle = INK;
    ctx.fillText(tile.value, x + 16 * scale, y + 70 * scale);
  });
  return box.y + Math.ceil(tiles.length / columns) * (boxH + gap) - gap;
}

function drawBiggestHit(ctx, stats, box, scale) {
  const hit = stats.biggestHit;
  if (!hit?.card) return box.y;
  const height = 74 * scale;
  ctx.fillStyle = "rgba(244, 197, 49, 0.10)";
  ctx.strokeStyle = "rgba(244, 197, 49, 0.42)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.width, height, 10 * scale);
  ctx.fill();
  ctx.stroke();

  label(ctx, "Biggest hit", box.x + 18 * scale, box.y + 28 * scale, 12 * scale, GOLD);
  ctx.font = `600 ${21 * scale}px ${SANS}`;
  ctx.fillStyle = INK;
  ctx.fillText(
    `${hit.card} — ${hit.damage.toLocaleString("en")}`,
    box.x + 18 * scale,
    box.y + 58 * scale,
  );
  return box.y + height;
}

// The ace silhouettes are built to read at roughly fifty pixels on the
// battlefield, so one blown up is framed as a projection on a lit plinth --
// the abstraction then reads as a hologram rather than a failed dragon.
function drawAce(ctx, stats, box, scale) {
  const winner = stats.duelists[stats.winner ?? "player"];
  const card = CARDS[winner?.ace];
  if (!card) return;

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height * 0.42;
  const size = Math.min(box.width, box.height) * 0.34;
  const plinthY = box.y + box.height * 0.78;
  const palette = ATTRIBUTE_PALETTE[card.attribute] ?? ATTRIBUTE_PALETTE.DARK;

  const halo = ctx.createRadialGradient(cx, cy, 10, cx, cy, size * 2.2);
  halo.addColorStop(0, `${palette.core}30`);
  halo.addColorStop(1, "transparent");
  ctx.fillStyle = halo;
  ctx.fillRect(box.x, box.y, box.width, box.height);

  ctx.save();
  ctx.strokeStyle = `${palette.core}88`;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.ellipse(cx, plinthY, size * 1.34, size * 0.23, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.ellipse(cx, plinthY, size * 0.86, size * 0.14, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const cone = ctx.createLinearGradient(0, plinthY, 0, cy - size);
  cone.addColorStop(0, `${palette.core}33`);
  cone.addColorStop(1, "transparent");
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(cx - size * 1.34, plinthY);
  ctx.lineTo(cx - size * 0.6, cy - size);
  ctx.lineTo(cx + size * 0.6, cy - size);
  ctx.lineTo(cx + size * 1.34, plinthY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  drawMonster(ctx, card, { x: cx, y: cy, scale: size, alpha: 0.92, t: 0 });

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = palette.glow;
  for (let y = cy - size * 1.34; y < plinthY; y += 5 * scale) {
    ctx.fillRect(cx - size * 1.5, y, size * 3, 1);
  }
  ctx.restore();

  ctx.textAlign = "center";
  ctx.font = `600 ${22 * scale}px ${SANS}`;
  ctx.fillStyle = INK;
  ctx.fillText(card.name, cx, plinthY + 52 * scale);
  ctx.font = `500 ${15 * scale}px ${MONO}`;
  ctx.fillStyle = DIM;
  ctx.fillText(`${card.atk} ATK · ${winner.title}`, cx, plinthY + 78 * scale);
  ctx.textAlign = "left";
}

// ------------------------------------------------------------- composition ---

/** Render a finished duel onto a canvas in the given format. */
export function drawShareCard(canvas, stats, formatId = DEFAULT_FORMAT) {
  const format = getFormat(formatId);
  canvas.width = format.width;
  canvas.height = format.height;

  const ctx = canvas.getContext("2d");
  const portrait = format.id === "portrait";
  const scale = portrait ? 1.35 : 1;
  const pad = 56 * scale;
  const gap = 26 * scale;
  const winner = stats.duelists[stats.winner ?? "player"];
  const loser = stats.duelists[stats.loser ?? "opponent"];

  backdrop(ctx, format, winner?.accent ?? "#4fc9f0", loser?.accent ?? "#e05a9c");
  ctx.textBaseline = "alphabetic";

  // Landscape sets the ace in its own column beside the numbers; portrait
  // stacks it between them. Blocks flow from the bottom of the one above
  // rather than sitting at fixed fractions, so a headline that wraps to two
  // lines pushes what follows instead of colliding with it.
  const column = portrait
    ? { x: pad, width: format.width - pad * 2 }
    : { x: pad, width: format.width * 0.55 - pad };

  if (!portrait) {
    drawAce(ctx, stats, { x: format.width * 0.57, y: 0, width: format.width * 0.43, height: format.height }, scale);
  }

  let y = drawHeader(ctx, stats, { ...column, y: pad }, scale) + gap;

  if (portrait) {
    const aceHeight = format.height * 0.36;
    drawAce(ctx, stats, { ...column, y, height: aceHeight }, scale);
    y += aceHeight + gap * 2;
  }

  y = drawTiles(ctx, stats, { ...column, y }, scale, format.columns) + gap;
  drawBiggestHit(ctx, stats, { ...column, y }, scale);

  ctx.font = `500 ${14 * scale}px ${MONO}`;
  ctx.fillStyle = FAINT;
  ctx.fillText("duel-live · rules engine, AI cinema", pad, format.height - pad * 0.6);

  ctx.strokeStyle = `${winner?.accent ?? "#4fc9f0"}66`;
  ctx.lineWidth = 3 * scale;
  ctx.strokeRect(1.5 * scale, 1.5 * scale, format.width - 3 * scale, format.height - 3 * scale);
  return canvas;
}

export const shareFilename = (stats, formatId = DEFAULT_FORMAT) =>
  `duel-live-${stats.matchupId}-${stats.winner ?? "draw"}-${getFormat(formatId).label.replace(":", "x")}.png`;

export function shareText(stats) {
  const winner = stats.duelists[stats.winner ?? "player"];
  const side = stats.winner ?? "player";
  const bits = [
    `${headline(stats)} — ${stats.lifePoints[side]} LP left after ${stats.turns} turns.`,
  ];
  if (stats.biggestHit?.card) {
    bits.push(`Biggest hit: ${stats.biggestHit.card} for ${stats.biggestHit.damage}.`);
  }
  bits.push(`${winner.name} · Duel Live`);
  return bits.join(" ");
}
