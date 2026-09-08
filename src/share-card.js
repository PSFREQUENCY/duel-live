// The share card: a 1200x630 canvas render of a finished duel.
//
// Drawn rather than screenshotted so it reads at thumbnail size on a timeline,
// where a capture of the game UI would be an unreadable smear.

import { CARDS } from "./cards/index.js";
import { ATTRIBUTE_PALETTE, drawMonster } from "./cinema/procedural-stage.js";
import { headline, statTiles } from "./duel-stats.js";
import { getMatchup } from "./duelists.js";

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const PAD = 56;
const INK = "#e8eefc";
const DIM = "#92a1c4";
const FAINT = "#5f6d90";
const MONO = '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';
const SANS = 'Inter, "Helvetica Neue", Arial, sans-serif';

function backdrop(ctx, accentA, accentB) {
    const sky = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
    sky.addColorStop(0, "#080c1a");
    sky.addColorStop(0.5, "#111a33");
    sky.addColorStop(1, "#080a16");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    for (const [x, colour] of [[CARD_WIDTH * 0.2, accentA], [CARD_WIDTH * 0.85, accentB]]) {
        const glow = ctx.createRadialGradient(x, CARD_HEIGHT * 0.5, 10, x, CARD_HEIGHT * 0.5, 520);
        glow.addColorStop(0, `${colour}44`);
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    }

    // Faint arena grid, so the card belongs to the same world as the game.
    ctx.save();
    ctx.strokeStyle = `${accentB}22`;
    ctx.lineWidth = 1;
    for (let y = CARD_HEIGHT * 0.62; y < CARD_HEIGHT; y += 26) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CARD_WIDTH, y);
        ctx.stroke();
    }
    ctx.restore();
}

function label(ctx, text, x, y, colour = FAINT) {
    ctx.font = `600 13px ${MONO}`;
    ctx.fillStyle = colour;
    ctx.letterSpacing = "2px";
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.letterSpacing = "0px";
}

function drawHeader(ctx, stats) {
    const matchup = getMatchup(stats.matchupId);
    label(ctx, "Duel Live", PAD, PAD + 4, "#4fc9f0");
    ctx.font = `500 15px ${SANS}`;
    ctx.fillStyle = FAINT;
    ctx.fillText(matchup?.name ?? "", PAD, PAD + 30);

    ctx.font = `700 52px ${SANS}`;
    ctx.fillStyle = INK;
    ctx.fillText(headline(stats), PAD, PAD + 96);

    if (stats.winner) {
        const loser = stats.duelists[stats.loser];
        ctx.font = `400 20px ${SANS}`;
        ctx.fillStyle = DIM;
        ctx.fillText(`over ${loser.name}`, PAD, PAD + 130);
    }
}

function drawTiles(ctx, stats) {
    const tiles = statTiles(stats);
    const top = 268;
    const columns = 3;
    const gap = 18;
    const boxW = (CARD_WIDTH * 0.55 - PAD - gap * (columns - 1)) / columns;
    const boxH = 92;

    tiles.forEach((tile, i) => {
        const x = PAD + (i % columns) * (boxW + gap);
        const y = top + Math.floor(i / columns) * (boxH + gap);
        ctx.fillStyle = "rgba(18, 26, 48, 0.82)";
        ctx.strokeStyle = "rgba(120, 160, 220, 0.22)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, boxW, boxH, 10);
        ctx.fill();
        ctx.stroke();

        label(ctx, tile.label, x + 16, y + 28);
        ctx.font = `700 34px ${MONO}`;
        ctx.fillStyle = INK;
        ctx.fillText(tile.value, x + 16, y + 70);
    });
    return top + Math.ceil(tiles.length / columns) * (boxH + gap);
}

function drawBiggestHit(ctx, stats, y) {
    const hit = stats.biggestHit;
    if (!hit?.card) return;
    ctx.fillStyle = "rgba(244, 197, 49, 0.10)";
    ctx.strokeStyle = "rgba(244, 197, 49, 0.42)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(PAD, y + 8, CARD_WIDTH * 0.55 - PAD, 74, 10);
    ctx.fill();
    ctx.stroke();

    label(ctx, "Biggest hit", PAD + 18, y + 36, "#f4c531");
    ctx.font = `600 21px ${SANS}`;
    ctx.fillStyle = INK;
    const text = `${hit.card} — ${hit.damage.toLocaleString("en")}`;
    ctx.fillText(text, PAD + 18, y + 66);
}

// The winner's ace, drawn with the game's own renderer. The silhouettes are
// built to read at roughly fifty pixels on the battlefield, so blowing one up
// exposes how crude it is -- it is framed as a projection on a lit plinth, with
// scanlines, so the abstraction reads as a hologram rather than a failed dragon.
function drawAce(ctx, stats) {
    const winner = stats.duelists[stats.winner ?? "player"];
    const card = CARDS[winner?.ace];
    if (!card) return;

    const cx = CARD_WIDTH * 0.79;
    const cy = CARD_HEIGHT * 0.44;
    const palette = ATTRIBUTE_PALETTE[card.attribute] ?? ATTRIBUTE_PALETTE.DARK;

    const halo = ctx.createRadialGradient(cx, cy, 10, cx, cy, 250);
    halo.addColorStop(0, `${palette.core}30`);
    halo.addColorStop(1, "transparent");
    ctx.fillStyle = halo;
    ctx.fillRect(CARD_WIDTH * 0.55, 0, CARD_WIDTH * 0.45, CARD_HEIGHT);

    // The projector plinth the hologram stands on.
    const plinthY = CARD_HEIGHT * 0.70;
    ctx.save();
    ctx.strokeStyle = `${palette.core}88`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, plinthY, 150, 26, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(cx, plinthY, 96, 16, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // The projection cone rising from it.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const cone = ctx.createLinearGradient(0, plinthY, 0, cy - 120);
    cone.addColorStop(0, `${palette.core}33`);
    cone.addColorStop(1, "transparent");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(cx - 150, plinthY);
    ctx.lineTo(cx - 66, cy - 120);
    ctx.lineTo(cx + 66, cy - 120);
    ctx.lineTo(cx + 150, plinthY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    drawMonster(ctx, card, { x: cx, y: cy, scale: 112, alpha: 0.92, t: 0 });

    // Hologram scanlines, drawn over the monster and clipped to the cone.
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = palette.glow;
    for (let y = cy - 150; y < plinthY; y += 5) ctx.fillRect(cx - 170, y, 340, 1);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.font = `600 22px ${SANS}`;
    ctx.fillStyle = INK;
    ctx.fillText(card.name, cx, CARD_HEIGHT - 88);
    ctx.font = `500 15px ${MONO}`;
    ctx.fillStyle = DIM;
    ctx.fillText(`${card.atk} ATK · ${winner.title}`, cx, CARD_HEIGHT - 62);
    ctx.textAlign = "left";
}

/** Render a finished duel onto a canvas. Returns the canvas it drew on. */
export function drawShareCard(canvas, stats) {
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    const ctx = canvas.getContext("2d");
    const winner = stats.duelists[stats.winner ?? "player"];
    const loser = stats.duelists[stats.loser ?? "opponent"];

    backdrop(ctx, winner?.accent ?? "#4fc9f0", loser?.accent ?? "#e05a9c");
    ctx.textBaseline = "alphabetic";
    drawAce(ctx, stats);
    drawHeader(ctx, stats);
    const afterTiles = drawTiles(ctx, stats);
    drawBiggestHit(ctx, stats, afterTiles);

    ctx.font = `500 14px ${MONO}`;
    ctx.fillStyle = FAINT;
    ctx.fillText("duel-live · rules engine, AI cinema", PAD, CARD_HEIGHT - 34);

    ctx.strokeStyle = `${winner?.accent ?? "#4fc9f0"}66`;
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, CARD_WIDTH - 3, CARD_HEIGHT - 3);
    return canvas;
}

export const shareFilename = (stats) =>
    `duel-live-${stats.matchupId}-${stats.winner ?? "draw"}.png`;

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
