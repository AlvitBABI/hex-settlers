// Test helpers: quick game setups. Not a test file itself.
import { createGame, applyAction, legalActions } from '../engine/game.js';

export function newGame(n = 4, seed = 'test') {
  const players = Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, kind: 'bot' }));
  return createGame({ seed, players });
}

// Apply an action and fail loudly if it's illegal.
export function act(state, action) {
  const res = applyAction(state, action);
  if (!res.ok) throw new Error(`${action.type}: ${res.error}`);
  return res.state;
}

// Finish setup by always taking the first legal placement.
export function afterSetup(n = 4, seed = 'test') {
  let s = newGame(n, seed);
  while (s.phase === 'setup') s = act(s, legalActions(s)[0]);
  return s;
}

export const give = (s, p, cards) => {
  for (const [r, n] of Object.entries(cards)) { s.players[p].hand[r] += n; s.bank[r] -= n; }
};

export const emptyHands = (s) => {
  for (const pl of s.players) for (const r of Object.keys(pl.hand)) { s.bank[r] += pl.hand[r]; pl.hand[r] = 0; }
};
