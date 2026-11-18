import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../engine/game.js';
import { spiralOrder, hasTouchingRedNumbers } from '../engine/board.js';
import { throwDice } from '../engine/turn.js';
import { SPIRAL_TOKENS } from '../engine/constants.js';
import { parseHexId, DIRECTIONS } from '../engine/hex.js';

const players = [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }];
const touching = (a, b) => {
  const p = parseHexId(a), q = parseHexId(b);
  return DIRECTIONS.some(([dq, dr]) => p.q + dq === q.q && p.r + dr === q.r);
};

test('options default to spiral numbers, random dice, classic mode', () => {
  const s = createGame({ seed: 1, players });
  assert.deepEqual(s.options, { numbers: 'spiral', dice: 'random', mode: 'classic' });
});

test('spiral order visits all 19 hexes, each step next to the last', () => {
  for (let turn = 0; turn < 6; turn++) {
    const order = spiralOrder(2, turn);
    assert.equal(new Set(order).size, 19);
    for (let i = 1; i < order.length; i++) assert.ok(touching(order[i - 1], order[i]), `turn ${turn} step ${i}`);
  }
});

test('spiral setup lays tokens A-R in spiral order, skipping the desert', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = createGame({ seed, players, options: { numbers: 'spiral' } });
    const numbers = s.board.hexes.filter((h) => h.number !== null);
    assert.equal(numbers.length, 18);
    // Some rotation of the spiral must reproduce the A-R sequence exactly.
    const byId = new Map(s.board.hexes.map((h) => [h.id, h]));
    const ok = [0, 1, 2, 3, 4, 5].some((t) => {
      const seq = spiralOrder(2, t).map((id) => byId.get(id)).filter((h) => h.resource !== 'desert').map((h) => h.number);
      return JSON.stringify(seq) === JSON.stringify(SPIRAL_TOKENS);
    });
    assert.ok(ok, `seed ${seed}`);
    assert.equal(hasTouchingRedNumbers(s.board.hexes), false);
  }
});

test('random setup: 6 and 8 never touch', () => {
  for (let seed = 0; seed < 50; seed++) {
    const s = createGame({ seed, players, options: { numbers: 'random' } });
    assert.equal(hasTouchingRedNumbers(s.board.hexes), false);
  }
});

test('balanced dice: a deck of 36 combinations, so totals follow the odds', () => {
  const s = createGame({ seed: 7, players, options: { dice: 'balanced' } });
  const counts = {};
  // The first 31 rolls all come from one deck (reshuffle at 5 left).
  for (let i = 0; i < 31; i++) {
    const [a, b] = throwDice(s);
    counts[a + b] = (counts[a + b] ?? 0) + 1;
  }
  const ways = (t) => 6 - Math.abs(7 - t);
  for (const [t, n] of Object.entries(counts)) assert.ok(n <= ways(Number(t)), `${t} came up ${n} times`);
  // And it keeps going after a reshuffle.
  for (let i = 0; i < 100; i++) throwDice(s);
  assert.ok(s.diceDeck.length > 5 - 1);
});

test('random dice stay within 1-6', () => {
  const s = createGame({ seed: 3, players, options: { dice: 'random' } });
  for (let i = 0; i < 200; i++) {
    const [a, b] = throwDice(s);
    assert.ok(a >= 1 && a <= 6 && b >= 1 && b <= 6);
  }
});
