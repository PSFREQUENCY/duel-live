// Self-play harness: drives both matchups to a result with no UI attached.
// Used as an engine soak test -- `node scripts/selfplay.mjs 200`.

import {
  applyAction, createDuel, endTurn, legalActions,
  respondToChain, respondToDiscard, respondToTarget, respondToTribute, setPhase,
} from "../src/duel-engine.js";
import { nextPhases } from "../src/duel-phases.js";
import {
  chooseAction, chooseChainResponse, chooseTargets, chooseTributes,
} from "../src/duel-ai.js";
import { mulberry32 } from "../src/duel-state.js";

// Gravity Bind legitimately grinds a duel toward deck-out, and a deck-out in a
// 40-card deck lands around turn 80. A cap below that reports a working lock as
// a stall.
export function playDuel(matchupId, seed, { maxTurns = 120 } = {}) {
  const rng = mulberry32(seed);
  let state = createDuel(matchupId, { seed });
  const events = [];
  let guard = 0;

  while (!state.winner && state.turn <= maxTurns && guard < 4000) {
    guard += 1;
    if (state.pending?.kind === "discard") {
      const { side, need, options } = state.pending;
      // Throw away the least useful cards: lowest ATK first.
      const hand = state.sides[side].hand;
      const worst = [...hand].sort((a, b) => (a.cardId.length - b.cardId.length)).slice(0, need);
      const r = respondToDiscard(state, worst.map((c) => c.uid) ?? options.slice(0, need));
      state = r.state; events.push(...r.events);
      continue;
    }
    if (state.pending?.kind === "target") {
      const r = respondToTarget(state, chooseTargets(state));
      state = r.state; events.push(...r.events);
      continue;
    }
    if (state.pending?.kind === "tribute") {
      const r = respondToTribute(state, chooseTributes(state));
      state = r.state; events.push(...r.events);
      continue;
    }
    if (state.pending?.kind === "chain") {
      const r = respondToChain(state, chooseChainResponse(state, rng));
      state = r.state; events.push(...r.events);
      continue;
    }
    const action = chooseAction(state, state.activeSide, rng);
    if (action) {
      const r = applyAction(state, action);
      state = r.state; events.push(...r.events);
      continue;
    }
    // Walk the phase table: attack when possible, otherwise end the turn.
    const edges = nextPhases(state).filter((edge) => edge.allowed);
    const preferred = edges.find((edge) => edge.to === "battle")
      ?? edges.find((edge) => edge.to === "main2")
      ?? edges.find((edge) => edge.to === "end");
    if (preferred) {
      const r = setPhase(state, preferred.to);
      state = r.state; events.push(...r.events);
      continue;
    }
    const r = endTurn(state);
    state = r.state; events.push(...r.events);
  }
  return { state, events, turns: state.turn, guard };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runs = Number(process.argv[2] ?? 100);
  for (const matchup of ["yugi-kaiba", "joey-mai"]) {
    const tally = { player: 0, opponent: 0, stall: 0 };
    let totalTurns = 0; let totalEvents = 0;
    for (let i = 0; i < runs; i += 1) {
      const { state, events, turns } = playDuel(matchup, 1000 + i);
      tally[state.winner ?? "stall"] += 1;
      totalTurns += turns; totalEvents += events.length;
    }
    const reasons = playDuel(matchup, 1).state;
    console.log(
      matchup.padEnd(11),
      `${tally.player}/${tally.opponent}/${tally.stall} (p/o/stall)`,
      `avg turns ${(totalTurns / runs).toFixed(1)}`,
      `avg events ${(totalEvents / runs).toFixed(0)}`,
      `| sample end: ${reasons.winner ?? "stall"} by ${reasons.winReason ?? "-"}`,
    );
  }
}
