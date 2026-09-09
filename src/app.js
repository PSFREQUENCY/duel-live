// Orchestration: drives the duel, feeds the cinema, and handles player input.
// The engine decides outcomes; this file only sequences and presents them.

import { getCard } from "./cards/index.js";
import {
  applyAction, createDuel, endTurn, legalActions, positionBlockedBecause,
  respondToChain, respondToDiscard, respondToTarget, respondToTribute,
  setPhase, tributesCover,
} from "./duel-engine.js";
import { legalResponses, resolutionOrder } from "./duel-chain.js";
import { nextPhases, PHASE_LABELS } from "./duel-phases.js";
import { chooseAction, chooseChainResponse, chooseTargets, chooseTributes } from "./duel-ai.js";
import { DUELISTS, getMatchup, MATCHUPS } from "./duelists.js";
import { createCinema } from "./cinema/player.js";
import { clearJobs, getCapability, hasClip, planTiers, probeCapability, setClipMode } from "./cinema/free-video.js";
import { enableRemoteVoice, speak } from "./cinema/realtime-voice.js";
import {
  el, logEvent, renderDuelists, renderHand, renderLifePoints, renderPhase, renderZones,
  resetLifePointTracking,
} from "./render.js";
import { reactionKeyFor } from "./cinema/archetypes.js";
import { buildStoryboard, duelistShot, idleShot, titleShot } from "./cinema/storyboard.js";
import { closingExchange, directBanter, openingExchange } from "./banter.js";
import { createHoverPanel, showGraveyard } from "./inspect.js";
import { activeEffects } from "./duel-effects-active.js";
import { summariseDuel } from "./duel-stats.js";
import { DEFAULT_FORMAT, drawShareCard, getFormat, shareFilename, shareText } from "./share-card.js";

const ui = {
  hand: el("hand"), log: el("log"), advance: el("advance-btn"),
  prompt: el("prompt"), promptText: el("prompt-text"), promptActions: el("prompt-actions"),
  hint: el("hand-hint"), modal: el("modal"), modalBody: el("modal-body"),
  skip: el("skip-btn"), resume: el("resume-btn"), stage: el("stage"),
  banter: el("banter"), banterWho: el("banter-who"), banterText: el("banter-text"),
  effects: el("effect-rail"), chain: el("chain-rail"),
  share: el("share-btn"), shareModal: el("share-modal"), shareCanvas: el("share-canvas"),
  shareCaption: el("share-caption"), shareHint: el("share-hint"),
};

let state = null;
let muted = false;
let busy = false;
let attackFrom = null;
let tributePicks = [];
let stalledTicks = 0;
let introShown = false;
let duelEvents = [];
let cardFormat = DEFAULT_FORMAT;

const hover = createHoverPanel();

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
  hover.hide();
  const max = getMatchup(state.matchupId).lifePoints;
  renderDuelists(state);
  renderLifePoints(state, max);
  renderPhase(state.phase, { locked: lockedPhases() });
  renderPhaseNote();

  const mine = myTurn() ? legalActions(state, "player") : [];
  // Monsters you can act on right now: attack in the Battle Phase, reposition
  // in the Main Phase. Both get the same "ready" highlight.
  const attackers = new Set(mine.filter((a) => a.type === "attack").map((a) => a.uid));
  const actionable = state.phase === "battle" ? attackers : repositionable(mine);
  const targets = attackFrom
    ? new Set(mine.filter((a) => a.uid === attackFrom && a.targetUid).map((a) => a.targetUid))
    : new Set();
  const choosingTributes = state.pending?.kind === "tribute" && state.pending.side === "player";
  const tributeReady = choosingTributes ? new Set(state.pending.options) : null;

  const onZoneHover = (inst, side, zone) => hover.inspect(inst, side, zone, state);
  renderZones(state, "opponent", el("foe-backrow"), { row: "backrow", onZoneHover });
  renderZones(state, "opponent", el("foe-monsters"), { row: "monsters", targets, onZoneClick: onFoeMonster, onZoneHover });
  renderZones(state, "player", el("my-monsters"), {
    row: "monsters",
    ready: tributeReady ?? actionable,
    targets: choosingTributes ? new Set(tributePicks) : new Set(),
    onZoneClick: onMyMonster, onZoneHover,
  });
  renderZones(state, "player", el("my-backrow"), { row: "backrow", onZoneHover });
  renderHand(state, ui.hand, { actions: mine.filter((a) => a.type !== "attack" && a.type !== "position"), onPlay: onPlayCard });

  renderEffects();
  updateControls(mine);
}

// Continuing effects are the only rules a player cannot see on the board, so
// each one gets a chip with its remaining turns.
function renderEffects() {
  const effects = activeEffects(state, "player");
  ui.effects.innerHTML = "";
  for (const effect of effects) {
    const chip = document.createElement("li");
    chip.className = `effect-chip ${effect.against ? "is-against" : "is-favour"}`;
    chip.title = effect.detail;

    const count = document.createElement("span");
    count.className = `effect-count${effect.turnsLeft === null ? " is-open" : ""}`;
    count.textContent = effect.turnsLeft === null ? "∞" : String(effect.turnsLeft);
    count.setAttribute("aria-label", effect.turnsLeft === null
      ? "lasts until removed" : `${effect.turnsLeft} turns remaining`);

    const text = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = effect.label;
    text.append(name, document.createTextNode(effect.detail));

    chip.append(count, text);
    ui.effects.append(chip);
  }
}

// Monsters that can change position right now, by uid.
const repositionable = (actions) =>
  new Set(actions.filter((a) => a.type === "position").map((a) => a.uid));

function updateControls(mine) {
  const over = Boolean(state.winner);
  const step = nextStep();
  ui.advance.disabled = busy || over || !myTurn() || !step;
  ui.advance.textContent = over ? "Duel over" : (step?.label ?? "End turn");
  ui.skip.hidden = !cinema.busy;
  ui.share.hidden = !over;
  ui.resume.hidden = !(busy || state.activeSide === "opponent") || over;
  ui.hint.textContent = over
    ? `${DUELISTS[state.sides[state.winner].duelistId].name} wins.`
    : !myTurn() ? "Opponent is thinking…"
      : state.phase === "battle"
        ? (attackFrom ? "Pick a target, or click your monster again to cancel." : "Click a glowing monster to attack.")
        : repositionable(mine).size
          ? "Click a card to play it, or a glowing monster to change its position."
          : mine.length ? "Click a card to play it." : "Nothing playable — advance the phase.";
}

const myTurn = () => state && state.activeSide === "player" && !state.winner;

// The next phase the player may move to, read from the transition table so the
// button can never offer a move the engine would refuse.
// Main 2 is unreachable once the Battle Phase has been skipped, and there is no
// Battle Phase at all on turn 1.
function lockedPhases() {
  if (!state) return [];
  const locked = [];
  if (state.phase === "main1" && !nextPhases(state).some((e) => e.to === "battle" && e.allowed)) {
    locked.push("battle", "main2");
  } else if (state.phase === "end" || state.phase === "main2") {
    // nothing further to lock
  } else if (state.phase === "main1") {
    locked.push("main2");
  }
  return locked;
}

function renderPhaseNote() {
  const note = el("phase-note");
  if (!state || state.winner) { note.textContent = ""; return; }
  if (!myTurn()) { note.textContent = "Opponent's turn."; return; }
  const legal = legalActions(state, "player");
  const kinds = new Set(legal.map((a) => a.type));
  const parts = [];
  if (kinds.has("summon") || kinds.has("set")) parts.push("summon or set a monster");
  if (kinds.has("activate")) parts.push("activate a card");
  if (kinds.has("setBackrow")) parts.push("set a spell or trap");
  if (kinds.has("position")) parts.push("change a monster's position");
  if (kinds.has("attack")) parts.push("declare an attack");
  note.textContent = parts.length
    ? `You may ${parts.join(", ")}.`
    : "Nothing to do here — advance the phase.";
}

function nextStep() {
  if (!state) return null;
  const edges = nextPhases(state).filter((edge) => edge.allowed);
  const forward = edges.find((edge) => edge.to !== "draw");
  if (!forward) return { to: "draw", label: "End turn", endsTurn: true };
  return { ...forward, label: forward.to === "end" ? "To End Phase" : `To ${PHASE_LABELS[forward.to]}` };
}

// A click that legitimately does nothing still has to say why, or the game
// looks broken. Restores whatever the hint line was showing afterwards.
function flashTemporaryMessage(text, ms = 2600) {
  clearTimeout(flashTemporaryMessage.timer);
  ui.hint.textContent = text;
  ui.hint.classList.add("is-flash");
  flashTemporaryMessage.timer = setTimeout(() => {
    ui.hint.classList.remove("is-flash");
    renderAll();
  }, ms);
}

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
  // A library clip costs nothing after the first generation, so there is no
  // reason to ration it the way a per-shot generation has to be rationed.
  return el("clip-mode-select").value === "library" ? 4 : 2;
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
    await maybePending();
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

async function maybePending() {
  while (state.pending?.kind === "discard") {
    const uids = state.pending.side === "player"
      ? await askDiscard(state.pending)
      : state.sides[state.pending.side].hand.slice(0, state.pending.need).map((c) => c.uid);
    const result = respondToDiscard(state, uids);
    state = result.state;
    present(result.events);
    await settle();
  }
  while (state.pending?.kind === "target") {
    const answer = state.pending.side === "player"
      ? await askTargets(state.pending)
      : { uids: chooseTargets(state), position: "attack" };
    const result = respondToTarget(state, answer.uids, { position: answer.position });
    state = result.state;
    present(result.events);
    await settle();
  }
  while (state.pending?.kind === "tribute") {
    if (state.pending.side === "player") {
      const uids = await askTributes(state.pending);
      const result = respondToTribute(state, uids);
      state = result.state;
      present(result.events);
    } else {
      const result = respondToTribute(state, chooseTributes(state));
      state = result.state;
      present(result.events);
    }
    await settle();
  }
  await maybeTrapWindow();
}

async function maybeTrapWindow() {
  let guard = 0;
  while (state.pending?.kind === "chain" && guard < 20) {
    guard += 1;
    renderChain();
    const choice = state.pending.side === "player"
      ? await askChainResponse(state)
      : chooseChainResponse(state, Math.random);
    const result = respondToChain(state, choice);
    state = result.state;
    present(result.events);
    await settle();
  }
  renderChain();
}

// A chain resolves backwards, which is the least intuitive rule in the game.
// Showing the links, and lighting them up in resolution order, is the whole
// reason it is legible.
function renderChain() {
  const rail = ui.chain;
  const chain = state?.chain;
  if (!chain?.links.length) { rail.hidden = true; rail.innerHTML = ""; return; }
  rail.hidden = false;
  rail.innerHTML = "";
  chain.links.forEach((link, i) => {
    const node = document.createElement("li");
    node.className = `chain-link is-${link.controller}`;
    node.innerHTML = "";
    const index = document.createElement("span");
    index.className = "chain-index";
    index.textContent = String(i + 1);
    const name = document.createElement("span");
    name.textContent = link.name;
    node.append(index, name);
    node.title = `Chain Link ${i + 1} · Spell Speed ${link.spellSpeed}`;
    rail.append(node);
  });
}

function askChainResponse(current) {
  const options = legalResponses(current, "player");
  if (!options.length) return Promise.resolve(null);
  const links = current.chain?.links.length ?? 0;
  const question = links
    ? `Chain Link ${links + 1}? Your opponent played ${current.chain.links.at(-1).name}.`
    : "Respond?";
  return askChoice(question, options.map((option) => ({
    label: `Activate ${option.name} (Spell Speed ${option.spellSpeed})`,
    value: option.uid,
  })));
}

async function maybeOpponentTurn() {
  const deadline = Date.now() + TURN_BUDGET_MS;
  let guard = 0;
  while (!state.winner && state.activeSide === "opponent" && guard < 60) {
    guard += 1;
    await maybePending();
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
  await maybePending();
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

function renderCard() {
  const stats = summariseDuel(duelEvents, state);
  drawShareCard(ui.shareCanvas, stats, cardFormat);
  for (const id of ["landscape", "portrait"]) {
    const button = el(`format-${id}`);
    button.classList.toggle("is-on", id === cardFormat);
    button.setAttribute("aria-pressed", String(id === cardFormat));
  }
  return stats;
}

function setFormat(id) {
  if (cardFormat === id) return;
  cardFormat = id;
  renderCard();
  shareNote(`Switched to ${getFormat(id).label}.`);
}

function openShareCard() {
  const stats = renderCard();
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
  const file = new File([blob], shareFilename(stats, cardFormat), { type: "image/png" });
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

// When the page is hosted, a plain download link is inert -- the host mediates
// saving through a capability instead. Resolved once, since it can take a moment
// to answer and answers `null` when this view cannot save at all.
let downloadsReady = null;
async function downloads() {
  downloadsReady ??= globalThis.claude?.use?.("downloads") ?? Promise.resolve(null);
  return downloadsReady;
}

const DOWNLOAD_MESSAGE = {
  declined: ["Save cancelled.", true],
  rate_limited: ["A save prompt is already open — try again in a moment.", true],
  too_large: ["That file was too large for the chosen destination.", true],
};

async function downloadCard() {
  const stats = summariseDuel(duelEvents, state);
  const filename = shareFilename(stats, cardFormat);
  const blob = await cardBlob();

  const host = await downloads();
  if (host) {
    try {
      await host.save({ filename, data: blob });
      shareNote("Saved.");
    } catch (error) {
      const [text, warn] = DOWNLOAD_MESSAGE[error?.code]
        ?? ["Saving is not available here — right-click the card to save it.", true];
      shareNote(text, warn);
    }
    return;
  }

  // Local build: an ordinary link is fine and needs no permission.
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  shareNote("Saved. If nothing downloaded, right-click the card to save the image.");
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
  // Choosing tributes takes over clicks on your own field until it is answered.
  if (state?.pending?.kind === "tribute" && state.pending.side === "player") {
    toggleTribute(inst);
    return;
  }
  if (busy || !myTurn()) return;
  const actions = legalActions(state, "player");

  // In the Main Phase your own monsters are for repositioning -- this is the
  // only way to turn a set monster face-up so it can attack.
  if (state.phase === "main1") {
    const change = actions.find((a) => a.type === "position" && a.uid === inst.uid);
    if (change) { run(() => applyAction(state, change)); return; }
    const why = positionBlockedBecause(inst);
    if (why) flashTemporaryMessage(`Can't change position — ${why}.`);
    return;
  }
  if (state.phase !== "battle") return;

  const options = actions.filter((a) => a.type === "attack" && a.uid === inst.uid);
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

// One picker for every card that points somewhere: Brain Control, Monster
// Reborn, Shrink, the equips, De-Spell, Graceful Charity's discard. The options
// come from the engine, so the list can never offer an illegal target.
function askTargets(pending) {
  return new Promise((done) => {
    const picks = [];
    const finish = (uids, position = "attack") => {
      ui.prompt.hidden = true; renderAll(); done({ uids, position });
    };
    const paint = () => {
      ui.prompt.hidden = false;
      ui.promptText.textContent = `${pending.card} — ${pending.prompt}`
        + (pending.need > 1 ? ` (${picks.length} of ${pending.need})` : "");
      ui.promptActions.innerHTML = "";

      for (const option of pending.options) {
        const button = document.createElement("button");
        button.className = "btn";
        button.type = "button";
        const chosen = picks.includes(option.uid);
        button.textContent = `${chosen ? "✓ " : ""}${option.name} — ${option.detail}`
          + (option.where === "graveyard" ? " · GY" : option.where === "hand" ? " · hand" : "");
        button.addEventListener("click", () => {
          if (chosen) picks.splice(picks.indexOf(option.uid), 1);
          else if (picks.length < pending.need) picks.push(option.uid);
          // A special summon still has a position to choose, so never skip
          // straight to resolving.
          if (picks.length === pending.need && pending.need === 1 && !pending.choosePosition) {
            finish(picks.slice());
          } else paint();
        });
        ui.promptActions.append(button);
      }
      const ready = pending.optional || picks.length === pending.need;
      if (pending.choosePosition) {
        for (const [text, position] of [
          ["Summon in Attack Position", "attack"],
          ["Summon in Defence Position", "defense"],
        ]) {
          const button = document.createElement("button");
          button.className = "btn btn-accent";
          button.type = "button";
          button.textContent = text;
          button.disabled = !ready;
          button.addEventListener("click", () => finish(picks.slice(), position));
          ui.promptActions.append(button);
        }
      } else if (pending.need > 1 || pending.optional) {
        const confirm = document.createElement("button");
        confirm.className = "btn btn-accent";
        confirm.type = "button";
        confirm.textContent = "Confirm";
        confirm.disabled = !ready;
        confirm.addEventListener("click", () => finish(picks.slice()));
        ui.promptActions.append(confirm);
      }
    };
    paint();
  });
}

function askTributes(pending) {
  return new Promise((done) => {
    tributePicks = [];
    const finish = (uids) => { tributePicks = []; ui.prompt.hidden = true; renderAll(); done(uids); };
    const paint = () => {
      const enough = tributesCover(state, "player", tributePicks, pending.need);
      ui.prompt.hidden = false;
      ui.promptText.textContent =
        `Summoning ${pending.card}. Click ${pending.need} monster${pending.need > 1 ? "s" : ""} `
        + `on your field to tribute — ${tributePicks.length} chosen.`;
      ui.promptActions.innerHTML = "";
      for (const [text, value, enabled] of [
        ["Tribute and summon", tributePicks.slice(), enough],
        ["Let the game choose", chooseTributes(state), true],
        ["Cancel", null, true],
      ]) {
        const button = document.createElement("button");
        button.className = "btn";
        button.type = "button";
        button.textContent = text;
        button.disabled = !enabled;
        if (enabled) button.addEventListener("click", () => finish(value));
        ui.promptActions.append(button);
      }
      renderAll();
    };
    askTributes.repaint = paint;
    paint();
  });
}

function toggleTribute(inst) {
  const pending = state.pending;
  if (!pending || pending.kind !== "tribute" || !pending.options.includes(inst.uid)) return;
  tributePicks = tributePicks.includes(inst.uid)
    ? tributePicks.filter((uid) => uid !== inst.uid)
    : [...tributePicks, inst.uid];
  askTributes.repaint?.();
}

function askDiscard(pending) {
  return new Promise((done) => {
    const picks = [];
    const paint = () => {
      ui.prompt.hidden = false;
      ui.promptText.textContent =
        `Hand limit is 6. Choose ${pending.need} card${pending.need > 1 ? "s" : ""} to discard `
        + `— ${picks.length} chosen.`;
      ui.promptActions.innerHTML = "";
      for (const uid of pending.options) {
        const inst = state.sides.player.hand.find((c) => c.uid === uid);
        if (!inst) continue;
        const button = document.createElement("button");
        button.className = "btn";
        button.type = "button";
        const chosen = picks.includes(uid);
        button.textContent = `${chosen ? "✓ " : ""}${getCard(inst.cardId).name}`;
        button.addEventListener("click", () => {
          if (chosen) picks.splice(picks.indexOf(uid), 1);
          else if (picks.length < pending.need) picks.push(uid);
          paint();
        });
        ui.promptActions.append(button);
      }
      const confirm = document.createElement("button");
      confirm.className = "btn btn-accent";
      confirm.type = "button";
      confirm.textContent = "Discard";
      confirm.disabled = picks.length !== pending.need;
      confirm.addEventListener("click", () => { ui.prompt.hidden = true; done(picks.slice()); });
      ui.promptActions.append(confirm);
    };
    paint();
  });
}

function askTrap(pending) {
  const options = pending.options.map((uid) => {
    const inst = state.sides.player.backrow.find((c) => c && c.uid === uid);
    return { label: `Activate ${getCard(inst.cardId).name}`, value: uid };
  });
  const question = pending.trigger === "onSummon"
    ? `${summonedName(pending)} was summoned. Respond?`
    : "Your opponent is attacking. Respond?";
  return askChoice(question, options);
}

function summonedName(pending) {
  const { summonedSide, summonedUid } = pending.resume ?? {};
  const inst = state.sides[summonedSide]?.monsters.find((m) => m && m.uid === summonedUid);
  return inst ? getCard(inst.cardId).name : "A monster";
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
    const step = nextStep();
    if (!step) return;
    attackFrom = null;
    if (step.endsTurn) { run(() => endTurn(state)); return; }
    // Moving through phases is not a turn action, so it does not run the
    // opponent -- except entering the End Phase, which hands the turn over.
    if (step.to === "end") { advance("end"); run(() => endTurn(state)); return; }
    advance(step.to);
    renderAll();
  });
  el("restart-btn").addEventListener("click", () => startDuel(el("matchup-select").value));
  el("matchup-select").addEventListener("change", (e) => startDuel(e.target.value));
  el("tier-select").addEventListener("change", (e) => cinema.setTier(e.target.value));
  el("clip-mode-select").addEventListener("change", (e) => { setClipMode(e.target.value); clearJobs(); });
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
  el("format-landscape").addEventListener("click", () => setFormat("landscape"));
  el("format-portrait").addEventListener("click", () => setFormat("portrait"));
  ui.shareModal.addEventListener("click", (e) => {
    if (e.target === ui.shareModal) ui.shareModal.hidden = true;
  });
  ui.stage.addEventListener("click", () => { if (cinema.busy) { cinema.skip(); renderAll(); } });
  document.addEventListener("keydown", (e) => {
    if (e.key === " " && cinema.busy) { e.preventDefault(); cinema.skip(); renderAll(); }
    if (e.key === "Escape") {
      ui.modal.hidden = true;
      ui.shareModal.hidden = true;
      el("graveyard-modal").hidden = true;
      hover.hide();
    }
  });
  for (const id of ["me-gy", "foe-gy"]) {
    el(id).addEventListener("click", () => { if (state) showGraveyard(state); });
  }
  el("graveyard-close").addEventListener("click", () => { el("graveyard-modal").hidden = true; });
  el("graveyard-modal").addEventListener("click", (e) => {
    if (e.target === el("graveyard-modal")) el("graveyard-modal").hidden = true;
  });
  el("rules-btn").addEventListener("click", showRules);
  el("modal-close").addEventListener("click", () => { ui.modal.hidden = true; });
  ui.modal.addEventListener("click", (e) => { if (e.target === ui.modal) ui.modal.hidden = true; });
  ui.modal.hidden = true;
  ui.shareModal.hidden = true;
  el("graveyard-modal").hidden = true;
}

function showRules() {
  const cap = getCapability();
  ui.modalBody.innerHTML = `
    <p>A simplified but real duel: 8000 Life Points, one Normal Summon per turn,
    tributes for Level 5+, Attack and Defence positions, Fusion Summons, and set
    Spells and Traps that fire when you are attacked.</p>
    <h3>Your turn</h3>
    <ul>
      <li>Main Phase — click a card in hand to play it, or a glowing monster on
      your field to change its position. A monster changes position once per
      turn, and flipping a set monster face-up puts it in Attack Position so it
      can attack that turn.</li>
      <li>Hover any card on the field to read it. Click a GY counter to see both
      Graveyards and what Monster Reborn would revive.</li>
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
  setClipMode(el("clip-mode-select").value);
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
