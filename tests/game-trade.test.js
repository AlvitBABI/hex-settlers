import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, legalActions, waitingFor } from '../engine/game.js';
import { tradeRatio } from '../engine/trade.js';
import { act, afterSetup, give, emptyHands } from './helpers.js';

function myTurn() {
  const s = act(afterSetup(), { type: 'roll', player: 0 });
  s.pending = null; // in case it was a 7
  emptyHands(s);
  s.buildings = {};
  return s;
}

test('bank trade is 4:1 without a port', () => {
  let s = myTurn();
  give(s, 0, { wood: 4 });
  assert.equal(tradeRatio(s, 0, 'wood'), 4);
  s = act(s, { type: 'bankTrade', player: 0, give: 'wood', get: 'ore' });
  assert.equal(s.players[0].hand.wood, 0);
  assert.equal(s.players[0].hand.ore, 1);
  give(s, 0, { wood: 3 });
  assert.equal(applyAction(s, { type: 'bankTrade', player: 0, give: 'wood', get: 'ore' }).ok, false);
  assert.equal(applyAction(s, { type: 'bankTrade', player: 0, give: 'wood', get: 'wood' }).ok, false);
});

test('ports: 3:1 for any, 2:1 for their own resource', () => {
  const s = myTurn();
  const any = s.board.ports.find((p) => p.type === 'any');
  const special = s.board.ports.find((p) => p.type !== 'any');
  s.buildings[any.corners[0]] = { player: 0, type: 'settlement' };
  assert.equal(tradeRatio(s, 0, 'wood'), 3);
  s.buildings[special.corners[1]] = { player: 0, type: 'city' };
  assert.equal(tradeRatio(s, 0, special.type), 2);
  assert.equal(tradeRatio(s, 1, special.type), 4);
});

test('player trade: offer, accept, confirm swaps the cards', () => {
  let s = myTurn();
  give(s, 0, { wood: 2 });
  give(s, 2, { ore: 1 });
  s = act(s, { type: 'offerTrade', player: 0, give: { wood: 2 }, get: { ore: 1 } });
  assert.deepEqual(s.trade.responses, { 1: null, 2: null, 3: null });
  assert.deepEqual(waitingFor(s), [0, 1, 2, 3]);
  // Player 1 has no ore, so can't accept.
  assert.equal(applyAction(s, { type: 'respondTrade', player: 1, accept: true }).ok, false);
  s = act(s, { type: 'respondTrade', player: 1, accept: false });
  s = act(s, { type: 'respondTrade', player: 2, accept: true });
  assert.equal(applyAction(s, { type: 'confirmTrade', player: 0, with: 1 }).ok, false);
  assert.equal(applyAction(s, { type: 'endTurn', player: 0 }).ok, false, 'trade still open');
  assert.ok(legalActions(s, 0).some((a) => a.type === 'confirmTrade' && a.with === 2));
  s = act(s, { type: 'confirmTrade', player: 0, with: 2 });
  assert.equal(s.trade, null);
  assert.equal(s.players[0].hand.ore, 1);
  assert.equal(s.players[2].hand.wood, 2);
});

test('player trade: bad offers are refused, cancel closes it', () => {
  let s = myTurn();
  give(s, 0, { wood: 1 });
  assert.equal(applyAction(s, { type: 'offerTrade', player: 0, give: { wood: 2 }, get: { ore: 1 } }).ok, false, 'not owned');
  assert.equal(applyAction(s, { type: 'offerTrade', player: 0, give: { wood: 1 }, get: {} }).ok, false, 'empty side');
  assert.equal(applyAction(s, { type: 'offerTrade', player: 0, give: { wood: 1 }, get: { wood: 1 } }).ok, false, 'same both sides');
  assert.equal(applyAction(s, { type: 'offerTrade', player: 0, give: { gold: 1 }, get: { ore: 1 } }).ok, false, 'not a resource');
  s = act(s, { type: 'offerTrade', player: 0, give: { wood: 1 }, get: { ore: 1 } });
  assert.equal(applyAction(s, { type: 'cancelTrade', player: 1 }).ok, false);
  s = act(s, { type: 'cancelTrade', player: 0 });
  assert.equal(s.trade, null);
});

test('no trading before rolling', () => {
  const s = afterSetup();
  give(s, 0, { wood: 4 });
  assert.equal(applyAction(s, { type: 'bankTrade', player: 0, give: 'wood', get: 'ore' }).ok, false);
});

test('bank trade with bundles: several lots at different ratios', () => {
  let s = myTurn();
  const special = s.board.ports.find((p) => p.type !== 'any');
  s.buildings[special.corners[0]] = { player: 0, type: 'settlement' };
  const r2 = special.type; // 2:1 for this one
  const other = ['wood', 'clay', 'sheep', 'wheat', 'ore'].find((r) => r !== r2);
  const want = ['wood', 'clay', 'sheep', 'wheat', 'ore'].filter((r) => r !== r2 && r !== other);
  give(s, 0, { [r2]: 4, [other]: 4 });
  // 4 of the 2:1 resource = 2 cards, 4 of the other at 4:1 = 1 card.
  s = act(s, { type: 'bankTrade', player: 0, give: { [r2]: 4, [other]: 4 }, get: { [want[0]]: 2, [want[1]]: 1 } });
  assert.equal(s.players[0].hand[want[0]], 2);
  assert.equal(s.players[0].hand[want[1]], 1);
  give(s, 0, { [other]: 3 });
  assert.equal(applyAction(s, { type: 'bankTrade', player: 0, give: { [other]: 3 }, get: { [r2]: 1 } }).ok, false, 'not a full lot');
  give(s, 0, { [other]: 1 });
  assert.equal(applyAction(s, { type: 'bankTrade', player: 0, give: { [other]: 4 }, get: { [r2]: 2 } }).ok, false, 'asks too much');
});

test('counter-offer: responder proposes new terms, offerer can take them', () => {
  let s = myTurn();
  give(s, 0, { wood: 2, clay: 1 });
  give(s, 1, { ore: 2 });
  s = act(s, { type: 'offerTrade', player: 0, give: { wood: 1 }, get: { ore: 1 } });
  // Player 1 wants 2 wood instead.
  s = act(s, { type: 'respondTrade', player: 1, accept: false, counter: { give: { ore: 1 }, get: { wood: 2 } } });
  assert.equal(s.trade.responses[1], 'counter');
  assert.ok(legalActions(s, 0).some((a) => a.type === 'confirmTrade' && a.with === 1));
  s = act(s, { type: 'confirmTrade', player: 0, with: 1 });
  assert.equal(s.players[0].hand.wood, 0);
  assert.equal(s.players[0].hand.ore, 1);
  assert.equal(s.players[1].hand.wood, 2);
});

test('a counter must be cards the responder actually has', () => {
  let s = myTurn();
  give(s, 0, { wood: 1 });
  s = act(s, { type: 'offerTrade', player: 0, give: { wood: 1 }, get: { ore: 1 } });
  assert.equal(applyAction(s, { type: 'respondTrade', player: 1, accept: false, counter: { give: { ore: 1 }, get: { wood: 1 } } }).ok, false);
});
