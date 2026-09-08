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
| 2 · video | An AI video clip for the shot | a free key | ~30–120 s |
| 3 · voice | Generated duelist lines | a free key | ~1–3 s |

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

### Getting a free video key

Video is metered in **Pollen**. You never have to buy any — "Quest Pollen" is the free
balance, and `amazon/nova-reel-v1` spends from it. Sign in at
[enter.pollinations.ai/keys](https://enter.pollinations.ai/keys) with **GitHub** (no card,
no payment details) and create a **secret key** — it starts with `sk_` and stays on your
server.

Then earn a starting balance. These are the live quest rewards, cheapest first:

| Pollen | How |
| ---: | :--- |
| 0.25 | Create your first API key |
| 0.25 ×3 | One text, one image, one audio request — `npm run keycheck` makes all three |
| 0.25 | Log in to any app in the Pollinations app directory |
| 1.00 | Connect Discord and join their server |
| 3.00 | Sign in with a GitHub account at least two years old — automatic |
| 5.00 | Get a pull request merged into the Pollinations repo |
| 3–30 | Close a `POLLEN-QUEST` bounty issue |

`amazon/nova-reel-v1` has a **6-second minimum** and bills 0.08 Pollen per second, so **one
clip costs 0.48 Pollen** — there is no cheaper test. Budget at least that before expecting
tier 2 to do anything. If your GitHub account is over two years old, signing in alone covers
six clips.

Then add it in one command:

```bash
npm run key -- sk_your_key_here
```

That writes `.env.local` (git-ignored), verifies the key against the live API, and tells you
your balance and how many clips it buys. `npm start` picks the file up automatically from
then on. Run `npm run key` with no argument to re-read the earning routes.

Duel Live is built for a small balance: it spends video only on the most cinematic moments,
content-hashes and caches every clip under `.local/media/` so a shot never generates twice,
and the cinema selector shows how many clips you have left. When the balance runs low the
server stops accepting video requests and the game drops to stills on its own — it will not
silently drain your Pollen mid-duel.

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
npm test         # 81 tests: engine, effects, decks, cinema, banter, recovery, wiring,
                 #           integration, bundle
npm run smoke    # boots the real app against a DOM stub and plays ten turns
npm run selfplay # drives 200 headless duels per matchup as an engine soak test
npm run keycheck # reports which cinema tiers are reachable right now
npm run key      # add a key, or print how to earn free Pollen
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
- Free-tier video is genuinely slow and rate-limited. Tier 2 is budgeted to the two most
  cinematic moments per exchange, and everything else stays on the fast tiers by design.
- `.env*` (except the example), `.local/` and `outputs/` are Git-ignored. Never commit a key.

## Licence

MIT for the code in this repository. Yu-Gi-Oh! and all card names are trademarks of their
respective owners; this project is an unaffiliated, non-commercial prototype and ships no
licensed assets.
