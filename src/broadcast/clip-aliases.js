// Which hand-made clip stands in for a grammar key.
//
// The grammar names shots by what they read as -- `summon.DARK.dragon`,
// `react.kaiba.pressed` -- because that is what makes the library bounded. The
// clips that actually exist were shot to a different scheme, per duelist:
// `play kaiba summon`, `react kaiba confident`. Neither naming is wrong, and
// nothing matched: all 64 keys fell through to the procedural canvas while 21
// real clips sat unused on disk.
//
// This is the join. A key resolves to the best clip that exists for it, and
// falls back to its own name so a clip generated later is picked up without
// changing anything here.

// The acting duelist, which the key deliberately leaves out: one summon clip
// per attribute and family is the whole point of the key scheme, but the clips
// on disk are of a particular person doing it.
const byActor = (pattern) => (actor) => (actor ? pattern.replace("{actor}", actor) : null);

const ALIASES = {
  // Somebody plays a monster.
  summon: byActor("play-{actor}-summon"),
  tribute: byActor("play-{actor}-summon"),
  fusion: byActor("play-{actor}-summon"),

  // Somebody plays a card face-up.
  spell: byActor("play-{actor}-activate"),
  trap: byActor("play-{actor}-activate"),

  // Something takes damage. One impact clip covers the whole family.
  direct: () => "lp-damage",
  impact: () => "lp-damage",
  clash: () => "lp-damage",

  finish: () => "outro",
};

// A reveal is of a specific kind of card, so it splits before it aliases.
const REVEALS = {
  spell: byActor("play-{actor}-activate"),
  trap: byActor("play-{actor}-activate"),
  monster: byActor("play-{actor}-summon"),
  facedown: byActor("play-{actor}-summon"),
};

// The duelist plates. `steady` has a real clip for three of the four; the other
// registers reuse the same performance rather than showing nothing.
const REACTIONS = {
  steady: (who) => `react-${who}-confident`,
  pressed: (who) => `react-${who}-confident`,
  broken: (who) => `open-${who}`,
};

const ARENAS = { wide: "arena-rooftop", low: "arena-cliff", overhead: "arena-rooftop" };

/**
 * Every clip key worth trying for a grammar key, best first.
 *
 * The key's own name comes first: a clip generated for it exactly is always
 * better than a stand-in, so adding one later needs no change here.
 */
export function clipCandidates(key, { actor } = {}) {
  const [kind, a, b] = String(key).split(".");
  const own = String(key).toLowerCase().replace(/\./g, "-");
  const out = [own];

  const add = (value) => { if (value && !out.includes(value)) out.push(value); };

  if (kind === "react") add(REACTIONS[b]?.(a));
  else if (kind === "idle") add(`open-${a}`);
  else if (kind === "arena") add(ARENAS[a]);
  else if (kind === "reveal") add(REVEALS[a]?.(actor));
  else add(ALIASES[kind]?.(actor));

  // A duelist plate is a decent last resort for anything about a person.
  if (kind === "react" || kind === "idle") add(`open-${a}`);
  return out;
}

/** The first candidate that is actually on disk, or the key's own name. */
export function resolveClipKey(key, { actor, hasClip } = {}) {
  const candidates = clipCandidates(key, { actor });
  if (!hasClip) return candidates[0];
  return candidates.find((candidate) => hasClip(candidate)) ?? candidates[0];
}
