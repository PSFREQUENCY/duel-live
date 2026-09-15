// The episode export: a capture of what the viewer actually saw, not a re-render.

import assert from "node:assert/strict";
import { test } from "node:test";

import { canRecord, createRecorder, pickMime, turnMarkersFrom } from "../src/ui/live/episode.js";
import { playDuel } from "../scripts/selfplay.mjs";

class FakeRecorder {
  static supported = ["video/webm;codecs=vp9,opus"];
  static isTypeSupported(type) { return FakeRecorder.supported.includes(type); }
  constructor(stream, options) { this.stream = stream; this.mimeType = options.mimeType; }
  start() { this.started = true; setTimeout(() => this.ondataavailable?.({ data: { size: 12 } }), 0); }
  stop() { this.started = false; setTimeout(() => this.onstop?.(), 0); }
}

const fakeCanvas = (tracks = []) => ({
  captureStream: () => ({ addTrack: (t) => tracks.push(t), getAudioTracks: () => [] }),
});

test("the best supported container is chosen, and absence is reported honestly", () => {
  assert.equal(pickMime(FakeRecorder), "video/webm;codecs=vp9,opus");
  assert.equal(canRecord(FakeRecorder), true);

  class NoRecorder { static isTypeSupported() { return false; } }
  assert.equal(pickMime(NoRecorder), null);
  assert.equal(canRecord(NoRecorder), false);
  assert.equal(canRecord(undefined), false, "a browser without MediaRecorder must not throw");
});

test("no recorder is built when the browser cannot record", () => {
  class NoRecorder { static isTypeSupported() { return false; } }
  assert.equal(createRecorder({ canvas: fakeCanvas(), Recorder: NoRecorder }), null);
  assert.equal(createRecorder({ canvas: {}, Recorder: FakeRecorder }), null,
    "a canvas that cannot be captured is not recordable either");
});

test("a recording round-trips to a blob", async () => {
  const rec = createRecorder({ canvas: fakeCanvas(), Recorder: FakeRecorder });
  assert.equal(rec.recording, false);
  assert.equal(rec.start(), true);
  assert.equal(rec.recording, true);
  assert.equal(rec.start(), false, "starting twice must not replace the running capture");
  await new Promise((r) => setTimeout(r, 10));
  const blob = await rec.stop();
  assert.ok(blob, "nothing was captured");
  assert.equal(blob.type, "video/webm;codecs=vp9,opus");
  assert.equal(rec.recording, false);
});

test("stopping when nothing is running resolves null rather than throwing", async () => {
  const rec = createRecorder({ canvas: fakeCanvas(), Recorder: FakeRecorder });
  assert.equal(await rec.stop(), null);
});

test("the score is mixed in when the audio graph is running", () => {
  const added = [];
  const connected = [];
  const audioNode = {
    context: { createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => ["a1"] } }) },
    connect: (sink) => connected.push(sink),
  };
  const rec = createRecorder({ canvas: fakeCanvas(added), audioNode, Recorder: FakeRecorder });
  rec.start();
  assert.deepEqual(added, ["a1"], "the score should be on the recorded stream");
  assert.equal(connected.length, 1);
});

test("a silent film beats no film when audio is unavailable", () => {
  const added = [];
  const rec = createRecorder({ canvas: fakeCanvas(added), audioNode: null, Recorder: FakeRecorder });
  assert.equal(rec.start(), true);
  assert.deepEqual(added, []);
});

test("the scrubber marks turns, because seconds mean nothing in a duel", () => {
  const { events } = playDuel("yugi-kaiba", 21);
  const marks = turnMarkersFrom(events);
  assert.ok(marks.length > 3, `only ${marks.length} turn markers`);
  assert.deepEqual(marks.map((m) => m.turn), marks.map((_, i) => i + 1), "turns count up by one");
  for (let i = 1; i < marks.length; i += 1) {
    assert.ok(marks[i].index > marks[i - 1].index, "markers must advance through the event log");
  }
});
