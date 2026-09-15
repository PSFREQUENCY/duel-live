// Prompts for the live grammar's keys.
//
// Four rules do most of the work here, and they are all counter-intuitive
// enough to be worth stating:
//
//   1. The reference budget is three -- arena, duelist, monster -- and the
//      arena is the one that must never be dropped. It is the only asset in
//      every shot, so omitting it is what makes a shot list change venue on
//      every cut. It is named in the block AND inline in the sentence, because
//      a header-only mention frequently produces a shot where it is simply
//      absent.
//   2. Describe motion, not material. A list of what a creature is made of
//      produces a prop; a description of how it moves produces a creature.
//      Give it a head -- a denser, brighter leading element that arrives first
//      with the rest following late -- or it reads as material.
//   3. Light dies. Three-dimensionality comes from naming a source with a
//      position and then saying where the darkness is. "Dramatic lighting" is
//      an adjective and gets ignored.
//   4. Every clip carries `music, score, soundtrack` as a negative. The score
//      is one continuous generated bed; a clip that arrives with its own music
//      destroys the continuity at every single cut.

import { ARENAS, LOOKS, NEUTRAL_ARENA, STYLE, WORLD, assemble } from "../cinema/world.js";

// Carried by every clip in the set, not just the ones that seem to need it.
export const NEGATIVE = [
  "music", "score", "soundtrack", "singing",
  // Models default to a hard low key on anyone described as powerful, which
  // turns every duelist into a villain by the third shot.
  "harsh underlighting on faces", "sinister expression", "villainous",
  // Energy in this world is light, not combustion.
  "fire", "smoke", "explosion debris",
  "text", "subtitles", "watermark", "logo", "extra fingers", "deformed hands",
].join(", ");

const MOTION = {
  dragon: "its head lunges first on a long neck and the wings snap open a half-second later, "
    + "the tail still catching up",
  warrior: "the weapon arm drives forward first, the shoulders and cloak arriving behind it",
  spellcaster: "the staff hand rises first and the robe lifts a beat afterwards, hem last",
  fiend: "the horned head snaps around first, the shoulders rolling after it",
  beast: "the head and forelimbs commit first, the hindquarters gathering and releasing late",
  winged: "the head leads the bank and the wings sweep through a half-beat behind",
  other: "the leading mass commits first and the bulk of the body follows late",
};

const LIGHT = {
  DARK: "one cold violet source low in frame under the creature; everything above the shoulders "
    + "falls to near-black",
  LIGHT: "one hard white source low and front; the background falls away to black behind it",
  FIRE: "one deep orange source below; the upper body is lost in shadow",
  WIND: "one pale green source raking across from the left; the right side goes dark",
  EARTH: "one amber source low and behind; the front of the body is in shadow",
  WATER: "one cold blue source below the waterline; everything above it dims to black",
};

const REGISTER = {
  steady: "level and unimpressed, eyes front, jaw set",
  pressed: "leaning back a fraction, weight shifted, brow tightening",
  broken: "eyes wide, head drawn back, the composure gone",
};

const dot = (key) => key.split(".");

// The duelist plates are a different job from the shots they appear in: flat,
// even, front-on. Light a reference plate dramatically and the model bakes
// those shadows into the character, and then every later shot carries a shadow
// that does not match its scene.
function plate(duelistId, register) {
  const look = LOOKS[duelistId];
  const arena = ARENAS[look.arena];
  return `${STYLE}. ${WORLD}. Reference plate: ${look.look}, standing in ${arena}, framed from `
    + `the chest up, facing camera three-quarters on. Flat even frontal lighting, no cast shadows `
    + `on the face. Expression ${REGISTER[register]}. The arena is visible but soft behind them.`;
}

const BUILDERS = {
  summon([, attribute, family]) {
    return assemble(`A vast translucent hologram erupts upward out of a duelist's forearm Duel `
      + `Disk in ${NEUTRAL_ARENA}: ${MOTION[family] ?? MOTION.other}. Its head is the densest and `
      + `brightest part of it and arrives first. Scan lines crawl across the projection and its `
      + `edges flicker and smear as the projectors strain. Lighting: ${LIGHT[attribute] ?? LIGHT.DARK}`);
  },
  fusion([, family]) {
    return assemble(`Two monster holograms spiral into one another above ${NEUTRAL_ARENA} and a `
      + `single larger creature tears out of the vortex: ${MOTION[family] ?? MOTION.other}. The `
      + `projection is unstable, edges ghosting and re-forming. Lighting: one hard white source at `
      + `the vortex core, everything outside it falling to black`);
  },
  clash([, family]) {
    return assemble(`Two enormous monster holograms collide head-on above ${NEUTRAL_ARENA}: `
      + `${MOTION[family] ?? MOTION.other}, meeting the other mid-charge. Both projections tear `
      + `and re-knit at the point of contact. Lighting: one blown-out source at the impact, the `
      + `arena beyond it in darkness`);
  },
  direct([, family]) {
    return assemble(`A monster hologram charges an empty field in ${NEUTRAL_ARENA} and slams into `
      + `a duelist's shield of light: ${MOTION[family] ?? MOTION.other}. The barrier flares and `
      + `splits. Lighting: one white source at the barrier, the duelist behind it a silhouette`);
  },
  reveal([, what]) {
    const face = what === "facedown" ? "face-down and stays sealed, edge-lit only"
      : what === "trap" ? "face-up and floods the frame with hostile red"
        : what === "spell" ? "face-up and washes the frame with green"
          : "face-up and throws a shaft of white upward";
    return assemble(`Extreme close-up on a single huge holographic card hanging in the air over `
      + `${NEUTRAL_ARENA}; it rotates and locks ${face}. The card's surface carries scan lines `
      + `and a flickering edge. Lighting: the card is the only source; everything around it black`);
  },
  impact([, weight]) {
    const force = weight === "heavy" ? "The whole frame shakes and the projection whites out"
      : "A short sharp flare, the frame steady";
    return assemble(`A burst of light at the point where two holograms meet over ${NEUTRAL_ARENA}. `
      + `${force}. Particles of broken projection scatter and wink out. Lighting: one source at the `
      + `impact, falling to black within a body's width`);
  },
  tribute() {
    return assemble(`Wide shot of ${NEUTRAL_ARENA}: two monster holograms on the field dissolve `
      + `upward into columns of light, the light gathering into one point above the duel disk. The `
      + `duelist is a small silhouette at the frame edge. Lighting: the rising columns are the only `
      + `source, the arena floor grid faintly lit beneath them`);
  },
  arena([, angle]) {
    const camera = angle === "wide" ? "A slow wide drift across"
      : angle === "low" ? "A low angle looking up across"
        : "A slow overhead push down onto";
    return assemble(`${camera} ${NEUTRAL_ARENA}. The arena is completely deserted: no people, no `
      + `characters, no figures, no faces, no monsters, nobody standing anywhere in frame. `
      + `Architecture only -- projector pylons idling, the floor grid pulsing, empty stands. `
      + `Lighting: the floor grid from below, the stands beyond it in darkness`);
  },
  phase([, which]) {
    const beat = which === "battle"
      ? "the arena floor grid surges brighter and the projector pylons spin up"
      : "the floor grid dims and the pylons wind down";
    return assemble(`A short stinger over ${NEUTRAL_ARENA}: ${beat}. Completely deserted: no `
      + `people, no characters, no figures, no faces, no monsters anywhere in frame. `
      + `Lighting: the grid is the only source and it falls away to black at the frame edges`);
  },
  react([, duelistId, register]) { return plate(duelistId, register); },
  idle([, duelistId]) {
    const look = LOOKS[duelistId];
    return `${STYLE}. ${WORLD}. ${look.look}, in ${ARENAS[look.arena]}, seen from the chest up, `
      + `hands resting over the deck slot of the Duel Disk on their forearm. They breathe and `
      + `shift their weight very slightly; nothing else moves. Flat even frontal lighting. `
      + `Loopable, no cuts.`;
  },
  trap() {
    return assemble(`A huge holographic trap card flips face-up over ${NEUTRAL_ARENA} and floods `
      + `the arena with hostile red light that rakes across the floor grid. Lighting: the card is `
      + `the only source, everything outside its throw is black`);
  },
  spell() {
    return assemble(`A huge holographic spell card flips face-up over ${NEUTRAL_ARENA} and washes `
      + `the floor grid in green light. Lighting: the card is the only source, falling off fast`);
  },
  // The one held direct gaze in the whole duel. Eyes are the uncanny epicentre,
  // so this is the only shot in the set allowed to look down the lens.
  finish() {
    return assemble(`The holograms over ${NEUTRAL_ARENA} collapse into drifting particles and the `
      + `arena lights fall in sequence. A duelist stands in the dark, lit from below by their own `
      + `Duel Disk, and holds a level look straight down the lens. Lighting: the disk is the only `
      + `source; everything above the collarbone falls to near-black`);
  },
};

/** The prompt for a grammar key, or null if the key is not one we film. */
export function promptFor(key) {
  const parts = dot(key);
  const build = BUILDERS[parts[0]];
  return build ? build(parts) : null;
}

/** Everything the generator needs for one key. */
export function shotRequestFor(key, { tier, seconds = 6 } = {}) {
  const prompt = promptFor(key);
  if (!prompt) return null;
  const isPlate = /^(react|idle|arena|phase)\./.test(key);
  return {
    key,
    prompt,
    negative: NEGATIVE,
    tier: tier ?? (isPlate ? "still" : "video"),
    seconds,
  };
}
