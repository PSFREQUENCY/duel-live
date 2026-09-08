// Trap cards. `trigger` tells the engine when to offer the card; `effect.op` is
// resolved by src/duel-effects.js exactly like a Spell.

const t = (id, name, sub, trigger, text, effect, art) => ({
  id, name, kind: "trap", sub, trigger, text, effect, art,
});

export const TRAPS = {
  mirrorForce: t("mirrorForce", "Mirror Force", "normal", "onAttack",
    "Destroy all Attack Position monsters your opponent controls.",
    { op: "destroyAttackers" },
    "a mirrored barrier splintering an incoming beam back across the field"),

  magicCylinder: t("magicCylinder", "Magic Cylinder", "normal", "onAttack",
    "Negate the attack and inflict damage equal to the attacking monster's ATK.",
    { op: "reflectAttack" },
    "two ornate cylinders swallowing a blast and firing it back"),

  spellbindingCircle: t("spellbindingCircle", "Spellbinding Circle", "continuous", "onAttack",
    "The attacking monster cannot attack and loses 700 ATK.",
    { op: "bindMonster", atk: -700 },
    "a glowing yellow rune-circle clamping around a monster's feet"),

  waboku: t("waboku", "Waboku", "normal", "onAttack",
    "Take no battle damage this turn; your monsters are not destroyed by battle.",
    { op: "negateBattle" },
    "three blue-robed acolytes raising a shimmering ward"),

  // -- Kaiba ------------------------------------------------------------
  crushCardVirus: t("crushCardVirus", "Crush Card Virus", "normal", "onSummon",
    "Tribute a DARK monster with 1000 or less ATK: destroy every monster with 1500 or more ATK your opponent controls or draws for 3 turns.",
    { op: "crushVirus", threshold: 1500, turns: 3 },
    "a swarm of black viral cubes eating through a monster's body"),

  ringOfDestruction: t("ringOfDestruction", "Ring of Destruction", "normal", "onAttack",
    "Destroy 1 face-up monster and inflict its ATK as damage to both players.",
    { op: "ringOfDestruction" },
    "a spiked collar of grenades snapping shut and detonating"),

  negateAttack: t("negateAttack", "Negate Attack", "counter", "onAttack",
    "Negate the attack and end the Battle Phase.",
    { op: "negateBattle", endBattlePhase: true },
    "a swirling vortex shield absorbing a charging monster"),

  // -- Joey -------------------------------------------------------------
  gracefulDice: t("gracefulDice", "Graceful Dice", "normal", "onAttack",
    "Roll a die: your monsters gain ATK equal to the result x 100 this turn.",
    { op: "diceBuff", side: "self", per: 100 },
    "a glowing white die tumbling in mid-air over a battlefield"),

  skullDice: t("skullDice", "Skull Dice", "normal", "onAttack",
    "Roll a die: your opponent's monsters lose ATK equal to the result x 100 this turn.",
    { op: "diceBuff", side: "foe", per: -100 },
    "a black skull-faced die clattering down and cracking the ground"),

  kunaiWithChain: t("kunaiWithChain", "Kunai with Chain", "normal", "onAttack",
    "Negate the attack, then equip to a monster you control which gains 500 ATK.",
    { op: "negateBattle", thenEquipAtk: 500 },
    "a weighted chain whipping out and snaring a monster mid-charge"),

  trapHole: t("trapHole", "Trap Hole", "normal", "onSummon",
    "Destroy 1 Normal Summoned monster with 1000 or more ATK.",
    { op: "destroySummoned", minAtk: 1000 },
    "the arena floor splitting open beneath a monster's feet"),

  // -- Mai --------------------------------------------------------------
  mirrorWall: t("mirrorWall", "Mirror Wall", "continuous", "onAttack",
    "Halve the ATK of every attacking monster.",
    { op: "modifyAtk", factor: 0.5, target: "attackers" },
    "a towering wall of mirrored glass rising across the field"),

  gravityBind: t("gravityBind", "Gravity Bind", "continuous", "onSummon",
    "Level 4 or higher monsters cannot attack.",
    { op: "gravityBind", minLevel: 4 },
    "rippling gravity waves pinning monsters flat to the ground"),

  dustTornado: t("dustTornado", "Dust Tornado", "normal", "onSummon",
    "Destroy 1 Spell or Trap your opponent controls.",
    { op: "destroyFoeBackrow", limit: 1 },
    "a tight dust devil ripping a card out of the ground"),
};
