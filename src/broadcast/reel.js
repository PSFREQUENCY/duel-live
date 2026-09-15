// The reel: two lanes of shots, and one promise.
//
//   The reel always has a shot on screen. If the action lane is empty or not
//   ready, the ambient lane fills it. There is no blank frame, ever.
//
// That is the whole of live mode. The action lane carries what the engine just
// did and drains in order under a deadline; the ambient lane is a floor rather
// than a queue -- it is never behind, because its shots are pre-resolved and
// infinitely available. Everything else here is about *when* to cut between
// them, which is what separates an edit from a slideshow.

export const MIN_AMBIENT_HOLD = 600;
export const MIN_SHOT_HOLD = 700;
export const MAX_EVENT_LAG = 2500;

// A shot still in motion hides a cut; a shot that has settled shows every seam.
// One flagged `tailMotion` may be cut this far in when something is waiting.
const TAIL_CUT = 0.88;

// Above this, a rank-1 shot interrupts whatever is on screen. A lethal attack
// does not wait its turn -- that is a director's decision and should read as one.
const CUT_NOW_DRAMA = 0.8;

const holdOf = (shot) => Math.max(MIN_SHOT_HOLD, shot.hold ?? MIN_SHOT_HOLD);

/** Under time pressure a sequence sheds its highest rank numbers first. */
export function truncate(shots, budget) {
  if (shots.length <= budget) return shots;
  const ranked = [...shots].sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9));
  const keep = new Set(ranked.slice(0, Math.max(1, budget)));
  return shots.filter((shot) => keep.has(shot));
}

export function createReel({ ambient, onShotChange, now = () => Date.now() }) {
  const queue = [];               // pending sequences, in arrival order
  let current = null;
  let pressure = 0;
  let started = false;
  let lastAmbient = null;

  function play(shot, lane, t) {
    const previous = current?.shot ?? null;
    current = { shot, lane, startedAt: t, hold: lane === "ambient" ? (shot.hold ?? 4000) : holdOf(shot) };
    if (lane === "ambient") lastAmbient = shot.key;
    if (shot.key !== previous?.key) onShotChange?.(shot, previous);
    return current;
  }

  function fillFromAmbient(t) {
    const shot = ambient(pressure, { avoid: lastAmbient });
    play({ hold: 4000, ...shot, lane: "ambient" }, "ambient", t);
  }

  // A sequence that has been waiting too long is cut to its spine rather than
  // played late and in full: the alternative is the edit drifting further and
  // further behind the duel it is supposed to be showing.
  function shotsOf(sequence, t) {
    const late = t - sequence.pushedAt > MAX_EVENT_LAG;
    return late ? sequence.shots.filter((shot) => shot.rank === 1) : sequence.shots;
  }

  function pullNext(t) {
    while (queue.length) {
      const sequence = queue[0];
      const shots = shotsOf(sequence, t);
      const index = sequence.played;
      if (index >= shots.length) { queue.shift(); continue; }
      sequence.played += 1;
      play({ ...shots[index], drama: sequence.drama, eventId: sequence.eventId }, "action", t);
      return true;
    }
    return false;
  }

  /** Whether the shot on screen may be cut for the sequence that is waiting. */
  function mayCut(t) {
    if (!current) return true;
    const elapsed = t - current.startedAt;
    const waiting = queue[0];
    if (waiting && waiting.cutNow) return true;
    if (current.lane === "ambient") return elapsed >= MIN_AMBIENT_HOLD;
    const full = current.hold;
    return elapsed >= (current.shot.tailMotion ? full * TAIL_CUT : full);
  }

  return {
    start(t = now()) {
      if (started) return current;
      started = true;
      if (!queue.length || !pullNext(t)) fillFromAmbient(t);
      return current;
    },

    push(sequence) {
      const cutNow = sequence.drama >= CUT_NOW_DRAMA
        && sequence.shots.some((shot) => shot.rank === 1);
      const entry = { ...sequence, played: 0, pushedAt: sequence.pushedAt ?? now(), cutNow };
      // A shot that interrupts the screen also jumps the queue -- going on
      // screen after three stale shots is not an interruption. What it displaces
      // is still there behind it, and MAX_EVENT_LAG will cut it to its spine.
      if (cutNow) queue.unshift(entry);
      else queue.push(entry);
      return queue.length;
    },

    tick(t = now()) {
      if (!started) return null;
      const expired = t - current.startedAt >= current.hold;
      if (queue.length && mayCut(t)) pullNext(t);
      else if (expired && !pullNext(t)) fillFromAmbient(t);
      return current.shot;
    },

    skip(t = now()) {
      if (!started) return null;
      if (!pullNext(t)) fillFromAmbient(t);
      return current.shot;
    },

    setPressure(level) { pressure = Math.max(0, Math.min(3, level | 0)); },
    get pressure() { return pressure; },
    get current() { return current?.shot ?? null; },
    get lane() { return current?.lane ?? null; },
    get pending() { return queue.reduce((n, s) => n + Math.max(0, s.shots.length - s.played), 0); },
    clear() { queue.length = 0; },
  };
}
