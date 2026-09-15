// Live mode: the reel, the stage, the pool and the score, wired to one duel.
//
// This owns presentation only. The engine decides the duel exactly as it does
// in tactical mode and every action still goes back through the same callbacks,
// so nothing here can change an outcome -- which is what makes it safe for the
// reel to drop shots under pressure.

import { createAmbient } from "./broadcast/ambient.js";
import { createDirector } from "./broadcast/director.js";
import { createReel } from "./broadcast/reel.js";
import { createScore } from "./audio/score.js";
import { createStage } from "./ui/live/stage.js";
import { createMediaPool } from "./ui/live/media-pool.js";
import { createTelestrator } from "./ui/live/telestrator.js";
import { canRecord, createRecorder } from "./ui/live/episode.js";
import { createCounter, renderFan, renderRibbon, renderSelection } from "./ui/live/disk.js";
import { isInteractive } from "./modes.js";
import { DUELISTS } from "./duelists.js";
import { highestTier } from "./cinema/free-video.js";

const STARTING_LP = 8000;

// Reactions and idles stay tier 1 even when video is affordable. A slow push-in
// on a still portrait *is* an anime reaction beat -- video is the wrong texture
// for it, and the fact that stills are instant is what lets the ambient lane
// promise zero latency at all.
const STILL_ONLY = /^(react|idle|arena|phase)\./;

function tierFor(key) {
  if (STILL_ONLY.test(key)) return highestTier() === "procedural" ? "procedural" : "still";
  return highestTier();
}

export function createLiveMode({ mode, ui, getState, onAction, onPass, accents }) {
  const pool = createMediaPool({ tierFor });
  const score = createScore();
  let ambient = null;
  let reel = null;
  let selected = null;
  let closeRibbon = null;
  let lastTurn = 0;
  let recorder = null;
  const director = createDirector();
  const cuts = { total: 0, action: 0, ambient: 0, keys: new Set() };

  const setMyLp = createCounter(ui.lp.me);
  const setFoeLp = createCounter(ui.lp.foe);

  const stage = createStage({
    canvas: ui.canvas,
    media: () => (reel?.current ? pool.get(reel.current.key) : null),
    accents,
    getState,
    onFrame: () => tick(),
  });

  const telestrator = createTelestrator({
    root: ui.telestrator,
    rows: [
      ["opponent", "backrow", ui.rows.foeBackrow], ["opponent", "monsters", ui.rows.foeMonsters],
      ["player", "monsters", ui.rows.myMonsters], ["player", "backrow", ui.rows.myBackrow],
    ],
    getState,
    onZoneClick: (inst) => { if (isInteractive(mode)) onAction?.({ type: "zone", inst }); },
  });

  function tick(now = performance.now()) {
    if (!reel) return;
    reel.setPressure(ambient.pressureAt(now));
    const shot = reel.tick(now);
    if (shot) {
      pool.want(shot.key);
      ui.shotLabel.textContent = shot.key;
    }
    telestrator.refresh();
  }

  function pushEvents(events, state) {
    if (!reel || !state) return 0;
    const sequences = director.direct(events, state);
    for (const sequence of sequences) {
      reel.push({ ...sequence, pushedAt: performance.now() });
      // Warm the whole sequence at once: the reel is about to want all of it,
      // and the spine must never be the shot that is still generating.
      pool.prefetch(sequence.shots.map((shot) => shot.key));
    }
    // Somebody acted, so the decision window closes and pressure resets.
    ambient.reset(performance.now(), state.activeSide);
    return sequences.length;
  }

  function renderHud(state) {
    if (!state) return;
    setMyLp(state.sides.player.lp);
    setFoeLp(state.sides.opponent.lp);
    ui.counts.me.textContent = `H ${state.sides.player.hand.length}  D ${state.sides.player.deck.length}`;
    ui.counts.foe.textContent = `H ${state.sides.opponent.hand.length}  D ${state.sides.opponent.deck.length}`;
    ui.names.me.textContent = DUELISTS[state.sides.player.duelistId]?.name ?? "";
    ui.names.foe.textContent = DUELISTS[state.sides.opponent.duelistId]?.name ?? "";
  }

  function renderHand(state, actions) {
    if (!isInteractive(mode)) { ui.fan.innerHTML = ""; return; }
    renderFan(ui.fan, state, {
      actions,
      selectedUid: selected?.uid,
      onSelect: (inst) => { selected = inst; renderAll(state, actions); },
    });
    renderSelection(ui.selection, state, selected, {
      actions,
      onAction: (action) => { selected = null; onAction?.(action); },
      onClose: () => { selected = null; renderAll(state, actions); },
    });
  }

  function renderAll(state = getState(), actions = []) {
    renderHud(state);
    renderHand(state, actions);
    if (!state) return;
    const lowest = Math.min(state.sides.player.lp, state.sides.opponent.lp) / STARTING_LP;
    if (state.turn !== lastTurn) {
      lastTurn = state.turn;
      score.update({ turn: state.turn, lowestLpFraction: lowest,
        leading: state.sides.player.lp >= state.sides.opponent.lp });
    }
  }

  return {
    start(state) {
      ambient = createAmbient({
        you: state.sides.player.duelistId,
        opponent: state.sides.opponent.duelistId,
        onTurn: state.activeSide,
      });
      director.reset();
      ambient.reset(performance.now(), state.activeSide);
      reel = createReel({
        ambient: (level, opts) => ambient.select(level, opts),
        now: () => performance.now(),
        // Counted here rather than sampled from outside: the stage ticks the
        // reel every animation frame, so anything watching from a slower loop
        // misses most of what played.
        onShotChange: (shot) => {
          cuts.total += 1;
          cuts[shot.ambient ? "ambient" : "action"] += 1;
          cuts.keys.add(shot.key);
        },
      });
      reel.start(performance.now());
      // Everything the opening needs, before the first event arrives.
      pool.prefetch([reel.current.key, `idle.${state.sides.player.duelistId}`,
        `react.${state.sides.opponent.duelistId}.steady`, "arena.wide"]);
      stage.start();
      telestrator.attach();
      renderAll(state);
    },

    present(events, state) { return pushEvents(events, state); },
    render: renderAll,

    /** A chain window: the one place play is allowed to hold up the cinema. */
    openResponses(responses, { deadline = 12_000, onRespond } = {}) {
      closeRibbon?.();
      closeRibbon = renderRibbon(ui.ribbon, responses, {
        deadline,
        onRespond: (response) => { closeRibbon?.(); closeRibbon = null; onRespond?.(response); },
        onPass: () => { closeRibbon?.(); closeRibbon = null; onPass?.(); },
      });
    },
    closeResponses() { closeRibbon?.(); closeRibbon = null; },

    /** Duck under a line, and release. The bed never competes with a voice. */
    duck(on) { score.duck(on); },
    /** Silence before the finish lands; the cheapest effect in the whole build. */
    silence(ms) { score.silence(ms); },
    startScore() { return score.start(); },

    /**
     * Every duel a player finishes becomes a two-minute film made out of their
     * own decisions, which is a substantially better artefact than a screenshot.
     */
    canRecord: () => canRecord(),
    startRecording() {
      recorder ??= createRecorder({ canvas: ui.canvas, audioNode: score.output });
      return Boolean(recorder?.start());
    },
    async stopRecording() { return recorder ? recorder.stop() : null; },
    get recording() { return Boolean(recorder?.recording); },

    skip() { reel?.skip(performance.now()); },
    setSticky(value) { telestrator.setSticky(value); },
    stop() {
      stage.stop();
      telestrator.detach();
      score.stop();
      closeRibbon?.();
    },
    /** What the reel actually cut to, tallied as it happened. */
    get cuts() { return { ...cuts, distinct: cuts.keys.size }; },
    get reel() { return reel; },
    get stage() { return stage; },
    get pool() { return pool; },
    get score() { return score; },
  };
}
