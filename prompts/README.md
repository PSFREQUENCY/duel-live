# Generating the clips by hand

78 clips. The game works with **zero** of them — it falls back to procedural
holograms — and gets better with every one you add. Nothing here needs an API key.

## Workflow

1. Open **[ALL-PROMPTS.md](ALL-PROMPTS.md)** and work down **Priority 1** first.
   Those 26 clips are the ones the game reaches for constantly; with just those it
   already reads as a show.
2. Generate each at **16:9**, **480p is plenty**, at the duration in its heading.
3. Save each as the exact filename in its heading — `win-kaiba.mp4`, not
   `win_kaiba_final_v2.mp4`. The filename *is* how the game finds it.
4. Drop the files in **`../clips/`**.
5. Run `npm run clips` to see coverage, then start the server. Hand-made clips are
   used ahead of anything generated, so they cost nothing and appear instantly.

`.mp4`, `.webm` and `.mov` all work. Re-running `npm run shotlist` regenerates
these sheets from the game's own data if the decks or duelists ever change.

## Files here

| File | What it is |
| :--- | :--- |
| `ALL-PROMPTS.md` | Every prompt, grouped by priority. The copy-paste sheet. |
| `CHECKLIST.md` | Tick-list version, if you'd rather track it by hand. |
| `manifest.json` | Machine-readable. What `npm run clips` checks against. |
| `manifest.csv` | For a spreadsheet or a batch tool. |

## Don't edit the first two sentences

Every prompt opens with the same style block and the same world block:

> late-1990s cel-shaded anime, hand-inked outlines … **A holographic trading-card
> duel. Each duelist wears a metal Duel Disk clamped to their left forearm** …

That shared preamble is the only thing making 78 separate generations cut together
as one show. Change the subject sentence freely; leave the preamble byte-identical.

Character descriptions are physical rather than named on purpose — generators
filter trademarked names, and a description gives a more consistent likeness anyway.

## What each group is for

**Duelist clips (40)** — ten shots each for Yugi, Kaiba, Joey and Mai: duel start,
the three ways of playing a card (summon, set, activate), drawing, three reactions
(confident, shocked, determined), win and lose. The reaction clips are what the
banter system plays under a line of dialogue.

**Monster clips (33)** — the archetype library. Keyed by kind + attribute + creature
family, so one *dark spellcaster summon* serves Dark Magician, Dark Magician Girl and
Lord of D. alike. This is why 33 clips covers every monster in both decks.

**Arena clips (5)** — establishing shots for both arenas, a life-point hit, and two
standoff loops for when nothing is happening.

## Tips

- **Consistency beats quality.** A set of merely-good clips that share a look reads
  far better than a few beautiful ones that don't match.
- Generate one duelist's ten clips in a single session so their face stays stable.
- If a generator keeps putting text on screen, add `no text` again at the very end —
  repetition helps on most models.
- Clips loop while a shot is on screen, so a clean, motion-continuous end frame
  matters more than a dramatic final beat.
