# Duel Live — v2 specification

Target repo: `PSFREQUENCY/duel-live`
Written to be handed directly to a coding agent. Work packages are ordered by
dependency. Do not skip ahead — WP3 assumes WP1 and WP2 have landed.

---

## 0. Constraints the agent must not break

These are properties the project already has. Preserve all of them.

1. **Zero runtime dependencies.** `package.json` keeps an empty `dependencies`
   block. No React, no state library, no build step for the module version.
2. **The engine owns the outcome.** `duel-engine.js` resolves the duel and emits
   events. `storyboard.js` / `free-video.js` / `player.js` only render what
   already happened. No generated text, image, or video ever feeds back into
   rules state.
3. **The cinema never holds up play.** Input unblocks within the existing budget.
   Any new UI must not introduce a blocking await on media.
4. **Effects are data.** Cards live in `src/cards/` and are resolved by the
   dispatcher in `src/duel-effects.js`. Adding a card is a data change. If a new
   rule requires an engine change, that is a signal the effect DSL is missing a
   primitive — extend the DSL, do not special-case a card.
5. **Every work package ships with tests.** The suite is currently 116 tests plus
   `smoke` and `selfplay`. Each WP below lists its required assertions. A WP is
   not done until `npm test`, `npm run smoke`, and `npm run selfplay` all pass.
6. **`npm run build` must still produce a working `duel-live.html`.** The bundle
   test guards this; keep it green.

---

## WP1 — Correct the phase machine

**Status: this is the bug that prompted the spec. Do this first.**

The current rail is `Draw · Main · Battle · End`. That collapses two real phases
out of existence and makes Main Phase 2 unreachable.

### 1.1 The correct phase order

```
DRAW → STANDBY → MAIN_1 → BATTLE → MAIN_2 → END
```

with `BATTLE` decomposed in WP2.

### 1.2 Legal transitions

Model this as an explicit table, not as `if` statements scattered through the
engine. Export it so tests can read it.

| From | To | Condition |
|---|---|---|
| `DRAW` | `STANDBY` | always (auto-advance) |
| `STANDBY` | `MAIN_1` | always (auto-advance) |
| `MAIN_1` | `BATTLE` | `canEnterBattlePhase(state)` |
| `MAIN_1` | `END` | always — this is the skip-battle path |
| `BATTLE` | `MAIN_2` | battle phase ended normally |
| `MAIN_2` | `END` | always |
| `END` | `DRAW` (opponent) | always |

**`MAIN_2` is reachable only through `BATTLE`.** There is no `MAIN_1 → MAIN_2`
edge. If a player skips the Battle Phase they go straight to the End Phase and
forfeit their second main. This is the rule that makes "attack now or set up
first" an actual decision, and right now your game does not have it.

### 1.3 First-turn rules

`canEnterBattlePhase(state)` returns false when `state.turnNumber === 1`. The
player who goes first does not conduct a Battle Phase on their opening turn.

Also: the player who goes first does not draw during their turn-1 Draw Phase.
Verify whether the engine currently does this; the opening hand should be 5 and
the first player should still hold 5 when they reach Main 1 on turn 1.

### 1.4 Rules that span both main phases

These are the ones most likely to break when Main 2 is introduced. The flags must
be **per-turn**, not per-phase.

- **Normal Summon.** One per turn, usable in `MAIN_1` *or* `MAIN_2`. The flag
  resets in the Draw Phase, not on phase change. A player who declines to summon
  in Main 1 can still summon in Main 2.
- **Set (monster).** Consumes the same once-per-turn Normal Summon.
- **Set (spell/trap).** Not limited per turn, but a Trap or Quick-Play Spell set
  this turn cannot be activated this turn. Store `setOnTurn` on the card
  instance and gate activation on `setOnTurn < state.turnNumber`.
- **Battle position change.** Once per turn per monster. Illegal if:
  the monster was summoned or set this turn; the monster has already changed
  position this turn; or the monster declared an attack this turn. Track
  `summonedOnTurn`, `positionChangedOnTurn`, `attackedOnTurn` per instance.
- **Attack declaration.** Once per monster per turn (absent an effect saying
  otherwise). Face-down monsters cannot attack. Defence-position monsters cannot
  attack.

### 1.5 End Phase

- Hand size limit of 6. If the turn player holds 7+, they discard down to 6
  before the turn passes. Present this as a real choice in the UI, not an
  automatic discard of the rightmost cards.
- Resolve any "during the End Phase" effects before the hand check.

### 1.6 Tests required

```
phase-machine.test.js
  - every state in PHASES has at least one legal outgoing transition
  - no transition exists from MAIN_1 directly to MAIN_2
  - MAIN_2 is only ever entered from BATTLE
  - turn 1: canEnterBattlePhase is false
  - turn 1: first player's hand is 5 at MAIN_1
  - turn 2 onward: canEnterBattlePhase is true when the player controls
    a face-up attack-position monster
  - normal summon declined in MAIN_1 is still available in MAIN_2
  - normal summon used in MAIN_1 is unavailable in MAIN_2
  - a trap set this turn cannot activate this turn
  - a trap set last turn can activate this turn
  - a monster summoned this turn cannot change position this turn
  - a monster that attacked this turn cannot change position this turn
  - end phase with 8 cards in hand forces exactly 2 discards
selfplay
  - across 200 duels, assert no duel ever reaches MAIN_2 without having
    passed through BATTLE in the same turn
```

---

## WP2 — Damage step sub-steps

The Battle Phase is four steps, and the Damage Step is itself five sub-steps.
This matters because it defines *when* a card can be activated, which is the
difference between a real duel simulator and a coin-flip with animations.

### 2.1 Battle Phase structure

```
BATTLE_START
  → BATTLE_STEP        (turn player may declare an attack, or end the phase)
    → DAMAGE_STEP      (only if an attack was declared)
      → BATTLE_STEP    (loop back for another attack)
  → BATTLE_END
```

The loop back to `BATTLE_STEP` is what allows multiple attacks in one Battle
Phase. Ending the phase from `BATTLE_STEP` leads to `BATTLE_END` and then
`MAIN_2`.

### 2.2 Damage Step sub-steps

| Sub-step | What happens | What may be activated |
|---|---|---|
| `DS_START` | attack target locked, face-down attack target is flipped | Counter Traps; effects that modify ATK/DEF; effects that negate activation |
| `DS_BEFORE_DAMAGE` | flip effects resolve | same set as above |
| `DS_CALCULATION` | ATK vs ATK or ATK vs DEF is computed | effects that modify ATK/DEF; negation effects |
| `DS_AFTER_DAMAGE` | battle damage applied, destruction determined | mandatory triggers; effects that trigger on damage |
| `DS_END` | destroyed monsters sent to GY | mandatory triggers only |

**Implementation note.** Model activation legality as a function
`canActivate(card, state, timing)` where `timing` is a phase/sub-step token and
the card's data declares a `timings` array. Do not hardcode. A card that is
legal only in the Damage Step declares it; the engine reads it.

### 2.3 The direct attack case

A direct attack skips the flip and comparison but still passes through the same
sub-steps, so response windows behave identically. Do not fork the code path for
direct attacks — that is how the "attack destroys a monster and *then* a trap
retroactively saves it" class of bug appears.

### 2.4 Tests required

```
damage-step.test.js
  - a battle phase with two attacks visits BATTLE_STEP twice
  - a direct attack visits all five damage sub-steps
  - an attack on a face-down monster flips it during DS_START,
    not during DS_CALCULATION
  - a card declaring only main-phase timings cannot be activated
    in any DS_ sub-step
  - battle damage is applied exactly once per attack, in DS_AFTER_DAMAGE
  - the attacker is destroyed before the defender's controller can
    respond in DS_END
```

---

## WP3 — A real chain engine

Your own README names this as the top limitation: *"Chains, priority windows, and
simultaneous trap activation are simplified: one response window per attack, one
card in it."* This is the single change that most raises the ceiling of the game.
Everything else on this list is polish by comparison.

### 3.1 Spell Speed

| Speed | Card types | May be activated |
|---|---|---|
| 1 | Normal / Continuous / Equip / Field / Ritual Spells; most monster effects | only during your own Main Phase, only when the chain is empty |
| 2 | Quick-Play Spells; most Traps; quick effects | any time you have a response window; may chain to Speed 1 or 2 |
| 3 | Counter Traps | may chain to anything, including another Counter Trap |

**The rule that makes chains work:** a card may only be chained to a card of
equal or lower Spell Speed. Speed 1 can therefore never be chained to anything —
it can only ever be Chain Link 1.

Quick-Play Spells have an extra constraint: activatable from the hand only during
your own turn; from the field (set) during either turn, but not the turn they
were set.

### 3.2 Chain structure

```js
chain = {
  links: [
    { cardId, controller, effect, targets, activatedAt: timing, spellSpeed }
  ],
  respondingPlayer,   // whose window is currently open
  passCount           // two consecutive passes closes the chain
}
```

Building:
1. A player activates a card or effect. It becomes Chain Link 1.
2. Priority passes to the opponent. They may add Chain Link 2 or pass.
3. Priority alternates. Two consecutive passes close the chain.

Resolving:
4. Resolve **last link first** (LIFO). Emit one event per link resolution so the
   storyboard can cut a shot per link.
5. After the chain fully resolves, return to the timing that opened it.

### 3.3 Simultaneous triggers (SEGOC)

When several effects would trigger at the same time, the turn player's effects go
onto the chain first, in an order they choose, then the opponent's. Implement as:

```js
function buildSimultaneousChain(triggers, turnPlayerId) {
  const mine   = triggers.filter(t => t.controller === turnPlayerId);
  const theirs = triggers.filter(t => t.controller !== turnPlayerId);
  return [...mine, ...theirs];   // player-ordered within each group
}
```

If a group has more than one trigger and the group belongs to a human player,
open an ordering prompt. If it belongs to the AI, let the AI's scorer order them.

### 3.4 API sketch

Keep this in a new `src/duel-chain.js` so `duel-engine.js` does not swell.

```js
export function openChain(state, activation)      // → state with chain started
export function respond(state, playerId, activation | PASS)
export function resolveChain(state)               // → { state, events[] }
export function legalResponses(state, playerId)   // → activation[]
```

`legalResponses` is the function the UI reads to render the response window and
the AI reads to score. Having exactly one source of legality is what stops the UI
and the AI from disagreeing about what is playable.

### 3.5 Tests required

```
chain.test.js
  - a Speed 1 spell cannot be added to a non-empty chain
  - a Counter Trap can chain to a Counter Trap
  - a Trap cannot chain to a Counter Trap
  - a 3-link chain resolves in the order 3, 2, 1
  - negating Chain Link 2 does not prevent Chain Link 1 from resolving
  - two consecutive passes close the chain
  - SEGOC: with one trigger per player, the turn player's is Link 1
  - a quick-play spell set this turn cannot be activated this turn
  - a quick-play spell cannot be activated from the hand on the
    opponent's turn
  - legalResponses returns [] when the responding player has no
    Speed 2+ options
```

---

## WP4 — Complete the board model

The screenshot shows five monster zones and five spell/trap zones per side and
nothing else. The README says fusions are implemented, which means there is an
Extra Deck the player cannot see.

### 4.1 Zones to add

| Zone | Count | Notes |
|---|---|---|
| Field Spell Zone | 1 per player | rendered to the outside of the S/T row |
| Extra Deck | 1 per player | face-down stack; own contents readable, opponent's is a count only |
| Banished | 1 per player | starts hidden, appears when first used |
| Graveyard | 1 per player | already exists as a counter — promote to a clickable pile |

Extra Monster Zones are only needed if you add Link monsters. Skip for now; leave
the zone array shaped so they can be added later without a migration.

### 4.2 Board orientation

Verify and then lock this with a test. Reading from the top of the screen down,
with the local player at the bottom:

```
opponent  spell/trap row
opponent  monster row
          ── centre line ──
you       monster row
you       spell/trap row
```

Monster rows face each other across the centre. If the current render has the
opponent's monsters on the outermost row, attacks visually cross the wrong gap
and every combat animation reads backwards.

```
board-layout.test.js
  - the DOM order of rendered rows matches OPPONENT_ST, OPPONENT_MON,
    LOCAL_MON, LOCAL_ST
  - the two monster rows are adjacent to the centre line
```

### 4.3 Zone identity

Give every zone a stable id (`p1.mon.2`, `p0.st.0`, `p1.field`). The storyboard,
the animation layer, and the targeting UI should all address zones by id, never
by array index into a flat list. This is what makes "animate a card moving from
`p0.mon.1` to `p0.gy`" a one-liner.

---

## WP5 — Interface rebuild

Ordered by how much each one raises the perceived quality per hour of work.

### 5.1 Phase rail (highest impact, smallest change)

Replace the four-button rail with a six-segment rail that reflects WP1. Each
segment has three visual states: past, current, unreachable. Main 2 renders
greyed with a lock affordance until the Battle Phase has been entered, so the
player *sees* the cost of skipping battle before they pay it.

Under the rail, show a single line naming what is legal right now — "you may
summon, set, or activate a spell" — driven by `legalActions(state)`. Never make
the player guess why a card will not respond to a click.

During the Battle Phase, the rail expands to show the sub-step. During a Damage
Step, show the sub-step as a thin progress indicator so a response window does
not appear to come from nowhere.

### 5.2 Fix the layout geometry

From the screenshot:

- The arena has roughly 180px of dead vertical space between the two monster
  rows while the hand is below the fold. Invert that: the hand is the control
  surface and must always be visible without scrolling.
- Target: the whole duel fits in a 100vh viewport at 1280×800 with no scroll.
  Arena flexes, hand is a fixed-height strip pinned to the bottom, side panel is
  fixed width.
- Collapse the centre grid decoration. It is consuming the space the board needs.
- The two filled rows read ambiguously as monsters-or-spells. Give monster zones
  and spell/trap zones distinct silhouettes: monster zones taller and portrait,
  S/T zones shorter. A player should identify a zone type peripherally without
  reading a label.

### 5.3 The card inspector

The README says hover gives name, type, live ATK/DEF and effect text. Two
upgrades:

- Make it work on click as well as hover, so it survives touch.
- Add a **why-not** line. When a card in hand is not currently playable, the
  inspector states the reason: "normal summon already used this turn", "no
  tributes available", "traps cannot be activated the turn they are set". This
  single feature teaches the rules better than a tutorial would.

### 5.4 Targeting

Attack declaration should be a drag from the attacker to the target, with a live
arc drawn during the drag, legal targets lit and illegal ones dimmed. Click-then-
click is the accessible fallback and must remain available. On release, show the
comparison — attacker ATK vs target ATK/DEF and the resulting damage — *before*
committing, with a confirm. Undo is impossible in this game; the preview is what
replaces it.

### 5.5 The chain ribbon

When WP3 lands it needs a home. A horizontal ribbon across the centre line:
Chain Link 1 on the left, each new link stacking to the right, each showing its
card art and controller colour. As the chain resolves, links light up right to
left. This is the visual that makes the game legible — the resolution order is
the most confusing thing about the real card game, and showing it is a genuine
teaching feature.

The response window gets a countdown ring rather than a bare "respond?" prompt,
with a hold-to-keep-open affordance so a player reading a card is not timed out.

### 5.6 The duel log

Current problems visible in the screenshot: `Yugi Muto draws Celtic Guardian`
appears twice in immediate succession on the same turn with only one summon
following it. Either the draw is firing twice or the log is rendering twice.
Find which — if the engine is double-drawing, deck counts are wrong and every
deck-out test is compromised.

Rebuild the log as:
- Grouped by turn, collapsible, current turn expanded.
- Three visual weights: structural (phase changes), mechanical (summons,
  attacks, destruction), and dialogue (banter, italic, already correct).
- Damage entries show the arithmetic inline: `2000 vs 1700 → 300 to Kaiba`.
- Hovering a log line highlights the zones it refers to on the board.
- Each line carries the chain link index when it came from a chain.

### 5.7 The HUD

The two player strips are inconsistent — one shows `H 1 D 29 GY 5`, the other
`D 29 GY 4 T13`. Fix:
- Both strips show the same four counters in the same order: hand, deck,
  graveyard, banished.
- Turn number moves out of the player strip into the phase rail where it belongs.
- Life point bars change colour by threshold — above 50% neutral, 25–50% amber,
  below 25% red — and animate the delta with the number counting rather than
  snapping. Show a floating `-300` at the point of impact.
- Deck and GY counters are buttons. GY already opens a reader; deck should show
  remaining count and a deck-out warning under 5.

### 5.8 Accessibility and mobile

- Every interactive zone is a real `<button>` with an `aria-label` naming the
  zone and its contents.
- The duel log is an `aria-live="polite"` region so a screen reader narrates the
  duel.
- Full keyboard play: arrow keys move zone focus, Enter selects, Escape cancels a
  targeting drag, Space skips a scene (already bound).
- `prefers-reduced-motion` disables the camera moves and cross-fades in the
  cinema layer but keeps the clips.
- Below 900px, the board rotates to a stacked layout and the side panel becomes a
  bottom sheet. Do not simply scale the desktop layout down.

---

## WP6 — Cinema layer upgrades

### 6.1 Shot vocabulary follows the chain

Once WP3 lands, the storyboard has richer material than "attack, destroy". Add
shot kinds keyed to chain events: `chain_build` (a card flipping up in response),
`chain_resolve_link`, `negate`, `counter`. A three-link chain should read as a
three-beat exchange, not one shot.

Keep the existing archetype-key discipline — kind, attribute, family — so the
library stays bounded. Adding four shot kinds against the existing key scheme
adds roughly a dozen clips, not hundreds.

### 6.2 Predictive prefetch

You already prefetch behind the current tier. Go further: at the start of a
response window, `legalResponses()` gives the set of things that might happen
next. Prefetch the archetype clip for the highest-scoring one or two. The most
dramatic moment in the game is the trap flip, and it is the moment currently most
likely to fall back a tier.

### 6.3 Clip library hygiene

`npm run clips` already reports coverage. Add a CI check that fails when a shot
kind exists in the storyboard with no clip and no procedural fallback registered.
Silent fallback is fine at runtime; silent *absence* at build time is not.

---

## WP7 — Opponent depth

The AI currently scores the engine's own legal actions with no lookahead. Two
upgrades that do not require a search tree:

1. **One-ply lookahead with a static eval.** For each legal action, apply it to a
   cloned state, run the opponent's best single response, evaluate. Eval terms:
   life point differential, board presence (sum of ATK on field, weighted by
   position), card advantage (hand + field count), and a small term for set
   cards. This alone stops the AI from attacking into an obvious trap.
2. **Temperament as eval weights, not as a script.** The README says each duelist
   plays their own temperament. Express that as a weight vector on the eval terms
   — an aggressive duelist weights life point differential high and card
   advantage low. This keeps the personality while letting the search do the
   work.

Add a bluff term: setting a spell face-down when it is not a trap has real value
against a lookahead opponent, and modelling that makes both sides play better.

```
ai.test.js
  - the AI does not attack into a lethal counter-attack it can see
  - the AI holds its normal summon for MAIN_2 when the monster would
    otherwise be exposed to a known removal card
  - across 200 selfplay duels, neither duelist wins more than 65%
```

---

## WP8 — Replay and sharing

You already have deterministic seeded generation and a full event log. That is a
replay format for free.

- Serialise `{ seed, matchup, actions[] }`. That is the entire duel, in a URL
  fragment, in a few hundred bytes.
- Add `?duel=<encoded>` to load and play back, with a scrubber over turns.
- The existing share card gets a "watch this duel" link alongside the image. That
  turns every share into a playable artefact rather than a screenshot, which is
  the single biggest distribution lever the project has.

```
replay.test.js
  - replaying { seed, actions } reproduces an identical final state
  - a replay of a 200-turn selfplay duel matches event-for-event
```

---

## WP9 — Card packs

`src/cards/` already holds effects as data. Formalise it into a loadable pack
format so the engine is not bound to any single card set:

```json
{
  "packId": "…",
  "name": "…",
  "cards": [
    { "id": "…", "name": "…", "type": "monster",
      "level": 4, "atk": 1400, "def": 1200,
      "attribute": "…", "family": "…",
      "effects": [ { "trigger": "…", "timings": ["MAIN_1","MAIN_2"],
                     "spellSpeed": 1, "ops": [ … ] } ],
      "shotKey": "summon.dark.spellcaster" }
  ],
  "decks": [ { "name": "…", "main": [ … ], "extra": [ … ] } ]
}
```

Load packs at runtime from `packs/`. Ship one original pack as the default so a
fresh clone is playable with no third-party names in it, and let the existing
sets load as a separate local pack. This is worth doing on architecture grounds
alone — it turns "add a card" into "edit a JSON file" and makes a deck builder
possible — and it also means the public default has no licensing exposure. The
repo's current framing (MIT code, no shipped assets, unaffiliated prototype) is
already the right posture; packs make it structural rather than a README claim.

A deck builder then becomes a small UI over the pack format: filter, 40–60 main
deck validation, 15-card extra deck, three-copy limit.

---

## Execution order

If you do nothing else, do the first four.

1. **WP1** — phase machine. Adds Standby, Main 2, and the skip-battle decision.
2. **WP5.1** — phase rail. Makes WP1 visible.
3. **WP5.2 + 5.7** — layout and HUD. Fixes the dead space, the below-the-fold
   hand, and the mismatched player strips.
4. **WP5.6** — investigate the duplicate draw log line first; it may be an engine
   bug affecting deck counts.
5. **WP2** — damage step sub-steps.
6. **WP3** — chain engine. The largest single quality jump available.
7. **WP5.5** — chain ribbon, so WP3 is legible.
8. **WP4** — remaining zones, extra deck visible.
9. **WP6** — chain-aware shots and predictive prefetch.
10. **WP7 / WP8 / WP9** — depth, distribution, extensibility.

---

## Definition of done, per work package

- `npm test` green, including the new assertions listed in the WP.
- `npm run smoke` green.
- `npm run selfplay` completes 200 duels per matchup with no stalls and no
  illegal-state assertions.
- `npm run build` produces a working `duel-live.html`.
- The README's "Rules implemented" and "Limitations" sections updated to match
  reality. If WP3 lands, the chain limitation line is deleted, not softened.
