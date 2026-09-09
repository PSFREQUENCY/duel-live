// Builds duel-live.html: the whole game as one file you can open from disk.
// Modules are wrapped in a tiny registry rather than concatenated, so two files
// are free to use the same local name without silently clobbering each other.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { describeCycles, findFatalCycles } from "./module-graph.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENTRY = "src/app.js";

const IMPORT_RE = /^import\s+(?:\{([^}]*)\}|(\w+))\s+from\s+["']([^"']+)["'];?\s*$/gm;
const BARE_IMPORT_RE = /^import\s+["']([^"']+)["'];?\s*$/gm;
// `export { a, b } from "./x.js"` -- a re-export, which is both an import and
// an export and must be rewritten as both.
const REEXPORT_RE = /^export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?\s*$/gm;

function bindings(clause) {
  return clause.split(",").map((part) => part.trim()).filter(Boolean)
    .map((part) => {
      const [name, alias] = part.split(/\s+as\s+/).map((s) => s.trim());
      return alias ? `${name}: ${alias}` : name;
    }).join(", ");
}

function collectExports(code) {
  const names = new Set();
  for (const m of code.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) names.add(m[1]);
  for (const m of code.matchAll(/^export\s+(?:const|let|var|class)\s+(\w+)/gm)) names.add(m[1]);
  for (const m of code.matchAll(/^export\s*\{([^}]*)\};?\s*$/gm)) {
    for (const part of m[1].split(",")) {
      const name = part.split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  if (/^export\s+default/m.test(code)) throw new Error("default exports are not supported by this build");
  return [...names];
}

function transform(code, id) {
  const deps = new Set();
  const reexported = [];
  const imported = {};                       // spec -> names taken from it
  const takes = (spec, named) => {
    imported[spec] ??= [];
    for (const part of named.split(",").map((s) => s.trim()).filter(Boolean)) {
      imported[spec].push(part.split(/\s+as\s+/)[0].trim());
    }
  };

  let out = code.replace(REEXPORT_RE, (_, named, spec) => {
    deps.add(spec);
    takes(spec, named);
    const names = named.split(",").map((part) => part.trim()).filter(Boolean)
      .map((part) => part.split(/\s+as\s+/).map((s) => s.trim()));
    for (const [, alias] of names.map(([name, alias]) => [name, alias ?? name])) {
      reexported.push(alias);
    }
    return `const { ${bindings(named)} } = __req(${JSON.stringify(spec)});`;
  });

  out = out
    .replace(IMPORT_RE, (_, named, def, spec) => {
      deps.add(spec);
      takes(spec, named);
      if (def) throw new Error(`${id}: default import of ${spec} is not supported`);
      return `const { ${bindings(named)} } = __req(${JSON.stringify(spec)});`;
    })
    .replace(BARE_IMPORT_RE, (_, spec) => {
      deps.add(spec);
      imported[spec] ??= [];                 // side-effect only: ordering, not bindings
      return `__req(${JSON.stringify(spec)});`;
    });

  const names = [...new Set([...collectExports(out), ...reexported])];
  out = out
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, "")
    .replace(/^export\s+/gm, "");
  const assign = names.length
    ? `\nObject.assign(__exports, { ${names.join(", ")} });`
    : "";
  return { code: out + assign, deps: [...deps], imported };
}

const modules = new Map();
function load(absPath) {
  const id = relative(ROOT, absPath).split("\\").join("/");
  if (modules.has(id)) return id;
  modules.set(id, null); // placeholder guards against import cycles
  const raw = readFileSync(absPath, "utf8");
  const { code, deps, imported } = transform(raw, id);
  const resolved = {};
  const imports = {};
  for (const spec of deps) {
    const depPath = resolve(dirname(absPath), spec);
    resolved[spec] = load(depPath);
    imports[resolved[spec]] = imported[spec] ?? [];
  }
  modules.set(id, { code, resolved, imports });
  return id;
}

const entryId = load(join(ROOT, ENTRY));

// A cycle here ships a bundle that throws mid-duel. Refuse to write it.
const fatal = findFatalCycles(modules, entryId);
if (fatal.length) {
  console.error(`build failed: ${fatal.length} import cycle(s) the bundle cannot resolve\n`);
  console.error(describeCycles(fatal));
  process.exit(1);
}

const registry = [...modules.entries()].map(([id, mod]) => {
  const map = JSON.stringify(mod.resolved);
  return `__def(${JSON.stringify(id)}, ${map}, function (__exports, __req) {\n${mod.code}\n});`;
}).join("\n\n");

const runtime = `
const __mods = new Map();
const __cache = new Map();
function __def(id, map, factory) { __mods.set(id, { map, factory }); }
function __make(id) {
  if (__cache.has(id)) return __cache.get(id);
  const mod = __mods.get(id);
  if (!mod) throw new Error("missing module: " + id);
  const exports = {};
  __cache.set(id, exports);
  mod.factory(exports, (spec) => __make(mod.map[spec]));
  return exports;
}
`;

const html = readFileSync(join(ROOT, "index.html"), "utf8");
const css = readFileSync(join(ROOT, "styles.css"), "utf8");
const script = `<script type="module">\n${runtime}\n${registry}\n\n__make(${JSON.stringify(entryId)});\n</script>`;

const single = html
  .replace('<link rel="stylesheet" href="styles.css" />', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="src/app.js"></script>', script);

writeFileSync(join(ROOT, "duel-live.html"), single);
const kb = (Buffer.byteLength(single) / 1024).toFixed(0);
console.log(`duel-live.html           ${kb} KB  ·  ${modules.size} modules inlined  ·  entry ${entryId}`);

// The Artifact host supplies its own <!doctype>/<html>/<head>/<body>, so the
// hosted build is the same page with that skeleton removed.
const body = single.slice(single.indexOf("<body>") + "<body>".length, single.lastIndexOf("</body>"));
const artifact = `<title>Duel Live</title>\n<style>\n${css}\n</style>\n${body.trim()}`;
writeFileSync(join(ROOT, "duel-live.artifact.html"), artifact);
console.log(`duel-live.artifact.html  ${(Buffer.byteLength(artifact) / 1024).toFixed(0)} KB  ·  no document skeleton, for hosting`);
