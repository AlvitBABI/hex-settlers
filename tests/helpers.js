// Test helpers: quick game setups. Not a test file itself.
import { createGame, applyAction, legalActions } from '../engine/game.js';
import { transfer } from '../engine/knowledge.js';

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

// Shortcuts that deal cards openly from the bank (everyone sees, like
// production), so what bots "know" stays consistent with the hands.
export const give = (s, p, cards) => transfer(s, 'bank', p, cards);

export const emptyHands = (s) => {
  for (const pl of s.players) transfer(s, pl.id, 'bank', { ...pl.hand });
};
