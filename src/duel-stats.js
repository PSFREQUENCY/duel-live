// Duel statistics, derived from the engine's own event log.
//
// Nothing here counts anything the rules engine did not emit, so a shared card
// can never claim a hit that did not happen.

import { DUELISTS, getMatchup } from "./duelists.js";
import { other } from "./duel-state.js";

const EMPTY_SIDE = () => ({
  damageTaken: 0,
  lifePaid: 0,
  summons: 0,
  fusions: 0,
  trapsSprung: 0,
  spellsCast: 0,
  directAttacks: 0,
  cardsDrawn: 0,
  monstersLost: 0,
});

/**
 * Fold a duel's events into the numbers worth showing. `turns` comes from the
 * last draw phase rather than a counter, so a duel that ended mid-turn reports
 * the turn it actually ended on.
 */
export function summariseDuel(events, state) {
  const sides = { player: EMPTY_SIDE(), opponent: EMPTY_SIDE() };
  const startingLife = getMatchup(state.matchupId)?.lifePoints ?? 8000;
  // The engine reports the full size of an attack even when it overkills, so a
  // running total of `amount` overshoots the life points that actually existed.
  // The event's own `lp` tells us what really came off the bar.
  const previousLife = { player: startingLife, opponent: startingLife };
  let turns = 1;
  let biggestHit = null;
  let lastAttacker = null;

  for (const event of events) {
    const side = event.side;
    const mine = sides[side];
    switch (event.type) {
      case "phase":
        if (event.phase === "draw") turns = Math.max(turns, event.turn ?? turns);
        break;
      case "draw":
        if (mine) mine.cardsDrawn += 1;
        break;
      case "summon":
        if (!mine || event.how === "token") break;
        if (event.how === "fusion") mine.fusions += 1;
        else mine.summons += 1;
        break;
      case "activate":
        if (!mine) break;
        if (event.reveal) mine.trapsSprung += 1;
        else mine.spellsCast += 1;
        break;
      case "declare":
        lastAttacker = { side, card: event.card };
        break;
      case "directAttack":
        if (!mine) break;
        mine.directAttacks += 1;
        break;
      case "damage": {
        // `side` names whoever took the damage. Counting what was taken rather
        // than guessing who to credit means the total can never over-claim: a
        // cost a duelist pays themselves is not damage anyone dealt them.
        if (!mine) break;
        const absorbed = Math.max(0, previousLife[side] - event.lp);
        previousLife[side] = event.lp;
        // A cost a duelist pays themselves is not damage anyone dealt them,
        // but it is still life points spent, so it is tracked separately.
        if (event.cause === "cost") { mine.lifePaid += absorbed; break; }
        mine.damageTaken += absorbed;
        // The headline hit keeps the attack's real size, overkill included --
        // a 3000 ATK strike into 200 life points was still a 3000 ATK strike.
        if (!biggestHit || event.amount > biggestHit.damage) {
          biggestHit = {
            damage: event.amount,
            side: other(side),
            card: event.cause === "battle" || event.cause === "direct"
              ? (lastAttacker?.card ?? null)
              : null,
          };
        }
        break;
      }
      case "destroy":
        if (event.cause === "battle" && mine) mine.monstersLost += 1;
        break;
      default:
        break;
    }
  }

  // Damage dealt is the mirror of damage taken, so the two always agree.
  sides.player.damageDealt = sides.opponent.damageTaken;
  sides.opponent.damageDealt = sides.player.damageTaken;

  const winner = state.winner ?? null;
  return {
    matchupId: state.matchupId,
    winner,
    loser: winner ? other(winner) : null,
    reason: state.winReason ?? null,
    turns,
    lifePoints: {
      player: state.sides.player.lp,
      opponent: state.sides.opponent.lp,
    },
    duelists: {
      player: DUELISTS[state.sides.player.duelistId],
      opponent: DUELISTS[state.sides.opponent.duelistId],
    },
    sides,
    biggestHit,
  };
}

/** The one line worth leading a share card with. */
export function headline(stats) {
  if (!stats.winner) return "Duel in progress";
  const winner = stats.duelists[stats.winner];
  if (stats.reason === "deckout") return `${winner.name} wins on a deck out`;
  const margin = stats.lifePoints[stats.winner];
  if (margin >= 7000) return `${winner.name} wins without breaking a sweat`;
  if (margin <= 1000) return `${winner.name} wins by a hair`;
  return `${winner.name} takes the duel`;
}

/** The stat tiles a card shows, already formatted. */
export function statTiles(stats) {
  const side = stats.winner ?? "player";
  const mine = stats.sides[side];
  const tiles = [
    { label: "Life Points", value: String(stats.lifePoints[side]) },
    { label: "Turns", value: String(stats.turns) },
    { label: "Damage dealt", value: mine.damageDealt.toLocaleString("en") },
    { label: "Summons", value: String(mine.summons + mine.fusions) },
  ];
  if (mine.fusions > 0) tiles.push({ label: "Fusions", value: String(mine.fusions) });
  if (mine.trapsSprung > 0) tiles.push({ label: "Traps sprung", value: String(mine.trapsSprung) });
  if (mine.directAttacks > 0) tiles.push({ label: "Direct attacks", value: String(mine.directAttacks) });
  return tiles.slice(0, 6);
}
