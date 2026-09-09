// Record a duel as a replay. `node scripts/record-duel.mjs [matchup] [seed]`
//
// Shares the decision loop with selfplay so a recording cannot drift from how
// the game actually plays.

import {
  applyAction, createDuel, endTurn, respondToChain, respondToDiscard,
  respondToTarget, respondToTribute, setPhase,
} from "../src/duel-engine.js";
import { chooseAction, chooseChainResponse, chooseTargets, chooseTributes } from "../src/duel-ai.js";
import { nextPhases } from "../src/duel-phases.js";
import { encodeReplay, record } from "../src/duel-replay.js";
import { mulberry32 } from "../src/duel-state.js";

export function recordDuel(matchup, seed, { maxTurns = 120 } = {}) {
  const rng = mulberry32(seed);
  let state = createDuel(matchup, { seed });
  const steps = [];
  const take = (kind, payload, result) => {
    steps.push(record(kind, payload));
    state = result.state;
  };

  let guard = 0;
  while (!state.winner && state.turn <= maxTurns && guard < 4000) {
    guard += 1;
    const pending = state.pending?.kind;
    if (pending === "chain") {
      const choice = chooseChainResponse(state, rng);
      take("chain", choice, respondToChain(state, choice));
    } else if (pending === "target") {
      const uids = chooseTargets(state);
      take("target", { uids, position: "attack" },
        respondToTarget(state, uids, { position: "attack" }));
    } else if (pending === "tribute") {
      const uids = chooseTributes(state);
      take("tribute", uids, respondToTribute(state, uids));
    } else if (pending === "discard") {
      const uids = state.sides[state.pending.side].hand.slice(0, state.pending.need)
        .map((c) => c.uid);
      take("discard", uids, respondToDiscard(state, uids));
    } else {
      const action = chooseAction(state, state.activeSide, rng);
      if (action) {
        take("action", action, applyAction(state, action));
      } else {
        const edges = nextPhases(state).filter((edge) => edge.allowed);
        const forward = edges.find((e) => e.to === "battle")
          ?? edges.find((e) => e.to === "main2") ?? edges.find((e) => e.to === "end");
        if (forward) take("phase", forward.to, setPhase(state, forward.to));
        else take("turn", null, endTurn(state));
      }
    }
  }
  return { seed, matchup, steps, state };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const matchup = process.argv[2] ?? "yugi-kaiba";
  const seed = Number(process.argv[3] ?? 777);
  const recording = recordDuel(matchup, seed);
  const encoded = encodeReplay(recording);
  console.log(`${matchup} seed ${seed} — ${recording.steps.length} steps, `
    + `winner ${recording.state.winner ?? "none"} on turn ${recording.state.turn}`);
  console.log(`link  ?duel=${encoded}`);
  console.log(`size  ${(encoded.length / 1024).toFixed(1)} KB`);
}
