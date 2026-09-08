// Duelist voice. Tier 0 is the browser's own speech synthesiser -- free, offline
// and instant -- so a duel always has a voice even with no key and no network.

const VOICES = {
  yugi:  { rate: 1.0, pitch: 1.15, match: /(male|daniel|alex|fred)/i },
  kaiba: { rate: 0.92, pitch: 0.72, match: /(male|daniel|alex|oliver)/i },
  joey:  { rate: 1.12, pitch: 1.0, match: /(male|fred|alex)/i },
  mai:   { rate: 1.0, pitch: 1.35, match: /(female|samantha|karen|moira)/i },
};

let remoteOk = false;
let audioEl = null;

export function enableRemoteVoice(enabled) {
  remoteOk = Boolean(enabled);
}

function pickVoice(profile) {
  const all = globalThis.speechSynthesis?.getVoices?.() ?? [];
  return all.find((v) => profile.match.test(`${v.name} ${v.voiceURI}`)) ?? all[0] ?? null;
}

function speakLocal(text, duelistId) {
  const synth = globalThis.speechSynthesis;
  if (!synth || !text) return false;
  const profile = VOICES[duelistId] ?? VOICES.yugi;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = profile.rate;
  utter.pitch = profile.pitch;
  const voice = pickVoice(profile);
  if (voice) utter.voice = voice;
  synth.speak(utter);
  return true;
}

async function speakRemote(text, duelistId, fetchImpl) {
  const res = await fetchImpl("/api/voice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, duelist: duelistId }),
  });
  if (!res.ok) throw new Error(`voice ${res.status}`);
  const blob = await res.blob();
  audioEl ??= new Audio();
  audioEl.src = URL.createObjectURL(blob);
  audioEl.volume = 0.9;
  await audioEl.play();
  return true;
}

export async function speak(text, duelistId, { fetchImpl = fetch, muted = false } = {}) {
  if (muted || !text) return false;
  if (remoteOk) {
    try {
      return await speakRemote(text, duelistId, fetchImpl);
    } catch {
      // fall through to the always-available local voice
    }
  }
  return speakLocal(text, duelistId);
}

export function stopVoice() {
  globalThis.speechSynthesis?.cancel?.();
  if (audioEl) { audioEl.pause(); audioEl.currentTime = 0; }
}
