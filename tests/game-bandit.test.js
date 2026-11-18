import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, legalActions, waitingFor } from '../engine/game.js';
import { startSeven, victimsAt } from '../engine/bandit.js';
import { HEX_CORNERS } from '../engine/topology.js';
import { handSize } from '../engine/helpers.js';
import { act, afterSetup, give, emptyHands } from './helpers.js';

// A game where player 0 has just rolled a 7.
function rolledSeven() {
  const s = afterSetup();
  emptyHands(s);
  s.turn.rolled = true;
  s.turn.dice = [3, 4];
  return s;
}

test('7 with small hands: straight to moving the bandit', () => {
  const s = rolledSeven();
  give(s, 1, { wood: 7 });
  startSeven(s);
  assert.deepEqual(s.pending, { type: 'moveBandit' });
});

test('7: more than 7 cards means discarding half (rounded down)', () => {
  let s = rolledSeven();
  give(s, 1, { wood: 5, ore: 4 }); // 9 cards -> discard 4
  give(s, 2, { sheep: 8 });         // 8 cards -> discard 4
  startSeven(s);
  assert.deepEqual(s.pending, { type: 'discard', counts: { 1: 4, 2: 4 } });
  assert.deepEqual(waitingFor(s).sort(), [1, 2]);
  assert.deepEqual(legalActions(s, 1), [{ type: 'discard', player: 1, count: 4 }]);
  assert.equal(applyAction(s, { type: 'discard', player: 1, cards: { wood: 3 } }).ok, false, 'too few');
  assert.equal(applyAction(s, { type: 'discard', player: 1, cards: { sheep: 4 } }).ok, false, 'not owned');
  assert.equal(applyAction(s, { type: 'moveBandit', player: 0, hex: '0,0' }).ok, false, 'must wait');
  s = act(s, { type: 'discard', player: 1, cards: { wood: 2, ore: 2 } });
  assert.equal(handSize(s.players[1].hand), 5);
  s = act(s, { type: 'discard', player: 2, cards: { sheep: 4 } });
  assert.deepEqual(s.pending, { type: 'moveBandit' });
});

test('bandit must move to a new hex, then steal one card from a neighbour', () => {
  let s = rolledSeven();
  startSeven(s);
  assert.equal(applyAction(s, { type: 'moveBandit', player: 0, hex: s.bandit }).ok, false);
  // Find a hex next to player 1 but not player 0.
  const hex = Object.keys(HEX_CORNERS).find((h) =>
    HEX_CORNERS[h].some((c) => s.buildings[c]?.player === 1) &&
    !HEX_CORNERS[h].some((c) => s.buildings[c]?.player === 0) && h !== s.bandit);
  give(s, 1, { clay: 2 });
  s = act(s, { type: 'moveBandit', player: 0, hex });
  assert.equal(s.bandit, hex);
  assert.deepEqual(victimsAt(s, hex, 0), [1]);
  assert.equal(s.pending.type, 'steal');
  assert.equal(applyAction(s, { type: 'steal', player: 0, victim: 2 }).ok, false);
  s = act(s, { type: 'steal', player: 0, victim: 1 });
  assert.equal(s.players[0].hand.clay, 1);
  assert.equal(s.players[1].hand.clay, 1);
  assert.equal(s.pending, null);
});

test('no one to steal from: bandit move ends the step', () => {
  let s = rolledSeven();
  startSeven(s);
  const empty = Object.keys(HEX_CORNERS).find((h) => h !== s.bandit && !HEX_CORNERS[h].some((c) => s.buildings[c]));
  s = act(s, { type: 'moveBandit', player: 0, hex: empty });
  assert.equal(s.pending, null);
  assert.ok(legalActions(s).some((a) => a.type === 'endTurn'));
});

test('the bandit stops its hex producing', async () => {
  const { produce } = await import('../engine/turn.js');
  const s = afterSetup();
  emptyHands(s);
  const hex = s.board.hexes.find((h) => h.number === 6);
  const corner = HEX_CORNERS[hex.id][0];
  s.buildings = { [corner]: { player: 0, type: 'settlement' } };
  s.bandit = hex.id;
  produce(s, 6);
  const otherSix = s.board.hexes.find((h) => h.number === 6 && h.id !== hex.id);
  if (!HEX_CORNERS[otherSix.id].includes(corner)) assert.equal(handSize(s.players[0].hand), 0);
});
