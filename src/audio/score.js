// One continuous score under the whole duel.
//
// This is the single largest lever on whether sixty separate clips feel like
// one episode. The picture cuts; the score does not. Per-clip cues would give
// sixty different rooms and the thing falls apart at every cut -- which is also
// why every clip prompt carries `music` as a negative.
//
// A handful of oscillators and gain nodes. No samples, no library.

const KEYS = {
  // Two centres, so a duel that changes lead also changes key.
  leading: { root: 55, third: 65.41, fifth: 82.41 },   // A1 minor-ish
  trailing: { root: 49, third: 58.27, fifth: 73.42 },  // G1, a tone down
};

const DUCK_DB = -18;
const DUCK_RELEASE = 0.4;
const dbToGain = (db) => 10 ** (db / 20);

function osc(ctx, type, freq, gain, destination) {
  const node = ctx.createOscillator();
  const level = ctx.createGain();
  node.type = type;
  node.frequency.value = freq;
  level.gain.value = gain;
  node.connect(level).connect(destination);
  node.start();
  return { node, level };
}

/** The slow breath under everything. Always on, from the first frame. */
function buildBed(ctx, out) {
  const voices = [
    osc(ctx, "sine", KEYS.leading.root, 0.22, out),
    osc(ctx, "sine", KEYS.leading.root * 2.01, 0.09, out),  // detuned, for beating
    osc(ctx, "triangle", KEYS.leading.fifth, 0.05, out),
  ];
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.value = 0.07;
  depth.gain.value = 0.06;
  lfo.connect(depth).connect(voices[0].level.gain);
  lfo.start();
  return voices;
}

export function createScore({ audioContext, destination } = {}) {
  let ctx = audioContext ?? null;
  let master = null;
  let bedGain = null;
  let pulseGain = null;
  let leadGain = null;
  let pulseTimer = 0;
  let voices = [];
  let started = false;
  let tempo = 0.9;
  let ducked = false;

  function ensure() {
    if (ctx) return ctx;
    const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    return ctx;
  }

  function pluck(when, freq, gain = 0.07) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
    o.connect(g).connect(pulseGain);
    o.start(when);
    o.stop(when + 0.4);
  }

  function schedulePulse() {
    clearInterval(pulseTimer);
    pulseTimer = setInterval(() => {
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;
      pluck(now, KEYS.leading.root * 4);
      pluck(now + 0.5 / tempo, KEYS.leading.fifth * 2, 0.04);
    }, Math.max(380, 900 / tempo));
  }

  return {
    start() {
      if (started) return false;
      const context = ensure();
      if (!context) return false;
      started = true;
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(destination ?? context.destination);

      bedGain = context.createGain();
      pulseGain = context.createGain();
      leadGain = context.createGain();
      bedGain.gain.value = 1;
      pulseGain.gain.value = 0;      // enters at turn 3
      leadGain.gain.value = 0;       // enters when someone is nearly out
      for (const g of [bedGain, pulseGain, leadGain]) g.connect(master);
      voices = buildBed(context, bedGain);
      schedulePulse();
      return true;
    },

    /**
     * The layers are driven by the duel, and every change is a crossfade. A
     * hard switch at a threshold is audible as a switch, which is the one thing
     * a continuous bed must never sound like.
     */
    update({ turn = 1, lowestLpFraction = 1, leading = true } = {}) {
      if (!started || !ctx) return;
      const now = ctx.currentTime;
      const wantPulse = turn >= 3 ? 0.8 : 0;
      pulseGain.gain.linearRampToValueAtTime(wantPulse, now + 1.2);

      const wantLead = lowestLpFraction < 0.25 ? 0.55 : 0;
      leadGain.gain.linearRampToValueAtTime(wantLead, now + 1.6);

      // Tempo climbs with the turn count, so a long duel tightens rather than
      // looping at one pace for forty turns.
      const next = Math.min(1.9, 0.9 + turn * 0.045);
      if (Math.abs(next - tempo) > 0.08) { tempo = next; schedulePulse(); }

      const key = leading ? KEYS.leading : KEYS.trailing;
      voices.forEach((voice, i) => {
        const target = [key.root, key.root * 2.01, key.fifth][i];
        voice.node.frequency.linearRampToValueAtTime(target, now + 2.4);
      });
    },

    /** Under a line of banter the bed steps back rather than competing. */
    duck(on) {
      if (!started || !ctx || on === ducked) return;
      ducked = on;
      const now = ctx.currentTime;
      const target = on ? dbToGain(DUCK_DB) : 1;
      bedGain.gain.cancelScheduledValues(now);
      bedGain.gain.linearRampToValueAtTime(target, now + (on ? 0.08 : DUCK_RELEASE));
    },

    /**
     * Budget silence. After a loud exchange, near-silence is more powerful than
     * any cue and it is the cheapest effect available -- so the finish gets one
     * before it lands, deliberately, rather than a sting on top of a sting.
     */
    silence(ms = 800) {
      if (!started || !ctx) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.linearRampToValueAtTime(0.0001, now + 0.12);
      master.gain.setValueAtTime(0.0001, now + ms / 1000);
      master.gain.linearRampToValueAtTime(0.5, now + ms / 1000 + 0.5);
    },

    resume() { return ctx?.state === "suspended" ? ctx.resume() : Promise.resolve(); },
    stop() {
      clearInterval(pulseTimer);
      for (const voice of voices) { try { voice.node.stop(); } catch { /* already stopped */ } }
      voices = [];
      started = false;
      ctx?.close?.();
      ctx = null;
    },
    get running() { return started; },
    get context() { return ctx; },
    get output() { return master; },
  };
}
