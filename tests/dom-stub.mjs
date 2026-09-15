// A DOM stub with just enough surface for src/app.js to run its real boot path.
// Used by the integration test and by `npm run smoke`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

// An element's classes are part of what it is. Building id-nodes without them
// meant any selector naming a class on an id-bearing element matched nothing --
// so `.live-fan .fan-card` quietly found zero, and a real freeze looked like a
// passing test.
// aria-pressed and friends: a control that starts "on" in the markup has to
// start "on" here, or the first click toggles it the wrong way.
const attrsById = new Map(
  [...html.matchAll(/<[a-zA-Z][^>]*>/g)]
    .map((m) => [m[0].match(/\bid="([^"]+)"/)?.[1],
      [...m[0].matchAll(/\b(aria-[a-z]+|role|type|data-[a-z-]+)="([^"]*)"/g)]
        .map((a) => [a[1], a[2]])])
    .filter(([id, pairs]) => id && pairs.length),
);

const classesById = new Map(
  [...html.matchAll(/<[a-zA-Z][^>]*>/g)]
    .map((m) => [m[0].match(/\bid="([^"]+)"/)?.[1], m[0].match(/\bclass="([^"]+)"/)?.[1]])
    .filter(([id, cls]) => id && cls),
);
const phases = [...html.matchAll(/data-phase="([^"]+)"/g)].map((m) => m[1]);

const listeners = new Map();
const nodeSetInterval = globalThis.setInterval;

const ctx2d = new Proxy({}, {
  get: (_, prop) => {
    if (prop === "createLinearGradient" || prop === "createRadialGradient") {
      return () => ({ addColorStop() {} });
    }
    // Real 2D contexts return data, not undefined. Code that reads pixels back
    // -- the film grain does -- needs a buffer here or it crashes the loop.
    if (prop === "createImageData") {
      return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
    }
    if (prop === "getImageData") {
      return (_x, _y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
    }
    if (prop === "createPattern") return () => ({});
    if (prop === "canvas") return { width: 1280, height: 720 };
    return () => {};
  },
  set: () => true,
});

function makeNode(id = "") {
  const attrs = new Map();
  const classes = new Set();
  const sync = () => { node.className = [...classes].join(" "); };
  const node = {
    id, hidden: true, disabled: false, textContent: "", value: "",
    src: "", loop: false, width: 1280, height: 720, dataset: {},
    style: { setProperty() {}, background: "", width: "" },
    // A real class list, backed by a set and kept in sync with className. The
    // no-op version made every class-based query silently return nothing, which
    // meant a harness could not click what a render had actually produced.
    classList: {
      add(...names) { for (const n of names) classes.add(n); sync(); },
      remove(...names) { for (const n of names) classes.delete(n); sync(); },
      toggle(name, force) {
        const on = force ?? !classes.has(name);
        if (on) classes.add(name); else classes.delete(name);
        sync();
        return on;
      },
      contains: (name) => classes.has(name),
    },
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
    // Real attributes. `getAttribute` returning null for everything meant any
    // control reading its own aria-pressed to toggle could never be tested.
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
    removeAttribute(name) { attrs.delete(name); },
    hasAttribute: (name) => attrs.has(name),
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
  Object.defineProperty(node, "className", {
    get: () => [...classes].join(" "),
    set: (value) => {
      classes.clear();
      for (const name of String(value).split(/\s+/).filter(Boolean)) classes.add(name);
    },
    configurable: true,
  });
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

const nodes = new Map(ids.map((id) => {
  const node = makeNode(id);
  const cls = classesById.get(id);
  if (cls) node.className = cls;
  for (const [name, value] of attrsById.get(id) ?? []) node.setAttribute(name, value);
  return [id, node];
}));
// A real <select> reports its first <option> value before any interaction.
for (const [, id, inner] of html.matchAll(/<select id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
  const first = inner.match(/value="([^"]+)"/);
  if (first && nodes.has(id)) nodes.get(id).value = first[1];
}
const phaseNodes = phases.map((p) => Object.assign(makeNode(), { dataset: { phase: p } }));

/** Every node reachable from the registered roots, dynamic renders included. */
function walk(node, out = []) {
  out.push(node);
  for (const child of node.children ?? []) if (child?.children) walk(child, out);
  return out;
}

const hasAll = (node, names) => names.every((name) => node.classList?.contains(name));

/**
 * `.class`, `.a.b`, and `.a:not(.b)` -- enough to click what a render produced.
 * A harness that can only reach nodes carrying an id is not using the page the
 * way a player does.
 */
function matcher(part) {
  const [wanted, excluded = ""] = part.split(":not");
  const id = wanted.startsWith("#") ? wanted.slice(1).split(".")[0] : null;
  const want = (id ? wanted.slice(id.length + 1) : wanted).split(".").filter(Boolean);
  const avoid = excluded.replace(/[()]/g, "").split(".").filter(Boolean);
  return (node) => (!id || node.id === id) && hasAll(node, want)
    && !avoid.some((name) => node.classList?.contains(name));
}

/**
 * `.class`, `#id`, `.a.b`, `.a:not(.b)`, and descendant chains of those.
 * Anything a harness needs to click what a render actually produced -- without
 * descendants, `.prompt-actions .btn` silently matched nothing and a real
 * freeze looked like a passing test.
 */
function search(selector, all) {
  const parts = selector.trim().split(/\s+/).filter(Boolean).map(matcher);
  const out = [];
  const roots = [...nodes.values()];
  const descend = (node, depth) => {
    if (!parts[depth](node)) return false;
    if (depth === parts.length - 1) { out.push(node); return true; }
    for (const child of walk(node).slice(1)) if (descend(child, depth + 1) && !all) return true;
    return false;
  };
  for (const root of roots) {
    for (const node of walk(root)) {
      if (descend(node, 0) && !all) return out[0] ?? null;
    }
  }
  return all ? [...new Set(out)] : (out[0] ?? null);
}

const query = (selector) => search(selector, false);
const queryAll = (selector) => search(selector, true);

export const dom = { nodes, listeners, phaseNodes, query, queryAll };

// The cinema paces itself off performance.now(), so a multiplied clock lets a
// test watch whole turns of shots play out in a fraction of the wall time.
export function virtualClock(speed = 40) {
  const origin = Date.now();
  return () => (Date.now() - origin) * speed;
}

export function installGlobals({
  capability = { still: true, video: false, voice: false, realtime: false },
  clockSpeed = 40,
  search = "",
} = {}) {
  // Every real page has a body, and the mode branch puts its class on it.
  const body = makeNode("body");
  globalThis.document = {
    body,
    getElementById: (id) => nodes.get(id) ?? null,
    createElement: () => makeNode(),
    createTextNode: (text) => ({ textContent: String(text), nodeType: 3 }),
    querySelectorAll: (sel) => (sel === ".phase" ? phaseNodes : []),
    addEventListener(type, fn) { listeners.set(`document:${type}`, fn); },
    removeEventListener(type) { listeners.delete(`document:${type}`); },
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
    origin: "http://localhost:4174", pathname: "/", search,
    href: `http://localhost:4174/${search}`,
  };
  // Node has its own `navigator`, so `??=` leaves it without a clipboard and
  // every copy path silently short-circuits.
  globalThis.navigator ??= {};
  if (!globalThis.navigator.clipboard) {
    try {
      Object.defineProperty(globalThis.navigator, "clipboard", {
        value: { writeText: async () => {}, write: async () => {} },
        configurable: true,
      });
    } catch { /* a frozen navigator is not worth failing a test over */ }
  }
  globalThis.URLSearchParams ??= URLSearchParams;
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  globalThis.fetch = async (url) => {
    if (String(url).includes("/api/capability")) return { ok: true, json: async () => capability };
    return { ok: false, status: 502, json: async () => ({ error: "offline" }) };
  };
}

// A real listener always receives `currentTarget` -- it is how a handler reads
// the state of the control it is bound to. Leaving it off meant any handler
// that toggles its own aria-pressed threw here and nowhere else.
export const fire = async (id, type = "click", event = {}) => {
  const node = nodes.get(id);
  return listeners.get(`${id}:${type}`)?.({
    target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...event,
  });
};

export const settle = (ms = 120) => new Promise((done) => setTimeout(done, ms));
