// Import cycles that the single-file build cannot survive.
//
// In real ESM a cycle is often harmless: bindings are live, so a function
// imported from a half-initialised module still resolves by the time it is
// called. The bundle has no live bindings -- each module destructures a plain
// exports object at its top, and a module still on the stack has not assigned
// its exports yet. So every name taken across a back-edge is `undefined`, and
// the failure surfaces much later as "x is not a function", inside a duel.
//
// This catches it at build time and says which import to move.

/**
 * @param {Map<string, {imports: Record<string, string[]>}>} graph
 *   module id -> { imports: { resolved dep id -> imported names } }
 * @param {string} entry
 * @returns {{from: string, to: string, names: string[], cycle: string[]}[]}
 */
export function findFatalCycles(graph, entry) {
  const fatal = [];
  const seen = new Set();
  const stack = [];

  const visit = (id) => {
    stack.push(id);
    for (const [dep, names] of Object.entries(graph.get(id)?.imports ?? {})) {
      const at = stack.indexOf(dep);
      if (at !== -1) {
        // A back-edge. Only named imports break; a bare import is just ordering.
        if (names.length) {
          fatal.push({ from: id, to: dep, names, cycle: [...stack.slice(at), dep] });
        }
        continue;
      }
      if (seen.has(dep)) continue;
      seen.add(dep);
      visit(dep);
    }
    stack.pop();
  };

  seen.add(entry);
  visit(entry);
  return fatal;
}

/** @param {ReturnType<findFatalCycles>} fatal */
export function describeCycles(fatal) {
  return fatal.map(({ from, to, names, cycle }) => [
    `  ${cycle.join(" -> ")}`,
    `    ${from} takes { ${names.join(", ")} } from ${to}, which is still loading.`,
    `    Import those from the module that defines them instead.`,
  ].join("\n")).join("\n\n");
}
