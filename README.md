<div align="center">

<h1>Duel Live</h1>

<p><strong>Play a card. Watch the duel animate itself.</strong></p>

<p>Rule-driven Yu-Gi-Oh style duels, rendered as AI cinema on a stack that costs nothing to run.</p>

<p>
  <code>Yugi vs Kaiba</code> ·
  <code>Joey vs Mai Valentine</code> ·
  <code>No API key required</code>
</p>

</div>

> Unofficial, local, non-commercial learning prototype, built as a Yu-Gi-Oh flavoured
> study of [xflare-bot/pokemonlive](https://github.com/xflare-bot/pokemonlive). No card
> artwork, card text, or other licensed asset ships in this repository — every visual is
> generated at runtime or drawn procedurally.

## Quickstart

```bash
npm start                       # http://localhost:4174/
```

That is the whole setup. There is no `npm install` — the project has zero dependencies —
and no API key. The duel is fully playable the moment the server is up.

Prefer a single file? `npm run build` writes `duel-live.html`, a 128 KB self-contained
build you can open straight from disk with no server at all.

## The experiment

`pokemonlive` asked whether a game could generate its next cinematic from the player's
last choice instead of shipping every animation up front. Duel Live asks the follow-up:
**what survives when the budget is zero?**

The answer is a runway rather than a provider. Every tier below renders the same duel;
they differ only in how much fidelity a given moment is worth waiting for.

| Tier | What it is | Needs | Latency |
| :--- | :--- | :--- | :--- |
| 0 · procedural | Seeded holograms drawn on a `<canvas>` | nothing at all | instant |
| 1 · still | AI key art, animated with camera and FX | nothing | ~1–20 s |
| 2 · video | A clip from the archetype library | any one provider | cached after first run |
| 3 · voice | Generated duelist lines | a Pollinations key | ~1–3 s |

Tier 0 is not a placeholder. It is the default experience, it works offline, and every
higher tier is a progressive enhancement layered on top of it. A generation that fails,
times out, or is simply too slow falls back a tier instead of stalling the duel — slow
tiers are prefetched while the shot below them is already on screen.

**The cinema never holds up play.** The engine has already decided the outcome, so waiting
on the presentation is always bounded: a busy turn's shots share a compressed tempo, input
unblocks after at most 3.5 seconds, and an opponent's turn resolves on a 4-second budget
with any remaining shots drained behind the action. You can cut a scene short at any time by
clicking the arena, pressing **Space**, or using **Skip scene**. If a turn ever does stall,
a watchdog picks it back up, and a **Resume duel** button appears so you never have to
reload.

Voice works with no key at all through the browser's own speech synthesiser; a key only
upgrades it to generated audio.

### Video providers

Video is not tied to one vendor. Providers are tried in order and the first that
is **configured, affordable and working** wins, so a spent balance or an outage
drops to the next one instead of dropping the feature.

| Provider | Model | Floor | Where to get credentials |
| :--- | :--- | :--- | :--- |
| Higgsfield | Seedance Lite | **480p**, 3s | higgsfield.ai → API keys |
| Pollinations | nova-reel-v1 | 720p, 6s | [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys) |
| Google | Veo 3.1 Fast | 720p, 4s | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

Higgsfield is first by default because it is the only one with a genuine **480p**
tier — the others quietly use their own floor when you ask for 480. Set
`DUEL_VIDEO_PROVIDERS` to reorder, and `DUEL_VIDEO_QUALITY=720` to go up.

Be clear-eyed about what resolution buys: Pollinations bills per *second*
regardless of size, so 480p there saves decode and transfer, not money. The
saving that matters is reuse.

### The clip library — generate 33, reuse forever

Generating a fresh clip per shot means nothing is ever reused and a small budget
buys a handful of moments. Duel Live keys clips by **what a viewer actually
reads** instead — kind, attribute, creature family — so `Dark Magician`,
`Dark Magician Girl` and `Lord of D.` all play the same *dark spellcaster
summon*. That collapses both duels onto a fixed library:

```
summon 15 · fusion 5 · clash 5 · direct 5 · trap 1 · spell 1 · finish 1  =  33 clips
```

Name a clip whatever your generator called it. Matching normalises spaces,
underscores, case and word order, so `play yugi activate.mp4`,
`Play_Activate_Yugi.MOV` and `play-activate-yugi.webm` all resolve to the same
key. A test asserts no two keys share a word set, so that fallback can never
match the wrong clip.

Build the rest once:

```bash
npm run prewarm              # generates all 33; re-run to retry only what failed
npm run prewarm summon       # or just one family
npm run prewarm --limit=3    # or a taster
```

After that every duel plays without further cost, forever. The **Clips** control
picks between **Action library** — one clip for every shot that reads the same
way — and **Generative**, which makes a new clip per shot for more fidelity when
you have budget to spend.

### Pollen, if you use Pollinations

`amazon/nova-reel-v1` has a **6-second minimum** at 0.08 Pollen per second, so
one clip is **0.48 Pollen** — there is no cheaper smoke test. Free "Quest Pollen"
comes from the **Quests** page on the dashboard: 0.25 each for your first key,
first text/image/audio request and first app login, 1.00 for Discord, 3.00 for a
GitHub account over two years old, 5.00 for a merged PR. Making the API calls
alone does *not* credit them — verified against a live account, where all three
requests succeeded and the balance did not move.

```bash
npm run key -- sk_your_key   # writes .env.local, verifies, reports balance
npm run keycheck             # which tiers are reachable right now
```

Credentials stay on the server and are never sent to the browser. Generated media
is cached under `.local/media/`.

## Architecture

**The rules engine owns the outcome. The cinema only ever renders what already happened.**

```
duel-engine.js ──▶ events ──▶ storyboard.js ──▶ free-video.js ──▶ player.js
  resolves the        the only     rebuilds each      picks a tier      canvas loop +
  duel, emits         thing the    prompt from        per shot and      media hand-off
  what happened       UI trusts    battle facts       prefetches
```

A shot prompt is rebuilt from the engine's own numbers every time it is generated, so the
cinema cannot contradict the duel: if Blue-Eyes hit for 3000, that is what the shot says
and what the life point counter shows. No generated text or image is ever fed back into
the rules.

Vanilla HTML, CSS and ES modules. No framework, no build step for the module version, and
no runtime dependencies — `package.json` has an empty `dependencies` block on purpose.

## The duels

Both are complete: 40-card decks, Extra Deck fusions, and an AI that plays its duelist's
temperament rather than a generic script.

**Duel I — Yugi vs Kaiba.** Dark Magician, Summoned Skull and Buster Blader against three
Blue-Eyes White Dragons. Kaiba plays aggro and will trade down to push damage; Yugi's deck
is built to survive to a Mirror Force. Fusions: Gaia the Dragon Champion, Chimera,
Blue-Eyes Ultimate Dragon.

**Duel II — Joey vs Mai Valentine.** Dice traps and swingy fusions against Harpies that
scale off each other. Mai plays tempo and equips; Joey's Extra Deck holds Flame Swordsman,
Thousand Dragon and Black Skull Dragon.

### Share card

Win a duel and **Share result** renders a card on a canvas: the headline, six stat
tiles, the biggest single hit of the duel, and the winner's ace as a holographic
projection. It is drawn rather than screenshotted, so it stays legible at thumbnail
size on a timeline where a capture of the game UI would be a smear.

Two formats, toggled in the panel: **16:9** (1280×720) for a timeline and **9:16**
(1080×1920) for a story. They are separate compositions rather than one layout
stretched — landscape sets the ace beside the numbers, portrait stacks them and
drops to two stat columns. Blocks flow from the bottom of the one above, so a
headline that wraps to two lines pushes what follows instead of colliding with it.
Each format saves under its own filename so the two never overwrite each other.

Every number comes from the engine's own event log, and the arithmetic reconciles:
for both duelists, `life points + damage taken + life paid` equals the starting
8000 in every duel, which a test asserts across sixty of them. A cost a duelist
pays themselves is never credited to their opponent, and the headline hit keeps
the attack's real size even when it overkilled.

Sharing uses the Web Share API where the browser will take a file, and falls back
to copying the image, copying the text, or saving the PNG. In a sandboxed page
that blocks downloads the card is still on screen to save by hand, and the app
says so rather than handing over a link that silently does nothing.

### Reading the board

Hover any card on the field for its name, type, live ATK/DEF and what it does.
Stats come from the engine, so a buffed monster shows what it is worth *now* —
Buster Blader reads 3100 against a Blue-Eyes, not its printed 2600 — and the
number turns green when it differs from the printing. A face-down card you do
not own stays a mystery.

Click either **GY** counter to read both Graveyards. It marks the card Monster
Reborn would revive, and a test asserts the marked card is the one the engine
actually takes, so the preview cannot lie.

### Banter

The duelists talk. Summon your ace, land a fusion, spring a trap, take a big hit, or drop
low on life points, and the game picks a line in that duelist's voice — and, often, a retort
from across the field. Lines are original, written in character rather than lifted from the
show, and the director only fires on moments that earn it, so nobody chatters over a
face-down. Everything spoken also lands in the duel log.

### Rules implemented

8000 Life Points · one Normal Summon per turn · tributes at Level 5 and 7 · Attack and
Defence positions with face-down sets · Fusion Summoning from hand and field · Spells
(normal, continuous, quick-play, equip) · Traps that open a real response window when you
are attacked · direct attacks · a six-card hand limit · deck-out.

Every card's effect is data in `src/cards/`, resolved by a dispatcher in
`src/duel-effects.js` — adding a card is a data change, not an engine change. A test
asserts that no card can reference an effect the engine cannot resolve.

## Development

```bash
npm test         # 116 tests: engine, effects, decks, cinema, banter, recovery,
                 #            providers, share card, wiring, integration, bundle
npm run smoke    # boots the real app against a DOM stub and plays ten turns
npm run selfplay # drives 200 headless duels per matchup as an engine soak test
npm run keycheck # reports which cinema tiers are reachable right now
npm run key      # add a Pollinations key, or print how to earn free Pollen
npm run prewarm  # generate any clips not already hand-made
npm run clips    # coverage report for clips/
npm run clips:preview  # filmstrip every clip so you can see what is in it
npm run shotlist # regenerate prompts/ from the game's own data
npm run build    # regenerate duel-live.html
```

`npm test` includes an integration test that runs `src/app.js` itself against a stubbed
DOM with a time-accelerated clock, so a broken element id or a stalled cinema queue fails
in CI rather than in the browser. `npm run selfplay` reports win rates and average duel
length; both matchups resolve in ~15 turns and finish essentially every time.

## Limitations

- Chains, priority windows, and simultaneous trap activation are simplified: one response
  window per attack, one card in it.
- The AI scores the engine's own legal actions. It plays a coherent game and uses its
  signature cards, but it does not search ahead.
- Video generation is slow everywhere. Tier 2 is budgeted per exchange and prefetched behind
  the tier below, and the archetype library exists so that cost is paid once rather than per
  duel. Tier 2 has been built and unit-tested against all three provider contracts but not yet
  executed end-to-end against a funded account.
- `.env*` (except the example), `.local/` and `outputs/` are Git-ignored. Never commit a key.

## Licence

MIT for the code in this repository. Yu-Gi-Oh! and all card names are trademarks of their
respective owners; this project is an unaffiliated, non-commercial prototype and ships no
licensed assets.
