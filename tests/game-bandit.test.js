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
  assert.deepEqual(s.pending, { type: 'moveBandit', player: 0 });
});

test('7: more than 7 cards means discarding half (rounded down)', () => {
  let s = rolledSeven();
  give(s, 1, { wood: 5, ore: 4 }); // 9 cards -> discard 4
  give(s, 2, { sheep: 8 });         // 8 cards -> discard 4
  startSeven(s);
  assert.deepEqual(s.pending, { type: 'discard', counts: { 1: 4, 2: 4 }, player: 0 });
  assert.deepEqual(waitingFor(s).sort(), [1, 2]);
  assert.deepEqual(legalActions(s, 1), [{ type: 'discard', player: 1, count: 4 }]);
  assert.equal(applyAction(s, { type: 'discard', player: 1, cards: { wood: 3 } }).ok, false, 'too few');
  assert.equal(applyAction(s, { type: 'discard', player: 1, cards: { sheep: 4 } }).ok, false, 'not owned');
  assert.equal(applyAction(s, { type: 'moveBandit', player: 0, hex: '0,0' }).ok, false, 'must wait');
  s = act(s, { type: 'discard', player: 1, cards: { wood: 2, ore: 2 } });
  assert.equal(handSize(s.players[1].hand), 5);
  s = act(s, { type: 'discard', player: 2, cards: { sheep: 4 } });
  assert.deepEqual(s.pending, { type: 'moveBandit', player: 0 });
});

test('bandit must move to a new hex; with one neighbour it robs them at once', () => {
  let s = rolledSeven();
  startSeven(s);
  assert.equal(applyAction(s, { type: 'moveBandit', player: 0, hex: s.bandit }).ok, false);
  // Find a hex next to player 1 only.
  const hex = Object.keys(HEX_CORNERS).find((h) => h !== s.bandit &&
    HEX_CORNERS[h].some((c) => s.buildings[c]?.player === 1) &&
    !HEX_CORNERS[h].some((c) => s.buildings[c] && s.buildings[c].player !== 1));
  give(s, 1, { clay: 2 });
  s = act(s, { type: 'moveBandit', player: 0, hex });
  assert.equal(s.bandit, hex);
  assert.equal(s.pending, null, 'no need to pick the only victim');
  assert.equal(s.players[0].hand.clay, 1);
  assert.equal(s.players[1].hand.clay, 1);
});

test('with two neighbours to rob, the mover picks one', () => {
  let s = rolledSeven();
  startSeven(s);
  // Put players 1 and 2 on the same hex.
  const hex = Object.keys(HEX_CORNERS).find((h) => h !== s.bandit && !HEX_CORNERS[h].some((c) => s.buildings[c]));
  const [a, , c] = HEX_CORNERS[hex];
  s.buildings[a] = { player: 1, type: 'settlement' };
  s.buildings[c] = { player: 2, type: 'settlement' };
  give(s, 1, { clay: 1 });
  give(s, 2, { ore: 1 });
  s = act(s, { type: 'moveBandit', player: 0, hex });
  assert.deepEqual(s.pending, { type: 'steal', victims: [1, 2], player: 0 });
  assert.equal(applyAction(s, { type: 'steal', player: 0, victim: 3 }).ok, false);
  s = act(s, { type: 'steal', player: 0, victim: 2 });
  assert.equal(s.players[0].hand.ore, 1);
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
