// One engine event becomes several shots.
//
// The clip library was never the bottleneck -- the edit was. A summon that cuts
// reveal → monster → the other duelist's face is an episode; the same summon as
// one held clip is a log entry with a picture on it.
//
// `rank` is drop priority when the reel is behind. Rank 1 is never dropped, so
// a summon always shows the monster and a trap always shows the trap no matter
// how far behind the edit has fallen. It degrades; it never vanishes.

// Seconds are deliberate rather than uniform: a reveal is a beat, a summon is a
// moment, a finish is an ending.
const HOLD = {
  reveal: 700, tribute: 1000, summon: 1800, fusion: 2200, clash: 1600, direct: 1700,
  impact: 800, trap: 1500, spell: 1300, react: 1100, arena: 1400, phase: 900,
  idle: 4000, finish: 2600,
};

// Per §5: the tier is a property of the subject, not of the budget. Humans are
// physically present, so they are stable plates with a camera move over them --
// which is also what an anime reaction beat actually is. Monsters are
// projections, so they get video, where the model's instability reads as the
// hologram struggling to hold its shape.
const STILL_SUBJECTS = new Set(["react", "idle", "arena", "phase"]);

// Cut on motion: a shot still moving hides its own cut. A held expression has
// settled and shows every seam, so it plays out.
const SETTLES = new Set(["react", "idle", "finish"]);

const family = (key) => key.split(".")[0];

export function shotFrom(key, rank, { multiplier = 1 } = {}) {
  const kind = family(key);
  return {
    key,
    rank,
    hold: Math.round((HOLD[kind] ?? 1200) * multiplier),
    tier: STILL_SUBJECTS.has(kind) ? "still" : "video",
    tailMotion: !SETTLES.has(kind),
  };
}

// The §3.2 table, as data. Destruction deliberately gets no beat of its own --
// it is folded into clash and impact, because a separate destruction shot is
// exactly what makes an edit read as a log file rather than an episode.
export const GRAMMAR = {
  summon: [["reveal.monster", 3], ["summon.{attr}.{fam}", 1], ["react.{opp}.{mood}", 2]],
  tributeSummon: [["tribute.wide", 3], ["summon.{attr}.{fam}", 1], ["react.{opp}.pressed", 2]],
  setMonster: [["reveal.facedown", 1]],
  fusionSummon: [["reveal.spell", 4], ["fusion.{fam}", 1], ["arena.low", 3],
    ["react.{opp}.pressed", 2]],
  clash: [["react.{atk}.steady", 3], ["clash.{fam}", 1], ["impact.{weight}", 2]],
  directAttack: [["react.{def}.pressed", 3], ["direct.{fam}", 1], ["impact.heavy", 2]],
  // The money moment, and the one nobody sees coming, so it gets four beats.
  // Under pressure it degrades trap → +reveal → +the attacker's face, in that
  // order, and never to nothing.
  trapFlip: [["react.{def}.steady", 4], ["reveal.trap", 2], ["trap", 1],
    ["react.{atk}.broken", 3]],
  spell: [["reveal.spell", 2], ["spell", 1]],
  chainLink: [["reveal.{cardType}", 1]],
  phase: [["phase.{phase}", 1]],
  win: [["finish", 1], ["react.{winner}.steady", 2], ["arena.wide", 3]],
};

/** Which row of the table an engine event belongs to, or null for no shot. */
export function beatFor(event) {
  switch (event.type) {
    case "summon":
      if (event.how === "token") return null;
      if (event.how === "fusion") return "fusionSummon";
      if (event.faceDown || event.position === "set") return "setMonster";
      return event.how === "tribute" ? "tributeSummon" : "summon";
    case "set": return event.kind === "monster" ? "setMonster" : null;
    case "clash": return "clash";
    case "directAttack": return "directAttack";
    case "activate":
      if (event.chainLink > 1) return "chainLink";
      return event.reveal ? "trapFlip" : "spell";
    case "phase": return "phase";
    case "win": return "win";
    default: return null;
  }
}

/** Fills the braces. An unresolved placeholder is a bug, so it throws loudly. */
export function resolveKey(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const value = vars[name];
    if (value === undefined || value === null) {
      throw new Error(`shot-grammar: no value for {${name}} in "${template}"`);
    }
    return String(value);
  });
}

/** Every key the table can ever produce, for the coverage check. */
export function expandGrammar({ duelists, attributes, families }) {
  const keys = new Set();
  const vars = {
    attr: attributes, fam: families, opp: duelists, atk: duelists, def: duelists,
    winner: duelists, mood: ["steady", "pressed", "broken"], weight: ["light", "heavy"],
    phase: ["battle", "end"], cardType: ["monster", "spell", "trap", "facedown"],
  };
  for (const row of Object.values(GRAMMAR)) {
    for (const [template] of row) {
      let forms = [template];
      for (const [name, values] of Object.entries(vars)) {
        if (!template.includes(`{${name}}`)) continue;
        forms = forms.flatMap((form) => values.map((v) => form.replace(`{${name}}`, v)));
      }
      for (const form of forms) keys.add(form);
    }
  }
  return [...keys];
}
