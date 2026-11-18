import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, waitingFor } from '../engine/game.js';
import { chooseAction, timeoutAction, wantsTrade, counterOffer, dealScore } from '../bots/bot.js';
import { points } from '../engine/scoring.js';
import { knownHand } from '../engine/knowledge.js';
import { handSize } from '../engine/helpers.js';
import { act, afterSetup, give, emptyHands } from './helpers.js';

// The notebook never claims more than the truth, and its total is right.
function checkKnowledge(s, seed) {
  for (const o of s.players) {
    for (const p of s.players) {
      const k = knownHand(s, o.id, p.id);
      const sum = Object.values(k.known).reduce((a, b) => a + b, 0) + k.unknown;
      assert.equal(sum, handSize(p.hand), `seed ${seed}: ${o.id} about ${p.id} total`);
      for (const [r, n] of Object.entries(k.known)) assert.ok(n <= p.hand[r], `seed ${seed}: ${o.id} thinks ${p.id} has ${n} ${r}`);
    }
  }
}

// Play a whole game with bots only. Every bot action must be legal.
function playOut(n, seed, pick = chooseAction) {
  let s = createGame({ seed, players: Array.from({ length: n }, (_, i) => ({ name: `Bot ${i + 1}`, kind: 'bot' })) });
  let steps = 0;
  while (s.phase !== 'over' && steps < 30000) {
    let moved = false;
    for (const p of waitingFor(s)) {
      const action = pick(s, p);
      if (!action) continue;
      const res = applyAction(s, action);
      assert.ok(res.ok, `seed ${seed} step ${steps}: ${JSON.stringify(action)} -> ${res.error}`);
      s = res.state;
      checkKnowledge(s, seed);
      moved = true;
      steps++;
      break;
    }
    assert.ok(moved, `seed ${seed}: nobody could move`);
  }
  return { s, steps };
}

for (const n of [2, 3, 4]) {
  test(`${n} bots play a full game to a winner`, () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { s } = playOut(n, `${n}-${seed}`);
      assert.equal(s.phase, 'over', `seed ${seed} did not finish`);
      assert.ok(points(s, s.winner) >= 10);
    }
  });
}

test('timer-out play never gets stuck either (game moves on)', () => {
  // Everyone just rolls and ends turns: no winner expected, but no errors.
  let s = createGame({ seed: 't', players: [{ name: 'A', kind: 'human' }, { name: 'B', kind: 'human' }] });
  for (let i = 0; i < 400 && s.phase !== 'over'; i++) {
    const p = waitingFor(s)[0];
    const res = applyAction(s, timeoutAction(s, p));
    assert.ok(res.ok, res.error);
    s = res.state;
  }
  assert.equal(s.phase, 'play');
});

test('bots accept trades that help them and refuse a near-winner', () => {
  let s = act(afterSetup(), { type: 'roll', player: 0 });
  s.pending = null;
  emptyHands(s);
  // Player 1 is one wheat short of a city and has a spare sheep.
  give(s, 0, { wheat: 1, wood: 1 });
  give(s, 1, { ore: 3, wheat: 1, sheep: 1 });
  const offer = act(s, { type: 'offerTrade', player: 0, give: { wheat: 1 }, get: { sheep: 1 } });
  assert.equal(wantsTrade(offer, 1), true);
  // Asking for ore would wreck their city plan: refused.
  const bad = act(s, { type: 'offerTrade', player: 0, give: { wood: 1 }, get: { ore: 1 } });
  assert.equal(wantsTrade(bad, 1), false);
  // The good offer from someone on 8 visible points: refused.
  const leader = structuredClone(offer);
  for (const c of Object.keys(leader.buildings)) if (leader.buildings[c].player === 0) leader.buildings[c].type = 'city';
  leader.largestArmy = { player: 0, count: 3 };
  leader.longestRoad = { player: 0, length: 5 };
  assert.ok(points(leader, 0, { includeHidden: false }) >= 8);
  assert.equal(wantsTrade(leader, 1), false);
});

test('a bot offers a trade when one card short, then confirms with an accepter', () => {
  let s = act(afterSetup(), { type: 'roll', player: 0 });
  s.pending = null;
  emptyHands(s);
  give(s, 0, { ore: 3, wheat: 1, sheep: 2 }); // one wheat short of a city
  give(s, 2, { wheat: 2 });
  const offer = chooseAction(s, 0);
  assert.equal(offer.type, 'offerTrade');
  assert.deepEqual(offer.get, { wheat: 1 });
  s = act(s, offer);
  assert.equal(chooseAction(s, 0), null, 'waits for answers');
  for (const p of [1, 2, 3]) s = act(s, { type: 'respondTrade', player: p, accept: p === 2 });
  assert.deepEqual(chooseAction(s, 0), { type: 'confirmTrade', player: 0, with: 2 });
});

test('bots take a 2-for-1 in their favour even if they do not need it', () => {
  let s = act(afterSetup(), { type: 'roll', player: 0 });
  s.pending = null;
  emptyHands(s);
  give(s, 0, { sheep: 2 });
  give(s, 1, { clay: 3, ore: 3, wheat: 2 }); // plenty of clay, saving for a city
  const two = act(s, { type: 'offerTrade', player: 0, give: { sheep: 2 }, get: { clay: 1 } });
  assert.equal(wantsTrade(two, 1), true);
  const one = act(s, { type: 'offerTrade', player: 0, give: { sheep: 1 }, get: { clay: 1 } });
  assert.ok(dealScore(one, 1, { sheep: 1 }, { clay: 1 }) < dealScore(two, 1, { sheep: 2 }, { clay: 1 }));
  // Asking for city ore, even 2-for-1, is refused.
  const ore = act(s, { type: 'offerTrade', player: 0, give: { sheep: 2 }, get: { ore: 1 } });
  assert.equal(wantsTrade(ore, 1), false);
});

test('a bot answers a bad offer with a counter-offer it would accept', () => {
  let s = act(afterSetup(), { type: 'roll', player: 0 });
  s.pending = null;
  emptyHands(s);
  give(s, 0, { wood: 1, wheat: 1 });
  give(s, 1, { ore: 3, sheep: 2 }); // wants wheat for a city, spare sheep
  s = act(s, { type: 'offerTrade', player: 0, give: { wood: 1 }, get: { ore: 1 } });
  assert.equal(wantsTrade(s, 1), false);
  const counter = counterOffer(s, 1);
  assert.ok(counter, 'expected a counter');
  assert.deepEqual(counter.get, { wheat: 1 });
  const a = chooseAction(s, 1);
  assert.equal(a.type, 'respondTrade');
  assert.deepEqual(a.counter, counter);
  s = act(s, a);
  assert.equal(s.trade.responses[1], 'counter');
});
