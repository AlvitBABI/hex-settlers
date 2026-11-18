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

// Why the current player can't do a normal turn action right now (or null).
export function mainTurnError(state, player) {
  if (state.phase !== 'play') return 'The game is not in the main phase';
  if (player !== state.current) return 'Not your turn';
  if (state.pending) return 'Finish the current step first';
  if (state.trade) return 'Close the open trade first';
  return null;
}
