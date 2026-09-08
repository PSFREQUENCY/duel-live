// The world bible. One source of truth for what a Duel Live clip looks like,
// shared by the runtime prompt builder and the hand-generated shot sheets --
// so a clip made by an API and a clip made by hand cut together as one show.

export const STYLE = "late-1990s cel-shaded anime, hand-inked outlines, saturated colour, "
  + "visible film grain, dramatic low camera angle, shallow depth of field, 16:9 widescreen, "
  + "no text, no subtitles, no captions, no logos, no watermark";

// Without this block a generator reads "arena" as a sports stadium and puts the
// monster on a football pitch. It has to travel with every prompt.
export const WORLD = "A holographic trading-card duel. Each duelist wears a metal Duel Disk "
  + "clamped to their left forearm: a curved silver-and-grey blade with five illuminated card "
  + "slots swung out into a wide arc, and a round glowing life-point counter set into the "
  + "housing. Cards are slotted in by hand. Monsters appear as huge translucent light-emitting "
  + "holograms projected upward from the disk, with visible scan lines and flickering edges";

export const ARENAS = {
  rooftop: "a rain-slicked skyscraper rooftop duel arena at night, city lights far below, "
    + "holographic projector pylons humming at the edges",
  cliff: "a torch-lit stone duel arena on a sea cliff at dusk, banners snapping in the wind, "
    + "waves breaking far below",
};

// Trademarked names are deliberately absent: generators filter them, and a pure
// physical description gives a more reliable likeness anyway.
export const LOOKS = {
  yugi: {
    name: "Yugi Muto", arena: "rooftop",
    look: "a slight teenage boy with dramatic star-shaped black hair tipped with magenta and "
      + "blond bangs falling over his forehead, wearing a dark blue school jacket with a high "
      + "collar and a large golden inverted-pyramid pendant on a chain around his neck",
  },
  kaiba: {
    name: "Seto Kaiba", arena: "rooftop",
    look: "a tall, sharp-featured young man with short dark brown hair and cold pale blue eyes, "
      + "wearing a long white high-collared coat whose collar flares up past his jaw, sleeves "
      + "buckled at the wrists",
  },
  joey: {
    name: "Joey Wheeler", arena: "cliff",
    look: "a scruffy blond teenage boy with shaggy hair falling into his eyes, wearing an "
      + "unzipped green jacket over a white shirt, restless and loose-limbed",
  },
  mai: {
    name: "Mai Valentine", arena: "cliff",
    look: "a confident blonde woman with long wavy hair past her shoulders, wearing a sleeveless "
      + "violet jacket and long fingerless gloves, one hip cocked",
  },
};

// Monster clips are shared between both duels, so they get a neutral arena --
// a rooftop-specific clip would look wrong on the cliff and break the reuse.
export const NEUTRAL_ARENA = "a floodlit open-air duel arena at night, holographic projector "
  + "pylons at its edges, empty stands beyond";

// Title cards sit outside the duel, so they get their own register: a modern
// 3D broadcast look rather than the hand-inked cel animation of the match.
export const TITLE_STYLE = "AAA 3D cinematic animation, Unreal Engine quality, physically based "
  + "rendering, volumetric light shafts, chromatic aberration, brushed chrome and carbon fibre, "
  + "glowing cyan and magenta holographic interface panels, deep blacks, anamorphic lens flares, "
  + "shallow depth of field, motion blur, 16:9 widescreen, no text, no letters, no logos, "
  + "no watermark";

/** Every in-duel prompt in the project is assembled through here. */
export const assemble = (subject) => `${STYLE}. ${WORLD}. ${subject}.`;

/** Title cards skip the world block; they are not shot inside a duel. */
export const assembleTitle = (subject) => `${TITLE_STYLE}. ${subject}.`;

export const arenaFor = (duelistId) => ARENAS[LOOKS[duelistId]?.arena ?? "rooftop"];
