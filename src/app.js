// Orchestration: drives the duel, feeds the cinema, and handles player input.
// The engine decides outcomes; this file only sequences and presents them.

import { getCard } from "./cards/index.js";
import {
  applyAction, createDuel, endTurn, legalActions, respondToTrapWindow, setPhase, trapWindow,
} from "./duel-engine.js";
import { chooseAction, chooseTrapResponse } from "./duel-ai.js";
import { DUELISTS, getMatchup, MATCHUPS } from "./duelists.js";
import { createCinema } from "./cinema/player.js";
import { clearJobs, getCapability, hasClip, planTiers, probeCapability, setReuseMode } from "./cinema/free-video.js";
import { enableRemoteVoice, speak } from "./cinema/realtime-voice.js";
import {
  el, logEvent, renderDuelists, renderHand, renderLifePoints, renderPhase, renderZones,
  resetLifePointTracking,
} from "./render.js";
import { reactionKeyFor } from "./cinema/archetypes.js";
import { buildStoryboard, duelistShot, idleShot, titleShot } from "./cinema/storyboard.js";
import { closingExchange, directBanter, openingExchange } from "./banter.js";
import { summariseDuel } from "./duel-stats.js";
import { drawShareCard, shareFilename, shareText } from "./share-card.js";

const ui = {
  hand: el("hand"), log: el("log"), advance: el("advance-btn"),
  prompt: el("prompt"), promptText: el("prompt-text"), promptActions: el("prompt-actions"),
  hint: el("hand-hint"), modal: el("modal"), modalBody: el("modal-body"),
  skip: el("skip-btn"), resume: el("resume-btn"), stage: el("stage"),
  banter: el("banter"), banterWho: el("banter-who"), banterText: el("banter-text"),
  share: el("share-btn"), shareModal: el("share-modal"), shareCanvas: el("share-canvas"),
  shareCaption: el("share-caption"), shareHint: el("share-hint"),
};

let state = null;
let muted = false;
let busy = false;
let attackFrom = null;
let stalledTicks = 0;
let introShown = false;
let duelEvents = [];

const cinema = createCinema({
  canvas: el("stage"), still: el("stage-still"), video: el("stage-video"),
  caption: {
    root: el("shot-caption"), kind: el("shot-kind"), title: el("shot-title"),
    sub: el("shot-sub"), tier: el("shot-tier"),
  },
  getState: () => state,
  accents: () => {
    if (!state) return ["#4fc9f0", "#4fc9f0"];
    return [DUELISTS[state.sides.player.duelistId].accent, DUELISTS[state.sides.opponent.duelistId].accent];
  },
  onShot: () => renderAll(),
});

// ------------------------------------------------------------- rendering ---

function renderAll() {
  if (!state) return;
  const max = getMatchup(state.matchupId).lifePoints;
  renderDuelists(state);
  renderLifePoints(state, max);
  renderPhase(state.phase);

  const mine = myTurn() ? legalActions(state, "player") : [];
  const attackers = new Set(mine.filter((a) => a.type === "attack").map((a) => a.uid));
  const targets = attackFrom
    ? new Set(mine.filter((a) => a.uid === attackFrom && a.targetUid).map((a) => a.targetUid))
    : new Set();

  renderZones(state, "opponent", el("foe-backrow"), { row: "backrow" });
  renderZones(state, "opponent", el("foe-monsters"), { row: "monsters", targets, onZoneClick: onFoeMonster });
  renderZones(state, "player", el("my-monsters"), { row: "monsters", ready: attackers, onZoneClick: onMyMonster });
  renderZones(state, "player", el("my-backrow"), { row: "backrow" });
  renderHand(state, ui.hand, { actions: mine.filter((a) => a.type !== "attack" && a.type !== "position"), onPlay: onPlayCard });

  updateControls(mine);
}

function updateControls(mine) {
  const over = Boolean(state.winner);
  ui.advance.disabled = busy || over || !myTurn();
  ui.advance.textContent = over ? "Duel over"
    : state.phase === "main1" ? "To Battle Phase" : "End turn";
  ui.skip.hidden = !cinema.busy;
  ui.share.hidden = !over;
  ui.resume.hidden = !(busy || state.activeSide === "opponent") || over;
  ui.hint.textContent = over
    ? `${DUELISTS[state.sides[state.winner].duelistId].name} wins.`
    : !myTurn() ? "Opponent is thinking…"
      : state.phase === "battle"
        ? (attackFrom ? "Pick a target, or click your monster again to cancel." : "Click a glowing monster to attack.")
        : mine.length ? "Click a card to play it." : "Nothing playable — advance the phase.";
}

const myTurn = () => state && state.activeSide === "player" && !state.winner;

// ------------------------------------------------------------ event flow ---

function present(events) {
  duelEvents.push(...events);
  for (const event of events) logEvent(ui.log, event, state);
  const shots = buildStoryboard(events, state);
  if (shots.length) cinema.enqueue(planTiers(shots, { videoBudget: videoBudget() }));
  speakBanter(directBanter(events, state));
  renderAll();
}

// Duelists trade lines over the action rather than narrating it. Queued so a
// reply lands after the line it answers instead of on top of it.
function speakBanter(lines) {
  for (const [i, line] of lines.entries()) {
    setTimeout(() => showBanter(line), i * 1600);
  }
}

// A reaction clip only plays when one is really on disk, and only when the
// cinema is free -- banter punctuates the action, it must not queue behind it.
function playReaction(line) {
  const key = reactionKeyFor(line.situation, line.duelistId);
  if (!key || !hasClip(key) || cinema.busy) return;
  const shot = duelistShot(key, line.duelistId, state, {
    title: DUELISTS[line.duelistId].name, subtitle: line.text, seconds: 4,
  });
  if (shot) cinema.enqueue(planTiers([shot], { videoBudget: 1 }));
}

function showBanter(line) {
  const duelist = DUELISTS[line.duelistId];
  ui.banter.hidden = false;
  ui.banter.style.setProperty("--banter-accent", duelist.accent);
  ui.banterWho.textContent = duelist.name;
  ui.banterText.textContent = line.text;
  // Restart the entry animation even when the strip is already showing.
  ui.banter.classList.remove("banter");
  void ui.banter.offsetWidth;
  ui.banter.classList.add("banter");

  const li = document.createElement("li");
  li.textContent = `${duelist.name}: “${line.text}”`;
  li.classList.add("is-banter");
  li.style.setProperty("--banter-accent", duelist.accent);
  ui.log.prepend(li);
  while (ui.log.children.length > 60) ui.log.lastChild?.remove();

  playReaction(line);
  speak(line.text, line.duelistId, { muted });
  clearTimeout(showBanter.timer);
  showBanter.timer = setTimeout(() => { ui.banter.hidden = true; }, 4200);
}

// A title card with no clip and no way to generate one would play as a blank
// procedural beat, which is worse than not playing it at all.
function playable(shot) {
  if (!shot.clipKey) return true;
  return hasClip(shot.clipKey) || getCapability().video;
}

function videoBudget() {
  const pref = el("tier-select").value;
  if (pref !== "video") return 0;
  if (!getCapability().video) return 0;
  // Reused clips cost nothing after the first generation, so there is no reason
  // to ration them the way a per-shot generation has to be rationed.
  return el("reuse-select").value === "archetype" ? 4 : 2;
}

async function run(mutator) {
  if (busy) return;
  busy = true;
  updateControls([]);
  try {
    const result = mutator();
    state = result.state;
    present(result.events);
    await settle();
    await maybeTrapWindow();
    await maybeOpponentTurn();
  } catch (error) {
    // A thrown turn used to strand the duel on the opponent's side with every
    // control disabled and nothing able to resume it.
    reportSnag(error);
  } finally {
    busy = false;
    renderAll();
  }
}

function reportSnag(error) {
  console.error("duel step failed", error);
  cinema.clear();
  ui.prompt.hidden = true;
  const li = document.createElement("li");
  li.textContent = "The duel hit a snag — recovering. Press Resume if it does not continue.";
  li.classList.add("is-big");
  ui.log.prepend(li);
}

// The cinema is presentation, not gameplay: the engine has already decided the
// outcome. So waiting on it is always bounded -- past the cap, play resumes and
// the remaining shots drain behind the action.
const SETTLE_CAP_MS = 3500;
// A whole opponent turn is several actions; waiting the cap on each one stacks
// up into a long dead interface. Past this budget the duel keeps resolving and
// the cinema simply narrates from slightly behind.
const TURN_BUDGET_MS = 4000;

function settle(capMs = SETTLE_CAP_MS) {
  return new Promise((done) => {
    const deadline = Date.now() + capMs;
    const tick = () => {
      if (!cinema.busy) return done();
      if (Date.now() > deadline) { cinema.skip({ all: true }); return done(); }
      setTimeout(tick, 100);
    };
    tick();
  });
}

async function maybeTrapWindow() {
  while (state.pending?.kind === "trapWindow") {
    if (state.pending.side === "player") {
      const choice = await askTrap(state.pending);
      const result = respondToTrapWindow(state, choice);
      state = result.state;
      present(result.events);
    } else {
      const choice = chooseTrapResponse(state, Math.random);
      const result = respondToTrapWindow(state, choice);
      state = result.state;
      present(result.events);
    }
    await settle();
  }
}

async function maybeOpponentTurn() {
  const deadline = Date.now() + TURN_BUDGET_MS;
  let guard = 0;
  while (!state.winner && state.activeSide === "opponent" && guard < 60) {
    guard += 1;
    await maybeTrapWindow();
    if (state.winner) break;

    const action = chooseAction(state, "opponent", Math.random);
    const step = action ? applyAction(state, action)
      : state.phase === "main1" ? setPhase(state, "battle")
        : endTurn(state);
    state = step.state;
    present(step.events);

    // Inside the budget, let each beat play. Past it, keep resolving and let the
    // queued shots catch up on their own rather than freezing the interface.
    const left = deadline - Date.now();
    if (left > 0) await settle(Math.min(left, SETTLE_CAP_MS));
    else await Promise.resolve();
  }
  await maybeTrapWindow();
  if (state.winner) announceWinner();
}

// If the duel is left on the opponent's side with nothing running, no click the
// player can make will move it. The watchdog notices and picks the turn back up.
function startWatchdog() {
  setInterval(() => {
    if (busy || !state || state.winner) return;
    const stalled = state.activeSide === "opponent" || state.pending;
    if (!stalled) return;
    stalledTicks += 1;
    if (stalledTicks < 2) return;
    stalledTicks = 0;
    resume();
  }, 2500);
}

function resume() {
  if (busy || !state || state.winner) return;
  cinema.skip({ all: true });
  ui.prompt.hidden = true;
  run(() => ({ state, events: [] }));
}

function advance(phase) {
  const result = setPhase(state, phase);
  state = result.state;
  present(result.events);
}

// ------------------------------------------------------------- share card ---

function openShareCard() {
  const stats = summariseDuel(duelEvents, state);
  drawShareCard(ui.shareCanvas, stats);
  ui.shareCaption.textContent = shareText(stats);
  ui.shareHint.textContent = "";
  ui.shareHint.classList.remove("is-warn");
  // Sharing a file is only offered where the browser will actually take one.
  ui.shareModal.hidden = false;
  const canShareFiles = Boolean(navigator.canShare?.({ files: [testFile()] }));
  el("share-send").hidden = !canShareFiles;
}

// navigator.canShare needs a real File to answer honestly.
const testFile = () => new File([new Uint8Array(1)], "probe.png", { type: "image/png" });

const cardBlob = () =>
  new Promise((done) => ui.shareCanvas.toBlob(done, "image/png"));

function shareNote(text, warn = false) {
  ui.shareHint.textContent = text;
  ui.shareHint.classList.toggle("is-warn", warn);
}

async function sendShare() {
  const stats = summariseDuel(duelEvents, state);
  const blob = await cardBlob();
  const file = new File([blob], shareFilename(stats), { type: "image/png" });
  try {
    await navigator.share({ files: [file], text: shareText(stats), title: "Duel Live" });
  } catch (error) {
    if (error?.name !== "AbortError") shareNote("Sharing was refused by the browser.", true);
  }
}

async function copyImage() {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": await cardBlob() })]);
    shareNote("Image copied — paste it anywhere.");
  } catch {
    shareNote("This browser blocks image copying. Right-click the card to save it.", true);
  }
}

async function copyCardText() {
  try {
    await navigator.clipboard.writeText(shareText(summariseDuel(duelEvents, state)));
    shareNote("Text copied.");
  } catch {
    shareNote("Copying was blocked. Select the caption instead.", true);
  }
}

// A sandboxed page cannot start its own download, so say so plainly rather than
// handing over a link that silently does nothing.
async function downloadCard() {
  const stats = summariseDuel(duelEvents, state);
  const url = URL.createObjectURL(await cardBlob());
  const link = document.createElement("a");
  link.href = url;
  link.download = shareFilename(stats);
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  shareNote("Saved. If nothing downloaded, right-click the card and save the image.");
}

function announceWinner() {
  cinema.setIdle(null);
  const duelist = DUELISTS[state.sides[state.winner].duelistId];
  ui.hint.textContent = `${duelist.name} wins — ${state.winReason === "deckout" ? "deck out" : "0 LP"}.`;
  speakBanter(closingExchange(state));
  const outro = titleShot("outro", state);
  if (playable(outro)) cinema.enqueue(planTiers([outro], { videoBudget: 1 }));
}

// ----------------------------------------------------------------- input ---

function onPlayCard(inst, options) {
  if (busy || !myTurn()) return;
  if (options.length === 1) return void run(() => applyAction(state, options[0]));
  askChoice(`${getCard(inst.cardId).name} — how do you want to play it?`, options.map((action) => ({
    label: action.label, value: action,
  }))).then((action) => { if (action) run(() => applyAction(state, action)); });
}

function onMyMonster(inst) {
  if (busy || !myTurn() || state.phase !== "battle") return;
  const options = legalActions(state, "player").filter((a) => a.type === "attack" && a.uid === inst.uid);
  if (!options.length) return;
  if (attackFrom === inst.uid) { attackFrom = null; renderAll(); return; }
  const direct = options.find((a) => !a.targetUid);
  if (direct) return void run(() => applyAction(state, direct));
  attackFrom = inst.uid;
  renderAll();
}

function onFoeMonster(inst) {
  if (busy || !attackFrom) return;
  const action = legalActions(state, "player")
    .find((a) => a.type === "attack" && a.uid === attackFrom && a.targetUid === inst.uid);
  attackFrom = null;
  if (action) run(() => applyAction(state, action));
  else renderAll();
}

function askChoice(question, choices) {
  return new Promise((done) => {
    ui.prompt.hidden = false;
    ui.promptText.textContent = question;
    ui.promptActions.innerHTML = "";
    for (const choice of [...choices, { label: "Cancel", value: null }]) {
      const button = document.createElement("button");
      button.className = "btn";
      button.type = "button";
      button.textContent = choice.label;
      button.addEventListener("click", () => { ui.prompt.hidden = true; done(choice.value); });
      ui.promptActions.append(button);
    }
  });
}

function askTrap(pending) {
  const options = pending.options.map((uid) => {
    const inst = state.sides.player.backrow.find((c) => c && c.uid === uid);
    return { label: `Activate ${getCard(inst.cardId).name}`, value: uid };
  });
  return askChoice("Your opponent is attacking. Respond?", options);
}

// ------------------------------------------------------------- lifecycle ---

function startDuel(requested) {
  const matchupId = getMatchup(requested) ? requested : Object.keys(MATCHUPS)[0];
  el("matchup-select").value = matchupId;
  cinema.clear();
  clearJobs();
  resetLifePointTracking();
  attackFrom = null;
  ui.log.innerHTML = "";
  ui.prompt.hidden = true;
  duelEvents = [];
  ui.share.hidden = true;
  state = createDuel(matchupId, { seed: Date.now() });
  cinema.setIdle(idleShot(state));
  ui.banter.hidden = true;
  // Intro plays once per session; the versus plate opens every duel.
  const openings = ["player", "opponent"]
    .map((side) => state.sides[side].duelistId)
    .filter((id) => hasClip(`open-${id}`))
    .map((id) => duelistShot(`open-${id}`, id, state, { subtitle: "takes the field", seconds: 5 }));
  const opening = [
    introShown ? null : titleShot("intro", state),
    titleShot("versus", state),
    ...openings,
  ].filter(Boolean).filter(playable);
  introShown = true;
  cinema.enqueue(planTiers(opening, { videoBudget: opening.length }));
  logEvent(ui.log, { type: "phase", phase: "draw", side: "player", turn: 1 }, state);
  speakBanter(openingExchange(state));
  renderAll();
}

function bind() {
  ui.advance.addEventListener("click", () => {
    if (busy || !myTurn()) return;
    if (state.phase === "main1") { advance("battle"); renderAll(); return; }
    attackFrom = null;
    run(() => endTurn(state));
  });
  el("restart-btn").addEventListener("click", () => startDuel(el("matchup-select").value));
  el("matchup-select").addEventListener("change", (e) => startDuel(e.target.value));
  el("tier-select").addEventListener("change", (e) => cinema.setTier(e.target.value));
  el("reuse-select").addEventListener("change", (e) => { setReuseMode(e.target.value); clearJobs(); });
  el("sound-btn").addEventListener("click", (e) => {
    muted = !muted;
    cinema.setMuted(muted);
    e.target.textContent = muted ? "Voice off" : "Voice on";
    e.target.setAttribute("aria-pressed", String(!muted));
  });
  ui.skip.addEventListener("click", () => { cinema.skip(); renderAll(); });
  ui.resume.addEventListener("click", resume);
  ui.share.addEventListener("click", openShareCard);
  el("share-send").addEventListener("click", sendShare);
  el("share-copy").addEventListener("click", copyImage);
  el("share-copy-text").addEventListener("click", copyCardText);
  el("share-download").addEventListener("click", downloadCard);
  el("share-close").addEventListener("click", () => { ui.shareModal.hidden = true; });
  ui.shareModal.addEventListener("click", (e) => {
    if (e.target === ui.shareModal) ui.shareModal.hidden = true;
  });
  ui.stage.addEventListener("click", () => { if (cinema.busy) { cinema.skip(); renderAll(); } });
  document.addEventListener("keydown", (e) => {
    if (e.key === " " && cinema.busy) { e.preventDefault(); cinema.skip(); renderAll(); }
    if (e.key === "Escape") { ui.modal.hidden = true; ui.shareModal.hidden = true; }
  });
  el("rules-btn").addEventListener("click", showRules);
  el("modal-close").addEventListener("click", () => { ui.modal.hidden = true; });
  ui.modal.addEventListener("click", (e) => { if (e.target === ui.modal) ui.modal.hidden = true; });
  ui.modal.hidden = true;
  ui.shareModal.hidden = true;
}

function showRules() {
  const cap = getCapability();
  ui.modalBody.innerHTML = `
    <p>A simplified but real duel: 8000 Life Points, one Normal Summon per turn,
    tributes for Level 5+, Attack and Defence positions, Fusion Summons, and set
    Spells and Traps that fire when you are attacked.</p>
    <h3>Your turn</h3>
    <ul>
      <li>Main Phase — click a card in hand to summon, set, or activate it.</li>
      <li>Battle Phase — click a glowing monster, then an enemy monster, or attack directly.</li>
      <li>End turn to pass. Hand limit is 6.</li>
    </ul>
    <h3>Cinema tiers</h3>
    <ul>
      <li><code>procedural</code> — canvas holograms. No key, no network, instant.</li>
      <li><code>still</code> — AI key art, animated. ${cap.still ? "available" : "offline"}.</li>
      <li><code>video</code> — AI video clips. ${cap.video ? "available" : "needs a free key in .env.local"}.</li>
    </ul>
    <p>Higher tiers are prefetched while the procedural shot plays, so the duel
    never waits on a generator.</p>`;
  ui.modal.hidden = false;
}

async function boot() {
  bind();
  cinema.start();
  startWatchdog();
  startDuel(el("matchup-select").value);
  const cap = await probeCapability();
  enableRemoteVoice(cap.voice);
  setReuseMode(el("reuse-select").value);
  if (cap.providers?.length) {
    el("provider-note").textContent = `${cap.providers.map((p) => p.label).join(" → ")} · ${cap.quality}p`;
    el("provider-note").hidden = false;
  }
  const option = el("tier-select").querySelector('option[value="video"]');
  if (cap.video) {
    const left = cap.videoClipsLeft;
    option.textContent = left === null ? "Auto (best free tier)" : `Auto (video — ${left} free clips left)`;
  } else if (!cap.still) {
    // No backend at all — the single-file build opened straight from disk.
    option.textContent = "Procedural (no server — runs fully offline)";
    ui.hint.dataset.offline = "true";
  } else {
    option.textContent = cap.keyPresent
      ? "Auto (stills — out of free video pollen)"
      : "Auto (stills — add a free key for video)";
  }
}

boot();
