# Duel Live — Design

## Overview

Duel Live is a browser duel game in the shape of Yu-Gi-Oh: you play a card, a rules engine
resolves what happens, and the result is turned into an animated cinematic while you watch.
It recreates two duels in full — Yugi vs Kaiba and Joey vs Mai Valentine — and runs its
entire cinema pipeline on providers that cost nothing.

It is a Yu-Gi-Oh flavoured study of [xflare-bot/pokemonlive](https://github.com/xflare-bot/pokemonlive),
which asked whether a game could generate its next cinematic from the player's last choice.
Duel Live asks the follow-up question: **what survives when the budget is zero?**

## Goals

- A duel that is genuinely playable — real summoning costs, real battle maths, real traps —
  not a slideshow with a card theme.
- Both duels complete and distinct: different decks, different fusions, different AI temperament.
- Zero-cost, zero-setup default. `npm start` and play. No key, no install, no account.
- Fidelity is a progressive enhancement, never a prerequisite. Nothing about the game
  should break, stall, or degrade in usefulness when a generator is slow or absent.

## Non-goals

- Tournament-accurate rulings. Chains, priority, and simultaneous activation are simplified
  to one response window per attack.
- A search-based AI. The opponent scores the engine's legal actions; it does not look ahead.
- Shipping licensed assets. No card art, card text, or artwork is bundled — visuals are
  generated at runtime or drawn procedurally from a card seed.

## Architecture

```
duel-engine.js ──▶ events ──▶ storyboard.js ──▶ free-video.js ──▶ player.js
  resolves the        the only     rebuilds each      picks a tier      canvas loop +
  duel, emits         thing the    prompt from        per shot and      media hand-off
  what happened       UI trusts    battle facts       prefetches
```

**The rules engine owns the outcome; the cinema owns the presentation.** Nothing generated
is ever read back into the rules. A shot's prompt is rebuilt from the engine's own numbers
each time it is generated, so a cinematic cannot contradict the duel it is depicting.

| Module | Responsibility |
| :--- | :--- |
| `src/cards/` | Card data. Effects are declarative `{ op, ... }` records. |
| `src/duel-state.js` | State construction, card instances, derived stats. |
| `src/duel-engine.js` | Turn cycle, summoning, battle, trap windows, legal actions. |
| `src/duel-effects.js` | The op dispatcher every Spell and Trap resolves through. |
| `src/duel-ai.js` | Scores the engine's legal actions by duelist temperament. |
| `src/banter-lines.js` | The duelists' dialogue, in character. Data only. |
| `src/banter.js` | Reads what happened and picks a line, plus a retort. |
| `src/cinema/storyboard.js` | Events → shot list, with prompts rebuilt from battle facts. |
| `src/cinema/free-video.js` | Tier selection, prefetch, de-duplication, fallback. |
| `src/cinema/archetypes.js` | Collapses shots onto a reusable clip library. |
| `src/providers.mjs` | Video provider adapters and the fallback chain. |
| `src/cinema/procedural-stage.js` | Tier 0: seeded canvas holograms. No network. |
| `src/cinema/player.js` | Canvas loop, shot queue, media hand-off. |
| `src/app.js` | Orchestration and player input. |
| `server.mjs` | Static serving and provider brokering. Holds the key. |

### Adding a card is a data change

A card declares an effect op; `duel-effects.js` resolves it. A test asserts that no card can
name an op the engine cannot resolve, so a new card either works or fails the build — it can
never half-work at runtime.

## The tier runway

The central design decision. Rather than picking a provider, the cinema is a runway of tiers
that render the same duel at different fidelity and latency:

| Tier | What it is | Needs | Latency |
| :--- | :--- | :--- | :--- |
| 0 · procedural | Seeded holograms on a `<canvas>` | nothing | instant |
| 1 · still | AI key art, animated with camera and FX | nothing | ~1–20 s |
| 2 · video | An AI video clip | a free key | ~30–120 s |
| 3 · voice | Generated duelist lines | a free key | ~1–3 s |

Three properties make this work:

1. **Tier 0 is the product, not a placeholder.** It is what plays by default, works offline,
   and is what every higher tier fades in over.
2. **Slow tiers are prefetched behind fast ones.** Shot *n+1* is generated while shot *n* is
   on screen, so the player never waits on a generator.
3. **Failure falls back, never blocks.** A timeout, an error, or a missing key resolves to
   `null`, which callers read as "stay on the tier below". There is no error state to handle
   because there is no state in which the duel cannot continue.

Video is budgeted to the two most cinematic moments per exchange (`deservesVideo`), because
free-tier video is slow, metered, and spending it on a 1200 ATK trade is waste.

### The cinema must never hold up play

The first playable build had a real defect: `run()` awaited the entire shot queue before
returning control. A busy turn queued up to **37 seconds** of cinema, during which every
control was disabled and the hint read "Opponent is thinking…". It looked exactly like a
crash, and a thrown turn genuinely was one — the exception killed the opponent-turn loop and
stranded the duel on a side the player could not act for, with nothing able to resume it.

The rule that fixes it follows from the architecture: **the engine has already decided the
outcome, so the presentation is never load-bearing.** Concretely:

- A turn's shots share one compressed tempo (`paceFor`), set once at enqueue. Uniform is both
  faster and easier to read than accelerating and then dragging on the tail. Worst turn:
  7.7s of cinema, down from 37s; average 3.4s.
- Waiting on the cinema is bounded (`SETTLE_CAP_MS`, 3.5s) and an opponent's whole turn runs
  on a `TURN_BUDGET_MS` of 4s. Past the budget the duel keeps resolving and the queue drains
  behind the action.
- `frame()` cannot throw its way out of the render loop; it always reschedules.
- `run()` catches, reports, and recovers instead of stranding the turn.
- A watchdog notices a duel parked on the opponent's side with nothing running and resumes it.
- The player can always cut a scene: click the arena, press Space, or use **Skip scene**.
  **Resume duel** is there as a last resort so nobody has to reload.

Measured through the real app against a stubbed DOM: worst input block went from 37s to under
5s, and a full duel now completes.

### Banter

The duelists trade lines because a duel that only reports numbers does not feel like the show.
`situationFor` maps an engine event to a dramatic moment — ace summon, fusion, sprung trap,
big hit, direct attack, drawing your ace — and returns `null` for everything else, so nobody
comments on a face-down. When a moment fires, the other duelist answers it about half the
time, which is what makes an exchange read as a conversation. Failing that, a duelist who is
far ahead, far behind, or low on life points occasionally speaks unprompted.

Lines are original, written in character rather than transcribed. They are data
(`banter-lines.js`), separate from the director (`banter.js`), and a test asserts every
duelist covers every situation so a new duelist cannot ship half-mute.

### Providers are a chain, not a choice

Stills and voice run on Pollinations, chosen because its image tier works with **no key at
all**. Video is deliberately not tied to one vendor: `src/providers.mjs` holds three adapters
behind a single contract (`configured` / `seconds` / `cost` / `generate`) and the chain takes
whichever is configured, affordable and working.

| Provider | Model | Floor | Billing shape |
| :--- | :--- | :--- | :--- |
| Higgsfield | Seedance Lite | 480p, 3s | per second |
| Pollinations | nova-reel-v1 | 720p, 6s | 0.08 Pollen/second |
| Google | Veo 3.1 Fast | 720p, 4s | per second, 4/6/8 only |

Each adapter clamps duration to what its API actually accepts rather than sending a request
that will be rejected, and ties break toward the shorter, cheaper option. Affordability is a
separate veto from configuration, so a spent Pollen balance skips that adapter without
removing it from the chain. Credentials stay server-side. Generated media is cached in
`.local/media/`; a confirmed failure gets exactly one retry, while a blind resubmission of an
accepted job gets none.

### The clip library is the real cost fix

Content-hashing a per-shot prompt caches perfectly and reuses nothing, because every shot is
unique. The insight is that **a viewer does not read the shot, they read its shape**: a dark
spellcaster arriving in a column of violet light looks right for Dark Magician, Dark Magician
Girl and Lord of D. alike.

`archetypeFor` keys a clip on kind plus attribute plus creature family, which collapses both
decks onto 33 clips — 15 summons, 5 fusions, 5 clashes, 5 direct attacks, and one each for
trap, spell and finish. `npm run prewarm` generates them once; afterwards every duel plays
cached video at no further cost.

Two invariants keep it honest, both tested: a key must fully determine its prompt (anything
the key omits — the creature family on a `direct` shot, for instance — must stay out of the
prompt too, or one key would cache inconsistent clips), and a shot with no reusable form
returns `null` rather than guessing.

## Testing

67 tests, no test framework and no dependencies — `node --test` only.

- **Engine and effects** — battle maths, tribute costs, trap windows, every card op.
- **Decks** — 40 cards, ≤3 copies, fusions in the Extra Deck and assemblable from the main deck.
- **Cinema** — prompt construction, tier planning, de-duplication, timeout fallback.
- **Wiring** — every element id `app.js` reaches for exists in `index.html`.
- **Integration** — boots the real `app.js` against a stubbed DOM with a time-accelerated
  clock and plays actual turns. This is the test that catches a stalled cinema queue.
- **Single-file build** — the bundled artefact is booted and played, not just diffed.
- **Banter** — every duelist covers every situation, replies fire and suppress correctly,
  and no `{card}` placeholder can reach a spoken line.
- **Recovery** — pacing compresses busy turns, no turn can queue more cinema than the budget
  tolerates, and a canvas that throws on every call cannot stop the render loop.
- **Soak** — `npm run selfplay` drives 400 headless duels; both matchups resolve in ~15 turns.

## Decisions worth recording

**Why no dependencies?** The upstream project is vanilla by design and the whole point here is
that the stack costs nothing to run. A build step and a dependency tree are both costs.

**Why a module registry in the single-file build instead of concatenation?** Concatenating
modules silently clobbers same-named locals across files (`el`, `hash`, `card` all collide).
The registry is ~15 lines and correct by construction.

**Why does the AI read `legalActions` instead of the state?** It cannot invent a move the
rules would not allow, which makes the opponent's play trustworthy without a second rules
implementation to keep in sync.

**Why is voice tier 0 the browser's own synthesiser?** It is free, offline, instant, and needs
no key — so every duel has a voice even in the worst case, and a key only upgrades it.

**Why does the server track a Pollen balance?** A free video balance is small — roughly ten
clips. Silently draining it mid-duel and then failing would be worse than not offering video
at all, so the server reads the balance, refuses video it cannot afford, and the UI shows the
remaining clip count. Combined with content-hashed caching, a shot never costs twice.

**Why did the DOM stub need a time-accelerated clock?** The cinema paces itself off
`performance.now()`. Multiplying that clock lets a test watch whole turns of animation in a
fraction of the wall time — and it is the only reason the 37-second stall was found in a test
run rather than by a player.
