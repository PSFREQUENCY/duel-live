// Archetype clips. Generating a fresh video for every unique shot means nothing
// is ever reused and a small budget buys a handful of moments. Keying clips by
// what a viewer actually reads instead -- kind, attribute, creature family --
// collapses the whole game onto a fixed library that is generated once and then
// replayed for free forever.

import { CARDS } from "../cards/index.js";
import { assemble, NEUTRAL_ARENA } from "./world.js";

const FAMILY = {
  Dragon: "dragon", "Sea Serpent": "dragon",
  Warrior: "warrior", "Beast-Warrior": "warrior",
  Spellcaster: "spellcaster", Fiend: "fiend",
  Beast: "beast", "Winged Beast": "winged", Fairy: "winged",
};

const FAMILY_LOOK = {
  dragon: "an enormous armoured dragon, wings spread, jaws wide",
  warrior: "an armoured warrior in a heavy battle stance, weapon raised",
  spellcaster: "a robed sorcerer channelling energy through a raised staff",
  fiend: "a horned demonic creature wreathed in crackling shadow",
  beast: "a huge four-legged beast mid-pounce, muscles bunched",
  winged: "a winged humanoid creature banking hard, feathers flaring",
  other: "a towering duel monster braced for battle",
};

const ATTRIBUTE_LOOK = {
  DARK: "deep violet and black energy, purple rim light",
  LIGHT: "brilliant white and cyan energy, blinding highlights",
  FIRE: "orange and red flame, embers streaming",
  WIND: "green and white air currents, swirling gusts",
  EARTH: "amber and bronze earth energy, dust and stone",
  WATER: "deep blue water energy, spray and mist",
};

let byName = null;
const cardByName = (name) => {
  byName ??= Object.fromEntries(Object.values(CARDS).map((c) => [c.name, c]));
  return byName[name] ?? null;
};

function creatureOf(shot) {
  const name = shot.event?.attacker ?? shot.event?.card ?? shot.title;
  const card = cardByName(name);
  if (!card || card.kind !== "monster") return null;
  return { attribute: card.attribute, family: FAMILY[card.type] ?? "other" };
}

const MONSTER_KINDS = new Set(["summon", "fusion", "clash", "direct"]);

// Shots that are really about the duelist, not the monster. When we know who is
// acting, a character clip beats a generic one -- and these are exactly the
// clips the hand-made shot list produces.
const DUELIST_CLIP = { spell: "play-activate", trap: "play-activate", finish: "win", idle: null };

export function duelistKeyFor(shot) {
  if (!shot?.duelistId) return null;
  const prefix = DUELIST_CLIP[shot.kind];
  return prefix ? `${prefix}-${shot.duelistId}` : null;
}

/** The reaction clip a banter moment should show, if one is on disk. */
export function reactionKeyFor(situation, duelistId) {
  if (!duelistId) return null;
  const mood = ["low", "losing", "hurt", "vsBigHit", "vsDirect"].includes(situation) ? "shocked"
    : ["winning", "ace", "fusion", "trap", "bigHit", "direct", "vsAce", "vsFusion", "vsTrap"].includes(situation) ? "confident"
      : ["open"].includes(situation) ? "open"
        : ["win"].includes(situation) ? "win"
          : ["lose"].includes(situation) ? "lose"
            : "determined";
  return `${mood === "open" || mood === "win" || mood === "lose" ? mood : `react-${mood}`}-${duelistId}`;
}

/**
 * A stable key plus a prompt general enough that one clip serves every monster
 * sharing that archetype. Returns null when a shot has no reusable form.
 */
export function archetypeFor(shot) {
  if (!shot?.kind) return null;
  // A shot may name its own clip -- title cards do, since they are authored
  // rather than derived from cards on the field.
  if (shot.clipKey) return { key: shot.clipKey, prompt: shot.prompt, seconds: shot.seconds, title: true };
  const look = (a) => ATTRIBUTE_LOOK[a] ?? ATTRIBUTE_LOOK.DARK;
  const where = `in ${NEUTRAL_ARENA}`;

  if (!MONSTER_KINDS.has(shot.kind)) {
    const character = duelistKeyFor(shot);
    if (character) return { key: character, prompt: shot.prompt, seconds: shot.seconds, character: true };

    const scene = shot.kind === "trap"
      ? `a huge holographic trap card flips face-up and floods the arena with hostile red light, ${where}`
      : shot.kind === "spell"
        ? `a huge holographic spell card flips face-up and washes the arena in green light, ${where}`
        : shot.kind === "finish"
          ? `the holograms collapse and the arena lights fall as a duel ends, ${where}`
          : null;
    return scene ? { key: shot.kind, prompt: assemble(scene), seconds: shot.seconds } : null;
  }

  const creature = creatureOf(shot);
  if (!creature) return null;
  const { attribute, family } = creature;
  const body = FAMILY_LOOK[family];

  // A key must fully determine its prompt, so anything the key leaves out --
  // the creature family here -- must stay out of the prompt as well.
  if (shot.kind === "clash") {
    return {
      key: `clash-${attribute}`,
      seconds: shot.seconds,
      prompt: assemble(`two enormous monster holograms collide head-on in a shockwave of `
        + `${look(attribute)}, ${where}`),
    };
  }
  if (shot.kind === "direct") {
    return {
      key: `direct-${attribute}`,
      seconds: shot.seconds,
      prompt: assemble(`a monster hologram charges past an empty field and slams into a duelist's `
        + `holographic barrier, ${look(attribute)} exploding outward, ${where}`),
    };
  }
  if (shot.kind === "fusion") {
    return {
      key: `fusion-${attribute}`,
      seconds: shot.seconds,
      prompt: assemble(`two monster holograms spiral together into a blazing fusion vortex and a `
        + `single larger creature erupts from it, ${look(attribute)}, ${where}`),
    };
  }
  return {
    key: `summon-${attribute}-${family}`,
    seconds: shot.seconds,
    prompt: assemble(`${body}, erupting upward as a giant hologram from a duelist's forearm Duel `
      + `Disk, ${look(attribute)}, ${where}`),
  };
}

/** Every archetype the four decks can actually produce — the whole clip library. */
export function libraryFor(duelists) {
  const keys = new Map();
  const add = (entry) => { if (entry && !keys.has(entry.key)) keys.set(entry.key, entry); };

  for (const duelist of duelists) {
    for (const id of [...duelist.deck, ...duelist.extra]) {
      const card = CARDS[id];
      if (!card || card.kind !== "monster" || card.token) continue;
      const shot = { kind: "summon", title: card.name, seconds: 6, event: { card: card.name } };
      add(archetypeFor(shot));
      add(archetypeFor({ ...shot, kind: "fusion" }));
      add(archetypeFor({ ...shot, kind: "clash", event: { attacker: card.name } }));
      add(archetypeFor({ ...shot, kind: "direct" }));
    }
  }
  for (const kind of ["trap", "spell", "finish"]) add(archetypeFor({ kind, seconds: 6 }));
  return [...keys.values()];
}
