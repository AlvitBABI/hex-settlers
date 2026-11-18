// The rules engine's front door.
//   createGame(config)           -> a new game state (plain JSON)
//   applyAction(state, action)   -> { ok: true, state } or { ok: false, error }
//   legalActions(state, player)  -> the actions that player may take now
//   waitingFor(state)            -> which players the game is waiting on
// Each rules topic lives in its own module with `handlers` and `legal`.
import { createRng, shuffle } from './rng.js';
import { generateBoard } from './board.js';
import { RESOURCES, BANK_SIZE, PIECES, CARD_COUNTS } from './constants.js';
import { clone, emptyHand, newTurn } from './helpers.js';
import * as turn from './turn.js';
import * as bandit from './bandit.js';
import * as trade from './trade.js';
import * as cards from './cards.js';
import * as scoring from './scoring.js';

const MODULES = [turn, bandit, trade, cards];
const HANDLERS = Object.assign({}, ...MODULES.map((m) => m.handlers));

export const PLAYER_COUNT = { min: 2, max: 4 };

// config: { seed, players: [{ name, kind: 'human' | 'bot' }, ...] }
export function createGame({ seed, players }) {
  if (!Array.isArray(players) || players.length < PLAYER_COUNT.min || players.length > PLAYER_COUNT.max) {
    throw new Error(`A game needs ${PLAYER_COUNT.min} to ${PLAYER_COUNT.max} players`);
  }
  let rng = createRng(seed);
  const g = generateBoard(rng);
  rng = g.rng;
  const deck = shuffle(rng, Object.entries(CARD_COUNTS).flatMap(([t, n]) => Array(n).fill(t)));
  rng = deck.rng;
  const ids = players.map((_, i) => i);
  return {
    seed: String(seed),
    rng,
    board: g.board,
    players: players.map((p, i) => ({
      id: i, name: p.name, kind: p.kind,
      hand: emptyHand(), cards: [], soldiers: 0, pieces: { ...PIECES },
    })),
    buildings: {}, // corner -> { player, type: 'settlement' | 'city' }
    roads: {},     // edge -> player
    bandit: g.board.hexes.find((h) => h.resource === 'desert').id,
    bank: Object.fromEntries(RESOURCES.map((r) => [r, BANK_SIZE])),
    deck: deck.result,
    phase: 'setup', // 'setup' -> 'play' -> 'over'
    // Snake order: 1-2-3-4 then 4-3-2-1.
    setup: { order: [...ids, ...ids.slice().reverse()], index: 0, step: 'settlement', lastCorner: null },
    current: 0,
    turn: newTurn(0),
    pending: null, // a step that must happen next (discard, move bandit, steal)
    trade: null,   // an open offer between players
    longestRoad: { player: null, length: 0 },
    largestArmy: { player: null, count: 0 },
    winner: null,
    log: [],
    logCount: 0,
  };
}

export function applyAction(state, action) {
  const handler = action && Object.hasOwn(HANDLERS, action.type) && HANDLERS[action.type];
  if (!handler) return { ok: false, error: `Unknown action: ${action?.type}` };
  if (state.phase === 'over') return { ok: false, error: 'The game is over' };
  if (!Number.isInteger(action.player) || !state.players[action.player]) return { ok: false, error: 'Unknown player' };
  if (state.turn.freeRoads > 0 && action.type !== 'buildRoad') return { ok: false, error: 'Place your free roads first' };
  const s = clone(state); // never change the caller's state
  const error = handler(s, action);
  if (error) return { ok: false, error };
  for (const m of MODULES) m.after?.(s);
  scoring.after(s);
  return { ok: true, state: s };
}

export function legalActions(state, player = state.current) {
  if (state.phase === 'over') return [];
  return MODULES.flatMap((m) => m.legal(state, player));
}

// Players who must act before the game can move on.
export function waitingFor(state) {
  if (state.phase === 'over') return [];
  if (state.pending?.type === 'discard') return Object.keys(state.pending.counts).map(Number);
  if (state.trade) {
    const silent = Object.entries(state.trade.responses).filter(([, r]) => r === null).map(([p]) => Number(p));
    return [state.trade.from, ...silent];
  }
  return [state.current];
}
