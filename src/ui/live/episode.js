// Recording the duel as a film.
//
// Everything already composites into one canvas and the score already runs
// through one audio node, so an episode export is a capture of two streams that
// exist anyway -- browser-native, no dependencies, and no second render path
// that could disagree with what the viewer actually saw.

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

/** The best container this browser will actually record, or null. */
export function pickMime(Recorder = globalThis.MediaRecorder) {
  if (!Recorder?.isTypeSupported) return null;
  return MIME_CANDIDATES.find((type) => Recorder.isTypeSupported(type)) ?? null;
}

export const canRecord = (Recorder = globalThis.MediaRecorder) => Boolean(pickMime(Recorder));

/**
 * Capture the stage and the score together.
 *
 * The audio is optional on purpose: a browser that blocks the audio context
 * still gets a silent film rather than no film at all.
 */
export function createRecorder({ canvas, audioNode, fps = 30, Recorder = globalThis.MediaRecorder }) {
  const mime = pickMime(Recorder);
  if (!mime || !canvas?.captureStream) return null;

  let recorder = null;
  let chunks = [];

  function buildStream() {
    const stream = canvas.captureStream(fps);
    const ctx = audioNode?.context;
    if (audioNode && ctx?.createMediaStreamDestination) {
      const sink = ctx.createMediaStreamDestination();
      audioNode.connect(sink);
      for (const track of sink.stream.getAudioTracks()) stream.addTrack(track);
    }
    return stream;
  }

  return {
    start() {
      if (recorder) return false;
      chunks = [];
      recorder = new Recorder(buildStream(), { mimeType: mime });
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.start(1000);
      return true;
    },
    /** Resolves with the finished film, or null if nothing was captured. */
    stop() {
      return new Promise((done) => {
        if (!recorder) return done(null);
        const active = recorder;
        recorder = null;
        active.onstop = () => done(chunks.length ? new Blob(chunks, { type: mime }) : null);
        active.stop();
      });
    },
    get recording() { return Boolean(recorder); },
    get mime() { return mime; },
  };
}

/** Turns per duel, not seconds: a scrubber over time means nothing to a duel. */
export function turnMarkersFrom(events) {
  const marks = [];
  let turn = 0;
  events.forEach((event, index) => {
    if (event.type !== "phase" || event.phase !== "draw") return;
    turn += 1;
    marks.push({ turn, index });
  });
  return marks;
}
