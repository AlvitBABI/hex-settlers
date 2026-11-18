import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, legalActions } from '../engine/game.js';
import { points } from '../engine/scoring.js';
import { act, afterSetup, give, emptyHands } from './helpers.js';

function myTurn() {
  const s = act(afterSetup(), { type: 'roll', player: 0 });
  s.pending = null;
  emptyHands(s);
  return s;
}

// Give player p a card bought on an earlier turn (so it's playable).
const oldCard = (s, p, type) => s.players[p].cards.push({ type, turn: s.turn.number - 1 });

test('buying a bonus card costs sheep + wheat + ore and takes from the deck', () => {
  let s = myTurn();
  give(s, 0, { sheep: 1, wheat: 1, ore: 1 });
  const top = s.deck[0];
  s = act(s, { type: 'buyCard', player: 0 });
  assert.equal(s.deck.length, 24);
  assert.deepEqual(s.players[0].cards, [{ type: top, turn: s.turn.number }]);
  assert.equal(applyAction(s, { type: 'buyCard', player: 0 }).ok, false, 'cannot afford another');
});

test('a card cannot be played on the turn it was bought', () => {
  const s = myTurn();
  s.players[0].cards.push({ type: 'soldier', turn: s.turn.number });
  assert.equal(applyAction(s, { type: 'playCard', player: 0, card: 'soldier' }).ok, false);
});

test('soldier moves the bandit; only one card per turn; can be played before rolling', () => {
  let s = afterSetup();
  oldCard(s, 0, 'soldier'); oldCard(s, 0, 'soldier');
  assert.ok(legalActions(s).some((a) => a.type === 'playCard'));
  s = act(s, { type: 'playCard', player: 0, card: 'soldier' });
  assert.deepEqual(s.pending, { type: 'moveBandit', player: 0 });
  assert.equal(s.players[0].soldiers, 1);
  const hex = legalActions(s)[0].hex;
  s = act(s, { type: 'moveBandit', player: 0, hex });
  if (s.pending) s = act(s, legalActions(s)[0]);
  assert.equal(applyAction(s, { type: 'playCard', player: 0, card: 'soldier' }).ok, false, 'one per turn');
  assert.deepEqual(legalActions(s), [{ type: 'roll', player: 0 }]);
});

test('three soldiers earn the Strongest Army bonus (2 points); more beats it', () => {
  const s = myTurn();
  s.players[0].soldiers = 2;
  oldCard(s, 0, 'soldier');
  const before = points(s, 0);
  const s2 = act(s, { type: 'playCard', player: 0, card: 'soldier' });
  assert.deepEqual(s2.largestArmy, { player: 0, count: 3 });
  assert.equal(points(s2, 0), before + 2);
  // Player 1 with 4 soldiers would take it.
  const s3 = structuredClone(s2);
  s3.pending = null; s3.turn.cardPlayed = false; s3.current = 1; s3.turn.rolled = true;
  s3.players[1].soldiers = 3;
  oldCard(s3, 1, 'soldier');
  const s4 = act(s3, { type: 'playCard', player: 1, card: 'soldier' });
  assert.equal(s4.largestArmy.player, 1);
});

test('harvest takes any two resources from the bank', () => {
  let s = myTurn();
  oldCard(s, 0, 'harvest');
  s = act(s, { type: 'playCard', player: 0, card: 'harvest', resources: ['ore', 'ore'] });
  assert.equal(s.players[0].hand.ore, 2);
  assert.equal(s.players[0].cards.length, 0);
});

test('monopoly takes every card of one resource from everyone else', () => {
  let s = myTurn();
  oldCard(s, 0, 'monopoly');
  give(s, 1, { wheat: 3, wood: 1 });
  give(s, 3, { wheat: 2 });
  s = act(s, { type: 'playCard', player: 0, card: 'monopoly', resource: 'wheat' });
  assert.equal(s.players[0].hand.wheat, 5);
  assert.equal(s.players[1].hand.wheat, 0);
  assert.equal(s.players[1].hand.wood, 1);
});

test('road crew: two free roads, and nothing else until they are placed', () => {
  let s = myTurn();
  oldCard(s, 0, 'roads');
  s = act(s, { type: 'playCard', player: 0, card: 'roads' });
  assert.equal(s.turn.freeRoads, 2);
  assert.ok(legalActions(s).every((a) => a.type === 'buildRoad'));
  assert.equal(applyAction(s, { type: 'endTurn', player: 0 }).ok, false);
  s = act(s, legalActions(s)[0]);
  s = act(s, legalActions(s)[0]);
  assert.equal(s.turn.freeRoads, 0);
  assert.equal(s.players[0].pieces.roads, 11);
  assert.ok(legalActions(s).some((a) => a.type === 'endTurn'));
});

test('point cards count but cannot be played', () => {
  const s = myTurn();
  oldCard(s, 0, 'point');
  assert.equal(points(s, 0) - points(s, 0, { includeHidden: false }), 1);
  assert.equal(applyAction(s, { type: 'playCard', player: 0, card: 'point' }).ok, false);
});
