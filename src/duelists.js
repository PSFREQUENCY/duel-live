// Duelist profiles: deck list, extra deck, AI temperament, and the voice lines
// the cinema layer speaks. Lines are original paraphrase, not show transcripts.

const x = (id, n) => Array.from({ length: n }, () => id);

export const DUELISTS = {
  yugi: {
    id: "yugi",
    name: "Yugi Muto",
    title: "King of Games",
    accent: "#f4c531",
    aura: "linear-gradient(160deg,#3b2a6d,#120a24)",
    portrait: "a spiky black-and-magenta haired teenage duelist in a blue school jacket with a golden pyramid pendant",
    ace: "darkMagician",
    strategy: "control",
    lines: {
      open: "My move. I believe in the heart of the cards.",
      summon: "I summon {card}!",
      attack: "{card}, attack!",
      ace: "Dark Magic Attack!",
      trap: "I was waiting for that. Reveal: {card}!",
      hurt: "I can still turn this around.",
      win: "It's over. And the cards never lied.",
      lose: "You duelled well. I'll be back.",
    },
    deck: [
      ...x("darkMagician", 2), "darkMagicianGirl", ...x("kuriboh", 2), ...x("celticGuardian", 3),
      ...x("beaverWarrior", 2), "gaia", "curseOfDragon", "summonedSkull", "busterBlader",
      ...x("bigShieldGardna", 2), "gazelle", "berfomet", "magnetValkyrion",
      ...x("polymerization", 2), "monsterReborn", "darkHole", "swordsOfRevealingLight",
      ...x("magicalHats", 2), "brainControl", "potOfGreed", "gracefulCharity", "darkMagicAttack",
      ...x("mirrorForce", 2), ...x("magicCylinder", 2), ...x("spellbindingCircle", 2),
      ...x("waboku", 2), "trapHole", "negateAttack",
    ],
    extra: ["gaiaDragonChampion", "chimera"],
  },

  kaiba: {
    id: "kaiba",
    name: "Seto Kaiba",
    title: "CEO of KaibaCorp",
    accent: "#4fc9f0",
    aura: "linear-gradient(160deg,#0d3550,#04121c)",
    portrait: "a tall stern brown-haired duelist in a white high-collared coat with a metal duel gauntlet",
    ace: "blueEyes",
    strategy: "aggro",
    lines: {
      open: "You're wasting my time. Let's finish this.",
      summon: "I summon {card}!",
      attack: "{card}, wipe it out!",
      ace: "Burst Stream of Destruction!",
      trap: "Predictable. Activate {card}!",
      hurt: "A lucky move. It changes nothing.",
      win: "This is what real duelling looks like.",
      lose: "Impossible. This isn't finished.",
    },
    deck: [
      ...x("blueEyes", 3), ...x("lordOfD", 2), ...x("battleOx", 3), "saggi",
      ...x("vorseRaider", 2), ...x("kaiserSeahorse", 2), ...x("laJinn", 2),
      ...x("rudeKaiser", 2), ...x("ryuKishin", 3),
      ...x("polymerization", 2), ...x("fluteOfSummoningDragon", 2), "monsterReborn",
      "darkHole", ...x("shrink", 2), "despell", "potOfGreed",
      "crushCardVirus", ...x("ringOfDestruction", 2), ...x("negateAttack", 2),
      ...x("mirrorForce", 2), ...x("trapHole", 2), "waboku",
    ],
    extra: ["blueEyesUltimate"],
  },

  joey: {
    id: "joey",
    name: "Joey Wheeler",
    title: "The Underdog",
    accent: "#f08a3c",
    aura: "linear-gradient(160deg,#5c3410,#1c0e04)",
    portrait: "a scruffy blond teenage duelist in a green jacket and white shirt, grinning",
    ace: "redEyes",
    strategy: "swingy",
    lines: {
      open: "Alright, let's do this! Joey Wheeler's on the field!",
      summon: "Get out there, {card}!",
      attack: "{card}, let 'em have it!",
      ace: "Inferno Fire Blast!",
      trap: "Ha! Walked right into it. {card}, go!",
      hurt: "Ow. Okay. That one hurt.",
      win: "Who's the underdog now?!",
      lose: "Aw, come on! One more round!",
    },
    deck: [
      "redEyes", ...x("babyDragon", 2), ...x("timeWizard", 2), ...x("rocketWarrior", 2),
      ...x("pantherWarrior", 2), ...x("alligatorsSword", 2), ...x("littleWinguard", 2),
      ...x("gearfried", 2), "axeRaider", ...x("flameManipulator", 2), ...x("masaki", 2),
      "summonedSkull",
      ...x("polymerization", 3), ...x("scapegoat", 2), "shieldAndSword", "giantTrunade",
      ...x("salamandra", 2), "monsterReborn", "potOfGreed",
      ...x("gracefulDice", 2), ...x("skullDice", 2), ...x("kunaiWithChain", 2), "trapHole", "waboku",
    ],
    extra: ["flameSwordsman", "thousandDragon", "blackSkullDragon"],
  },

  mai: {
    id: "mai",
    name: "Mai Valentine",
    title: "Harpie Queen",
    accent: "#e05a9c",
    aura: "linear-gradient(160deg,#5a1440,#1c0616)",
    portrait: "a confident blonde duelist in a purple jacket with a violet duel disk",
    ace: "harpiesPetDragon",
    strategy: "tempo",
    lines: {
      open: "Sit tight, hon. This won't take long.",
      summon: "Say hello to {card}.",
      attack: "{card}, tear it apart!",
      ace: "Feel the wings of the Harpie Queen!",
      trap: "Too slow, sweetheart. {card}!",
      hurt: "Cute. Try that again.",
      win: "Told you. Better luck next time.",
      lose: "You actually got me. Not bad.",
    },
    deck: [
      ...x("harpieLady", 3), ...x("cyberHarpie", 2), "harpieSisters", "harpiesPetDragon",
      ...x("harpieGirl", 2), ...x("amazonessSwordsWoman", 2), ...x("dunames", 2),
      ...x("birdface", 3), ...x("littleWinguard", 2),
      ...x("elegantEgotist", 2), ...x("cyberShield", 2), ...x("roseWhip", 2),
      "featherDuster", "monsterReborn", "potOfGreed", "gracefulCharity", "darkHole",
      ...x("mirrorWall", 2), ...x("gravityBind", 2), ...x("dustTornado", 2),
      ...x("mirrorForce", 2), ...x("negateAttack", 2), "waboku",
    ],
    extra: [],
  },
};

export const MATCHUPS = {
  "yugi-kaiba": {
    id: "yugi-kaiba",
    name: "Duel I — Battle City Finals",
    player: "yugi",
    opponent: "kaiba",
    lifePoints: 8000,
    arena: "a rain-slicked skyscraper rooftop duel arena at night, city lights below, holographic projectors humming",
    tagline: "Dark Magician against three Blue-Eyes. The rivalry that defined the game.",
  },
  "joey-mai": {
    id: "joey-mai",
    name: "Duel II — Duelist Kingdom Semifinal",
    player: "joey",
    opponent: "mai",
    lifePoints: 8000,
    arena: "a torch-lit stone duel arena on a cliff above the sea at dusk, banners snapping in the wind",
    tagline: "The underdog's dice against the Harpie Queen's wings.",
  },
};

export const getDuelist = (id) => DUELISTS[id];
export const getMatchup = (id) => MATCHUPS[id];
