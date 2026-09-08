// Hand-generated shot templates. The style, world, arenas and character looks
// all come from src/cinema/world.js, so the sheets and the runtime prompt
// builder can never drift apart.

export { ARENAS, LOOKS as DUELISTS, STYLE, WORLD, TITLE_STYLE, assemble, assembleTitle } from "../src/cinema/world.js";

import { ARENAS, LOOKS } from "../src/cinema/world.js";

// Per-duelist shots. `{look}` and `{arena}` are substituted per duelist.
export const DUELIST_SHOTS = [
  { id: "open", priority: 1, seconds: 5, label: "Duel start",
    subject: "{look} raises their left arm and the Duel Disk snaps open, card slots swinging "
      + "out and igniting one after another, light washing up across their face; they lock eyes "
      + "with an unseen opponent across {arena}" },
  { id: "play-summon", priority: 1, seconds: 5, label: "Normal Summon",
    subject: "{look}, slamming a card down into a Duel Disk slot and thrusting their arm forward; a "
      + "column of light erupts from the disk as a monster hologram begins to form above it; "
      + "{arena}" },
  { id: "play-set", priority: 2, seconds: 4, label: "Set a card face-down",
    subject: "{look}, sliding a card face-down into a Duel Disk slot with a flick of the wrist; a "
      + "flat translucent brown card-back hologram materialises horizontally in front of them "
      + "and hangs there; {arena}" },
  { id: "play-activate", priority: 1, seconds: 5, label: "Activate a Spell or Trap",
    subject: "{look}, throwing their arm up as a huge holographic card flips face-up in front of "
      + "them, its frame blazing, flooding the arena with light; {arena}" },
  { id: "draw", priority: 2, seconds: 4, label: "Draw — topdeck moment",
    subject: "close on {look}, drawing a single card from the Duel Disk deck holder and turning "
      + "it over, eyes widening as light catches the card face; {arena}" },
  { id: "react-confident", priority: 1, seconds: 4, label: "Reaction — confident taunt",
    subject: "close-up of {look}, smirking with absolute certainty, head tilted, holographic light "
      + "flickering across their face as they speak; {arena}" },
  { id: "react-shocked", priority: 1, seconds: 4, label: "Reaction — taking a big hit",
    subject: "close-up of {look}, recoiling and throwing an arm up to shield their face as a "
      + "shockwave of light blasts past them, coat and hair whipping back; {arena}" },
  { id: "react-determined", priority: 2, seconds: 4, label: "Reaction — low life points",
    subject: "close-up of {look}, breathing hard, jaw set, refusing to look away, the life-point "
      + "counter on their Duel Disk glowing red beside them; {arena}" },
  { id: "win", priority: 1, seconds: 6, label: "Victory",
    subject: "{look}, standing tall as the last holograms break apart and dissolve around them, "
      + "Duel Disk powering down, wind pulling at their clothes; {arena}" },
  { id: "lose", priority: 2, seconds: 5, label: "Defeat",
    subject: "{look}, staggering back a step as their life-point counter hits zero and every "
      + "hologram in front of them shatters into fading light; {arena}" },
];

export const CONNECTIVE_SHOTS = [
  { id: "arena-rooftop", priority: 1, seconds: 6, label: "Establishing — rooftop arena",
    subject: `a slow push in across ${ARENAS.rooftop}, empty, projector pylons pulsing, ready for a duel` },
  { id: "arena-cliff", priority: 1, seconds: 6, label: "Establishing — cliff arena",
    subject: `a slow push in across ${ARENAS.cliff}, empty, torches guttering, ready for a duel` },
  { id: "lp-damage", priority: 2, seconds: 3, label: "Life points dropping",
    subject: "extreme close-up of the round life-point counter set into a forearm Duel Disk, the "
      + "glowing number spinning downward as the housing flashes red and sparks" },
  { id: "standoff-rooftop", priority: 3, seconds: 6, label: "Standoff loop — rooftop",
    subject: `two duelists faced off at opposite ends of ${ARENAS.rooftop}, Duel Disks lit, `
      + "monsters idling as holograms between them, nothing moving but the rain" },
  { id: "standoff-cliff", priority: 3, seconds: 6, label: "Standoff loop — cliff",
    subject: `two duelists faced off at opposite ends of ${ARENAS.cliff}, Duel Disks lit, `
      + "monsters idling as holograms between them, banners snapping" },
];

// Title cards: the intro, the outro, and a versus plate per duel. These use
// TITLE_STYLE, not the in-duel look.
const versus = (a, b) => `a split-screen versus plate: on the left ${LOOKS[a].look}, on the `
  + `right ${LOOKS[b].look}, both rendered as photoreal 3D characters lit from below, facing `
  + `each other across a jagged energy seam that tears down the centre of frame; holographic `
  + `card silhouettes and data panels sweep past the camera; the seam flares white on impact`;

export const TITLE_SHOTS = [
  { id: "intro", priority: 1, seconds: 6, label: "Opening title sequence",
    subject: "a camera flies through a vast dark cyber-arena as a forearm duel disk unfolds in "
      + "extreme close-up, card slots igniting one by one; holographic monster silhouettes bloom "
      + "and dissolve around it; the camera pulls back hard to reveal the arena floor lighting up "
      + "in a grid" },
  { id: "outro", priority: 1, seconds: 6, label: "End of duel",
    subject: "the holographic arena powers down: light panels shutting off in sequence, monster "
      + "silhouettes dissolving into drifting particles, a forearm duel disk folding closed and "
      + "going dark, camera craning up into black" },
  { id: "vs-yugi-kaiba", priority: 1, seconds: 6, label: "Versus plate — Duel I",
    subject: versus("yugi", "kaiba") },
  { id: "vs-joey-mai", priority: 1, seconds: 6, label: "Versus plate — Duel II",
    subject: versus("joey", "mai") },
];
