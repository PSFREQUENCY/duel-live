// Spell cards. `effect.op` names are resolved by src/duel-effects.js -- adding a
// card means adding data here, not another branch in the engine.

const s = (id, name, sub, text, effect, art, extra = {}) => ({
  id, name, kind: "spell", sub, text, effect, art, ...extra,
});

export const SPELLS = {
  polymerization: s("polymerization", "Polymerization", "normal",
    "Fusion Summon 1 Fusion Monster using materials from your hand or field.",
    { op: "fusionSummon" },
    "two swirling energy vortices merging into one blinding core"),

  monsterReborn: s("monsterReborn", "Monster Reborn", "normal",
    "Special Summon 1 monster from either Graveyard.",
    { op: "revive", from: "either" },
    "a glowing ankh of golden light hovering over an open grave"),

  darkHole: s("darkHole", "Dark Hole", "normal",
    "Destroy all monsters on the field.",
    { op: "destroyAllMonsters" },
    "a black singularity tearing the arena apart, debris spiralling inward"),

  swordsOfRevealingLight: s("swordsOfRevealingLight", "Swords of Revealing Light", "continuous",
    "Your opponent cannot declare attacks for 3 turns.",
    { op: "lockAttacks", turns: 3 },
    "a cage of luminous swords raining down and pinning the field"),

  magicalHats: s("magicalHats", "Magical Hats", "quick",
    "Hide your monster among four hats; the next attack has a 1-in-4 chance to hit.",
    { op: "magicalHats" },
    "four enormous black top hats with green question marks spinning on a stage"),

  brainControl: s("brainControl", "Brain Control", "normal",
    "Pay 800 LP; take control of 1 face-up opponent monster until end of turn.",
    { op: "takeControl", cost: 800 },
    "a spectral hand of green light closing around a floating brain"),

  potOfGreed: s("potOfGreed", "Pot of Greed", "normal", "Draw 2 cards.",
    { op: "draw", count: 2 },
    "a grinning green ceramic pot overflowing with golden light"),

  gracefulCharity: s("gracefulCharity", "Graceful Charity", "normal",
    "Draw 3 cards, then discard 2.",
    { op: "draw", count: 3, discard: 2 },
    "a winged angel scattering three glowing cards"),

  darkMagicAttack: s("darkMagicAttack", "Dark Magic Attack", "normal",
    "If you control Dark Magician: destroy all Spells and Traps your opponent controls.",
    { op: "destroyFoeBackrow", requires: "darkMagician" },
    "a violet shockwave from a raised staff shattering glass sigils"),

  // -- Kaiba ------------------------------------------------------------
  fluteOfSummoningDragon: s("fluteOfSummoningDragon", "The Flute of Summoning Dragon", "normal",
    "If you control Lord of D.: Special Summon up to 2 Dragons from your hand.",
    { op: "summonFromHand", type: "Dragon", count: 2, requires: "lordOfD" },
    "an ornate ivory flute ringing out over storm clouds"),

  shrink: s("shrink", "Shrink", "quick",
    "Halve the ATK of 1 face-up monster until the end of this turn.",
    { op: "modifyAtk", factor: 0.5, target: "any" },
    "a beam of compressing light shrinking a giant beast"),

  despell: s("despell", "De-Spell", "normal",
    "Destroy 1 Spell your opponent controls.",
    { op: "destroyFoeBackrow", limit: 1, only: "spell" },
    "a cracked glass rune dissolving into sparks"),

  // -- Joey -------------------------------------------------------------
  scapegoat: s("scapegoat", "Scapegoat", "quick",
    "Special Summon 4 Sheep Tokens in Defence Position.",
    { op: "tokens", count: 4, name: "Sheep Token", atk: 0, def: 0 },
    "four pastel cartoon sheep popping into existence in a row"),

  shieldAndSword: s("shieldAndSword", "Shield & Sword", "normal",
    "Swap the ATK and DEF of all face-up monsters until the end of this turn.",
    { op: "swapAtkDef" },
    "a sword and shield crossing and inverting in a flash of white"),

  giantTrunade: s("giantTrunade", "Giant Trunade", "normal",
    "Return all Spells and Traps on the field to their owners' hands.",
    { op: "bounceAllBackrow" },
    "a green cyclone sweeping cards off the field"),

  salamandra: s("salamandra", "Salamandra", "equip",
    "Equipped FIRE monster gains 700 ATK.",
    { op: "equip", atk: 700, requires: { attribute: "FIRE" } },
    "a blade sheathed in a roaring column of orange flame"),

  // -- Mai --------------------------------------------------------------
  elegantEgotist: s("elegantEgotist", "Elegant Egotist", "normal",
    "If you control a Harpie Lady: Special Summon Harpie Lady Sisters from your Deck.",
    { op: "summonFromDeck", cardId: "harpieSisters", requires: "harpieLady" },
    "a mirror shattering as three winged silhouettes step through"),

  cyberShield: s("cyberShield", "Cyber Shield", "equip",
    "Equipped Harpie Lady gains 500 ATK.",
    { op: "equip", atk: 500, requires: { name: "Harpie Lady" } },
    "gleaming blue cybernetic armour clasping onto outstretched wings"),

  roseWhip: s("roseWhip", "Rose Whip", "equip",
    "Equipped Winged Beast gains 300 ATK and 200 DEF.",
    { op: "equip", atk: 300, def: 200, requires: { type: "Winged Beast" } },
    "a thorned rose-vine whip uncoiling with a crack"),

  featherDuster: s("featherDuster", "Harpie's Feather Duster", "normal",
    "Destroy all Spells and Traps your opponent controls.",
    { op: "destroyFoeBackrow" },
    "a storm of razor feathers shredding a row of glowing cards"),
};
