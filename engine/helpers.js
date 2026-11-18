// Small shared helpers for the rules. Pure functions, no DOM.
import { RESOURCES } from './constants.js';

export const clone = (x) => structuredClone(x);

export const emptyHand = () => Object.fromEntries(RESOURCES.map((r) => [r, 0]));

export const handSize = (hand) => RESOURCES.reduce((sum, r) => sum + hand[r], 0);

// Does `hand` hold at least `cards`? e.g. hasCards(hand, { wood: 1, clay: 1 })
export const hasCards = (hand, cards) =>
  Object.entries(cards).every(([r, n]) => (hand[r] ?? 0) >= n);

// Move `cards` from one hand (or the bank) to another.
export function moveCards(from, to, cards) {
  for (const [r, n] of Object.entries(cards)) {
    from[r] -= n;
    to[r] += n;
  }
}

// A valid bundle of cards: only real resources, whole numbers >= 0.
export const isCardBundle = (cards) =>
  cards && typeof cards === 'object' &&
  Object.entries(cards).every(([r, n]) => RESOURCES.includes(r) && Number.isInteger(n) && n >= 0);

export const bundleSize = (cards) => Object.values(cards).reduce((a, b) => a + b, 0);

export const newTurn = (number) => ({
  number, rolled: false, dice: null, cardPlayed: false, freeRoads: 0, offers: 0,
});

// Keeps the last 40 messages; logCount counts every message ever, so the
// screen can tell which ones are new.
export function log(state, text) {
  state.log = [...state.log.slice(-39), text];
  state.logCount = (state.logCount ?? 0) + 1;
}

export const nameOf = (state, p) => state.players[p].name;

// ---- Classic vs Rush ----
// Classic: players take turns. Rush: no turns, everyone acts at once and
// the dice roll on a clock (the screen sends the roll).
export const isRush = (state) => state.mode === 'rush';

// Must this player roll before building/trading? (Never in Rush.)
export const needsRoll = (state) => !isRush(state) && !state.turn.rolled;

// Free roads from a Road Crew card still to place.
export const freeRoadsOf = (state, p) =>
  isRush(state) ? (state.players[p].freeRoads ?? 0) : (p === state.current ? state.turn.freeRoads : 0);
export function setFreeRoads(state, p, n) {
  if (isRush(state)) state.players[p].freeRoads = n;
  else state.turn.freeRoads = n;
}

// One bonus card per turn (Classic) or per dice roll for each player (Rush).
export const cardPlayedBy = (state, p) => (isRush(state) ? !!state.turn.played?.[p] : state.turn.cardPlayed);
export function markCardPlayed(state, p) {
  if (isRush(state)) state.turn.played = { ...(state.turn.played ?? {}), [p]: true };
  else state.turn.cardPlayed = true;
}

// Who moves the bandit / steals right now.
export const banditMover = (state) => state.pending?.player ?? state.current;

// Why a player can't do a normal action right now (or null).
export function mainTurnError(state, player) {
  if (state.phase !== 'play') return 'The game is not in the main phase';
  if (isRush(state)) {
    if (state.pending) return 'Wait: the bandit is being dealt with';
    if (state.trade?.from === player) return 'Close your open trade first';
    return null;
  }
  if (player !== state.current) return 'Not your turn';
  if (state.pending) return 'Finish the current step first';
  if (state.trade) return 'Close the open trade first';
  return null;
}
