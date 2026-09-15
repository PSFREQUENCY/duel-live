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
import { createCounter, renderFan, renderFieldStrip, renderRibbon, renderSelection } from "./ui/live/disk.js";
import { isInteractive } from "./modes.js";
import { DEFAULT_PACE, paceFor } from "./broadcast/pace.js";
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
  let pace = paceFor(DEFAULT_PACE);

  const setMyLp = createCounter(ui.lp.me);
  const setFoeLp = createCounter(ui.lp.foe);

  const stage = createStage({
    canvas: ui.canvas,
    media: () => (reel?.current ? pool.get(reel.current.key) : null),
    accents,
    getState,
    onFrame: () => tick(),
  });

  // Each row routes to its own handler. Sending all four to one of them means a
  // click on the opponent's monster is read as a click on your own, which makes
  // declaring an attack impossible -- the second half of it never lands.
  const zoneClick = (side, row) => (inst) => {
    if (isInteractive(mode) && inst) onAction?.({ type: "zone", side, row, inst });
  };

  const telestrator = createTelestrator({
    root: ui.telestrator,
    rows: [
      ["opponent", "backrow", ui.rows.foeBackrow, zoneClick("opponent", "backrow")],
      ["opponent", "monsters", ui.rows.foeMonsters, zoneClick("opponent", "monsters")],
      ["player", "monsters", ui.rows.myMonsters, zoneClick("player", "monsters")],
      ["player", "backrow", ui.rows.myBackrow, zoneClick("player", "backrow")],
    ],
    getState,
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
      // The grammar sets the rhythm; pace sets the tempo it is played at.
      const shots = sequence.shots.map((shot) => ({
        ...shot, hold: Math.round(shot.hold * pace.hold),
      }));
      reel.push({ ...sequence, shots, pushedAt: performance.now() });
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
    // What is actually on the field, always on screen. Behind a held key it
    // reads as an opponent with no cards at all.
    renderFieldStrip(ui.fields.me, state, "player");
    renderFieldStrip(ui.fields.foe, state, "opponent");
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

    setPace(name) { pace = paceFor(name); },
    get pace() { return pace; },

    /**
     * Wait until the edit has caught up, or the cap runs out.
     *
     * This is the knob that separates the modes. Tactical waits on its own shot
     * queue; live waits on the reel's backlog. Either way there is a hard cap,
     * so a slow generator delays a beat and never freezes the duel -- the reel
     * still has the ambient lane underneath it the whole time.
     */
    settle(capMs = pace.settleCap) {
      return new Promise((done) => {
        const deadline = Date.now() + capMs;
        const check = () => {
          if (!reel || reel.pending <= pace.backlog) return done();
          if (Date.now() > deadline) return done();
          setTimeout(check, 80);
        };
        check();
      });
    },

    /** Pin the board open while a declaration is half-made. */
    holdBoard(on) { telestrator.hold(on); },
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
