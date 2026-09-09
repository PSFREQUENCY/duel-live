// The Damage Step.
//
// A battle is not one moment. It is five sub-steps, and which sub-step you are
// in decides what may be activated. Modelling that is the difference between a
// duel simulator and a coin flip with animations: it is what stops a trap
// retroactively saving a monster that has already been destroyed.

export const BATTLE_STEPS = ["battle_start", "battle_step", "damage_step", "battle_end"];

export const DAMAGE_SUB_STEPS = [
  "ds_start",            // target locked; a face-down target is flipped
  "ds_before_damage",    // flip effects resolve
  "ds_calculation",      // ATK vs ATK or ATK vs DEF is computed
  "ds_after_damage",     // battle damage applied, destruction determined
  "ds_end",              // destroyed monsters are sent to the graveyard
];

/** Every timing a card may declare, in the order a turn passes through them. */
export const TIMINGS = [
  "draw", "standby", "main1", "battle_start", "battle_step",
  ...DAMAGE_SUB_STEPS, "battle_end", "main2", "end",
];

// What a card may be activated during when it does not say otherwise. A Trap
// answers attacks and summons; a Spell is a Main Phase card.
const DEFAULT_TIMINGS = {
  trap: ["battle_step", "ds_start", "ds_before_damage", "ds_calculation", "main1", "main2"],
  spell: ["main1", "main2"],
  quick: ["battle_step", "ds_start", "ds_before_damage", "ds_calculation", "main1", "main2"],
};

/** The timings a card declares, or the default for its kind. */
export function timingsFor(card) {
  if (card?.timings) return card.timings;
  if (card?.kind === "trap") return DEFAULT_TIMINGS.trap;
  if (card?.kind === "spell") {
    return card.sub === "quick" ? DEFAULT_TIMINGS.quick : DEFAULT_TIMINGS.spell;
  }
  return DEFAULT_TIMINGS.spell;
}

/**
 * May this card be activated at this timing? Read from the card's own data
 * rather than hardcoded, so a card that is legal only during damage
 * calculation says so and the engine simply obeys.
 */
export function canActivateAt(card, timing) {
  if (!timing) return true;
  return timingsFor(card).includes(timing);
}

/** The sub-step after this one, or null at the end of the Damage Step. */
export function nextSubStep(subStep) {
  const at = DAMAGE_SUB_STEPS.indexOf(subStep);
  if (at < 0 || at === DAMAGE_SUB_STEPS.length - 1) return null;
  return DAMAGE_SUB_STEPS[at + 1];
}

export const isDamageSubStep = (timing) => DAMAGE_SUB_STEPS.includes(timing);

/** Only mandatory triggers may act once damage has been dealt. */
export const allowsOptionalResponse = (subStep) =>
  subStep === "ds_start" || subStep === "ds_before_damage" || subStep === "ds_calculation";

export const SUB_STEP_LABELS = {
  ds_start: "Start of Damage Step",
  ds_before_damage: "Before damage calculation",
  ds_calculation: "Damage calculation",
  ds_after_damage: "After damage",
  ds_end: "End of Damage Step",
};
