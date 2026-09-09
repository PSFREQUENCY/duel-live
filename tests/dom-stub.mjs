// A DOM stub with just enough surface for src/app.js to run its real boot path.
// Used by the integration test and by `npm run smoke`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const phases = [...html.matchAll(/data-phase="([^"]+)"/g)].map((m) => m[1]);

const listeners = new Map();
const nodeSetInterval = globalThis.setInterval;

const ctx2d = new Proxy({}, {
  get: (_, prop) => {
    if (prop === "createLinearGradient" || prop === "createRadialGradient") {
      return () => ({ addColorStop() {} });
    }
    if (prop === "canvas") return { width: 1280, height: 720 };
    return () => {};
  },
  set: () => true,
});

function makeNode(id = "") {
  const node = {
    id, hidden: true, disabled: false, textContent: "", value: "",
    src: "", loop: false, width: 1280, height: 720, dataset: {},
    style: { setProperty() {}, background: "", width: "" },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    children: [], offsetWidth: 0,
    getContext: () => ctx2d,
    append(...kids) { node.children.push(...kids); },
    prepend(...kids) { node.children.unshift(...kids); },
    remove() {
      for (const parent of [...nodes.values()]) {
        const i = parent.children.indexOf(node);
        if (i >= 0) parent.children.splice(i, 1);
      }
    },
    setAttribute() {}, getAttribute: () => null,
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100 }),
    handlers: new Map(),
    addEventListener(type, fn) {
      node.handlers.set(type, fn);
      // Keep the by-id index too, so tests can fire on a named control.
      if (id) listeners.set(`${id}:${type}`, fn);
    },
    // Real elements are clickable; without this a test can only drive controls
    // that happen to carry an id, which is not how a player uses the page.
    click(event = {}) { return node.handlers.get("click")?.({ target: node, ...event }); },
    querySelector: () => makeNode(), querySelectorAll: () => [],
    play: async () => {}, pause() {},
  };
  // Setting innerHTML must actually drop the children, or a test ends up
  // clicking buttons from a render that no longer exists.
  Object.defineProperty(node, "lastChild", { get: () => node.children.at(-1) ?? null });
  let markup = "";
  Object.defineProperty(node, "innerHTML", {
    get: () => markup,
    set(value) { markup = String(value); if (!markup) node.children.length = 0; },
  });
  return node;
}

const nodes = new Map(ids.map((id) => [id, makeNode(id)]));
// A real <select> reports its first <option> value before any interaction.
for (const [, id, inner] of html.matchAll(/<select id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
  const first = inner.match(/value="([^"]+)"/);
  if (first && nodes.has(id)) nodes.get(id).value = first[1];
}
const phaseNodes = phases.map((p) => Object.assign(makeNode(), { dataset: { phase: p } }));

export const dom = { nodes, listeners, phaseNodes };

// The cinema paces itself off performance.now(), so a multiplied clock lets a
// test watch whole turns of shots play out in a fraction of the wall time.
export function virtualClock(speed = 40) {
  const origin = Date.now();
  return () => (Date.now() - origin) * speed;
}

export function installGlobals({
  capability = { still: true, video: false, voice: false, realtime: false },
  clockSpeed = 40,
} = {}) {
  globalThis.document = {
    getElementById: (id) => nodes.get(id) ?? null,
    createElement: () => makeNode(),
    createTextNode: (text) => ({ textContent: String(text), nodeType: 3 }),
    querySelectorAll: (sel) => (sel === ".phase" ? phaseNodes : []),
    addEventListener(type, fn) { listeners.set(`document:${type}`, fn); },
  };
  const now = virtualClock(clockSpeed);
  globalThis.performance = { now };
  globalThis.window ??= globalThis;
  globalThis.innerWidth = 1440;
  globalThis.innerHeight = 900;
  // The app's recovery watchdog is a bare setInterval; unref it so a test run
  // is not held open by a timer the browser would simply discard on unload.
  const realSetInterval = nodeSetInterval;
  globalThis.setInterval = (fn, ms) => {
    const timer = realSetInterval(fn, ms);
    timer.unref?.();
    return timer;
  };
  let frameId = 0;
  const frames = new Map();
  globalThis.requestAnimationFrame = (fn) => {
    const id = ++frameId;
    // unref: the canvas loop must never hold the process open after a test run.
    frames.set(id, setTimeout(() => { frames.delete(id); fn(now()); }, 8).unref());
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => { clearTimeout(frames.get(id)); frames.delete(id); };
  globalThis.speechSynthesis = { cancel() {}, speak() {}, getVoices: () => [] };
  // The app reads ?duel= to load a shared replay, so the stub needs a location.
  globalThis.location = {
    origin: "http://localhost:4174", pathname: "/", search: "", href: "http://localhost:4174/",
  };
  globalThis.navigator ??= { clipboard: { writeText: async () => {} } };
  globalThis.URLSearchParams ??= URLSearchParams;
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  globalThis.fetch = async (url) => {
    if (String(url).includes("/api/capability")) return { ok: true, json: async () => capability };
    return { ok: false, status: 502, json: async () => ({ error: "offline" }) };
  };
}

export const fire = async (id, type = "click", event = {}) =>
  listeners.get(`${id}:${type}`)?.({ target: nodes.get(id), ...event });

export const settle = (ms = 120) => new Promise((done) => setTimeout(done, ms));
