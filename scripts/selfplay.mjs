// Self-play harness: drives both matchups to a result with no UI attached.
// Used as an engine soak test -- `node scripts/selfplay.mjs 200`.

import { applyAction, createDuel, endTurn, legalActions, respondToTrapWindow, setPhase } from "../src/duel-engine.js";
import { chooseAction, chooseTrapResponse } from "../src/duel-ai.js";
import { mulberry32 } from "../src/duel-state.js";

export function playDuel(matchupId, seed, { maxTurns = 60 } = {}) {
  const rng = mulberry32(seed);
  let state = createDuel(matchupId, { seed });
  const events = [];
  let guard = 0;

  while (!state.winner && state.turn <= maxTurns && guard < 4000) {
    guard += 1;
    if (state.pending) {
      const r = respondToTrapWindow(state, chooseTrapResponse(state, rng));
      state = r.state; events.push(...r.events);
      continue;
    }
    const action = chooseAction(state, state.activeSide, rng);
    if (action) {
      const r = applyAction(state, action);
      state = r.state; events.push(...r.events);
      continue;
    }
    if (state.phase === "main1") { const r = setPhase(state, "battle"); state = r.state; events.push(...r.events); continue; }
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
