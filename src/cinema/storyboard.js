// Turns rules-engine events into a shot list. The prompt text is rebuilt from
// battle facts every time, so the cinema can never contradict the duel.

import { CARDS } from "../cards/index.js";
import { DUELISTS, getMatchup } from "../duelists.js";

const STYLE = "cel-shaded late-90s anime, heavy ink outlines, saturated holographic lighting, "
  + "dramatic low camera angle, 16:9 widescreen, no text, no watermark, no logos";

let nameIndex = null;
function cardByName(name) {
  nameIndex ??= Object.fromEntries(Object.values(CARDS).map((card) => [card.name, card]));
  return nameIndex[name] ?? null;
}

function monsterArt(name) {
  const card = cardByName(name);
  return card?.art ?? `a duel monster called ${name}`;
}

export function shotSeed(shot) {
  let h = 2166136261;
  for (const ch of shot.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.abs(h % 2147483647);
}

function duelistOf(state, side) {
  return DUELISTS[state.sides[side].duelistId];
}

function baseScene(state) {
  return getMatchup(state.matchupId).arena;
}

const SHOT_BUILDERS = {
  summon(event, state, seq) {
    const duelist = duelistOf(state, event.side);
    const how = event.how === "fusion" ? "erupts out of a fusion vortex"
      : event.how === "reborn" ? "claws its way up out of a glowing grave"
      : event.faceDown ? "materialises as a sealed face-down card" : "slams down onto the field";
    return {
      kind: event.how === "fusion" ? "fusion" : "summon",
      title: event.card,
      subtitle: `${duelist.name} · ${event.atk ?? "?"} ATK`,
      seconds: event.how === "fusion" ? 3.4 : 2.4,
      prompt: `${monsterArt(event.card)}; the monster ${how} in ${baseScene(state)}; ${STYLE}`,
      voice: duelist.lines[event.how === "fusion" ? "ace" : "summon"].replace("{card}", event.card),
    };
  },

  clash(event, state) {
    const duelist = duelistOf(state, event.side);
    const outcome = event.attackerAtk > event.defenderValue ? "shattering the defender in a burst of light"
      : event.attackerAtk < event.defenderValue ? "and is thrown back, cracking apart"
      : "in a mutual detonation that consumes both";
    return {
      kind: "clash",
      title: `${event.attacker} → ${event.defender}`,
      subtitle: `${event.attackerAtk} vs ${event.defenderValue}`,
      seconds: 2.8,
      prompt: `${monsterArt(event.attacker)} charges ${monsterArt(event.defender)} ${outcome}; `
        + `${baseScene(state)}; ${STYLE}`,
      voice: duelist.lines.attack.replace("{card}", event.attacker),
    };
  },

  directAttack(event, state) {
    const duelist = duelistOf(state, event.side);
    return {
      kind: "direct",
      title: `Direct attack — ${event.damage}`,
      subtitle: `${duelist.name} swings for the throat`,
      seconds: 2.6,
      prompt: `${monsterArt(event.card)} tears past an empty field and strikes the opposing duelist's `
        + `holographic barrier, light exploding outward; ${baseScene(state)}; ${STYLE}`,
      voice: duelist.lines.attack.replace("{card}", event.card),
    };
  },

  activate(event, state) {
    const duelist = duelistOf(state, event.side);
    return {
      kind: event.reveal ? "trap" : "spell",
      title: event.card,
      subtitle: event.text ?? "",
      seconds: 2.2,
      prompt: `${event.art ?? event.card}; a huge holographic card flips face-up and floods the arena `
        + `with light; ${baseScene(state)}; ${STYLE}`,
      voice: event.reveal ? duelist.lines.trap.replace("{card}", event.card) : null,
    };
  },

  win(event, state) {
    const duelist = duelistOf(state, event.side);
    const loser = duelistOf(state, event.side === "player" ? "opponent" : "player");
    return {
      kind: "finish",
      title: `${duelist.name} wins`,
      subtitle: event.reason === "deckout" ? "Deck out" : "Life Points depleted",
      seconds: 5,
      prompt: `${duelist.portrait} stands victorious as the holograms fade; `
        + `${baseScene(state)}; ${STYLE}`,
      voice: duelist.lines.win,
      loserVoice: loser.lines.lose,
    };
  },
};

const CINEMATIC = new Set(["summon", "clash", "directAttack", "activate", "win"]);

export function buildStoryboard(events, state, { turn = state.turn } = {}) {
  const shots = [];
  events.forEach((event, i) => {
    if (!CINEMATIC.has(event.type)) return;
    if (event.type === "summon" && event.how === "token") return;
    const built = SHOT_BUILDERS[event.type](event, state, i);
    shots.push({
      ...built,
      id: `t${turn}-${i}-${built.kind}-${(built.title ?? "").replace(/\W+/g, "").slice(0, 24)}`,
      side: event.side,
      duelistId: state.sides[event.side]?.duelistId ?? null,
      turn,
      event,
    });
  });
  return shots;
}

export function idleShot(state) {
  const player = duelistOf(state, "player");
  const foe = duelistOf(state, "opponent");
  return {
    id: `idle-${state.matchupId}`,
    kind: "idle",
    duelistId: player.id,
    title: "Standoff",
    subtitle: `${player.name} vs ${foe.name}`,
    seconds: 4,
    side: "player",
    turn: state.turn,
    prompt: `${player.portrait} facing off against ${foe.portrait} across ${baseScene(state)}, `
      + `duel disks lit, holograms idling; ${STYLE}`,
    voice: null,
  };
}
