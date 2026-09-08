// Archetype clips. Generating a fresh video for every unique shot means nothing
// is ever reused and a small budget buys a handful of moments. Keying clips by
// what a viewer actually reads instead -- kind, attribute, creature family --
// collapses the whole game onto a fixed library that is generated once and then
// replayed for free forever.

import { CARDS } from "../cards/index.js";

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

const STYLE = "cel-shaded late-90s anime, heavy ink outlines, holographic duel arena, "
  + "dramatic low camera angle, 16:9, no text, no watermark, no logos, no on-screen letters";

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

/**
 * A stable key plus a prompt general enough that one clip serves every monster
 * sharing that archetype. Returns null when a shot has no reusable form.
 */
export function archetypeFor(shot) {
  if (!shot?.kind) return null;
  const look = (a) => ATTRIBUTE_LOOK[a] ?? ATTRIBUTE_LOOK.DARK;

  if (!MONSTER_KINDS.has(shot.kind)) {
    const scene = shot.kind === "trap"
      ? "a huge holographic trap card flips face-up and floods the arena with hostile red light"
      : shot.kind === "spell"
        ? "a huge holographic spell card flips face-up and washes the arena in green light"
        : shot.kind === "finish"
          ? "the holograms collapse and the arena lights fall as a duel ends"
          : null;
    return scene ? { key: shot.kind, prompt: `${scene}; ${STYLE}`, seconds: shot.seconds } : null;
  }

  const creature = creatureOf(shot);
  if (!creature) return null;
  const { attribute, family } = creature;
  const body = FAMILY_LOOK[family];

  if (shot.kind === "clash") {
    return {
      key: `clash-${attribute}`,
      prompt: `two duel monsters collide head-on in a shockwave of ${look(attribute)}; ${STYLE}`,
      seconds: shot.seconds,
    };
  }
  // A key must fully determine its prompt, so anything the key leaves out --
  // the creature family here -- must stay out of the prompt as well.
  if (shot.kind === "direct") {
    return {
      key: `direct-${attribute}`,
      prompt: `a duel monster charges past an empty field and slams into a duelist's holographic `
        + `barrier, ${look(attribute)} exploding outward; ${STYLE}`,
      seconds: shot.seconds,
    };
  }
  if (shot.kind === "fusion") {
    return {
      key: `fusion-${attribute}`,
      prompt: `two duel monsters spiral together into a blazing fusion vortex and a single larger `
        + `creature erupts from it, ${look(attribute)}; ${STYLE}`,
      seconds: shot.seconds,
    };
  }
  return {
    key: `summon-${attribute}-${family}`,
    prompt: `${body} slams down onto the field, ${look(attribute)}; ${STYLE}`,
    seconds: shot.seconds,
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
