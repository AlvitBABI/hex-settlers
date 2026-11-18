import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, legalActions, waitingFor } from '../engine/game.js';
import { produce, canPlaceRoad } from '../engine/turn.js';
import { points, longestRoadFor } from '../engine/scoring.js';
import { CORNER_NEIGHBOURS, CORNER_EDGES, CORNER_HEXES, EDGE_CORNERS, HEX_CORNERS } from '../engine/topology.js';
import { handSize } from '../engine/helpers.js';
import { newGame, act, afterSetup, give, emptyHands } from './helpers.js';

test('new game: empty hands, full bank, bandit on the desert', () => {
  const s = newGame();
  assert.equal(s.phase, 'setup');
  assert.equal(s.players.length, 4);
  for (const p of s.players) assert.equal(handSize(p.hand), 0);
  assert.deepEqual(Object.values(s.bank), [19, 19, 19, 19, 19]);
  assert.equal(s.board.hexes.find((h) => h.id === s.bandit).resource, 'desert');
  assert.equal(s.deck.length, 25);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('setup goes in snake order 1-2-3-4-4-3-2-1', () => {
  let s = newGame();
  const seen = [];
  while (s.phase === 'setup') {
    if (s.setup.step === 'settlement') seen.push(s.current);
    s = act(s, legalActions(s)[0]);
  }
  assert.deepEqual(seen, [0, 1, 2, 3, 3, 2, 1, 0]);
  assert.equal(s.phase, 'play');
  assert.equal(s.current, 0);
  for (const p of s.players) {
    assert.equal(p.pieces.settlements, 3);
    assert.equal(p.pieces.roads, 13);
  }
});

test('distance rule: no settlement next to another building', () => {
  const s = newGame();
  const corner = legalActions(s)[0].corner;
  const s2 = act(s, { type: 'placeSettlement', player: 0, corner });
  for (const c of CORNER_NEIGHBOURS[corner]) {
    assert.equal(s2.buildings[c], undefined);
  }
  // Player 0 places a road, then player 1 can't use a neighbouring corner.
  const s3 = act(s2, legalActions(s2)[0]);
  const res = applyAction(s3, { type: 'placeSettlement', player: 1, corner: CORNER_NEIGHBOURS[corner][0] });
  assert.equal(res.ok, false);
});

test('setup road must touch the settlement just placed', () => {
  let s = newGame();
  const corner = legalActions(s)[0].corner;
  s = act(s, { type: 'placeSettlement', player: 0, corner });
  for (const a of legalActions(s)) assert.ok(EDGE_CORNERS[a.edge].includes(corner));
  const far = Object.keys(EDGE_CORNERS).find((e) => !EDGE_CORNERS[e].includes(corner));
  assert.equal(applyAction(s, { type: 'placeRoad', player: 0, edge: far }).ok, false);
});

test('only the second setup settlement collects resources', () => {
  let s = newGame(2);
  s = act(s, legalActions(s)[0]); s = act(s, legalActions(s)[0]); // P1
  s = act(s, legalActions(s)[0]); s = act(s, legalActions(s)[0]); // P2 first
  assert.equal(handSize(s.players[1].hand), 0);
  const corner = legalActions(s)[0].corner;
  s = act(s, legalActions(s)[0]); // P2 second settlement
  const land = CORNER_HEXES[corner].filter((h) => s.board.hexes.find((x) => x.id === h).resource !== 'desert');
  assert.equal(handSize(s.players[1].hand), land.length);
});

test('applyAction never changes the state it was given', () => {
  const s = newGame();
  const before = JSON.stringify(s);
  applyAction(s, legalActions(s)[0]);
  assert.equal(JSON.stringify(s), before);
});

test('acting out of turn or with an unknown action fails', () => {
  const s = newGame();
  assert.equal(applyAction(s, { type: 'placeSettlement', player: 1, corner: legalActions(s)[0].corner }).ok, false);
  assert.equal(applyAction(s, { type: 'fly', player: 0 }).ok, false);
});

test('rolling: must roll before building or ending, only once', () => {
  let s = afterSetup();
  assert.deepEqual(legalActions(s), [{ type: 'roll', player: 0 }]);
  assert.equal(applyAction(s, { type: 'endTurn', player: 0 }).ok, false);
  s = act(s, { type: 'roll', player: 0 });
  assert.ok(s.turn.dice[0] >= 1 && s.turn.dice[0] <= 6);
  assert.equal(applyAction(s, { type: 'roll', player: 0 }).ok, false);
});

test('production: settlements get 1, cities get 2, the bandit blocks', () => {
  const s = afterSetup();
  emptyHands(s);
  const hex = s.board.hexes.find((h) => h.number === 8);
  const [c1, , c3] = HEX_CORNERS[hex.id];
  s.buildings = { [c1]: { player: 0, type: 'settlement' }, [c3]: { player: 1, type: 'city' } };
  produce(s, 8);
  assert.equal(s.players[0].hand[hex.resource] >= 1, true);
  assert.equal(s.players[1].hand[hex.resource] >= 2, true);
  emptyHands(s);
  s.bandit = hex.id;
  const other8 = s.board.hexes.find((h) => h.number === 8 && h.id !== hex.id);
  produce(s, 8);
  const touchesOther = HEX_CORNERS[other8.id].some((c) => s.buildings[c]);
  if (!touchesOther) assert.equal(handSize(s.players[0].hand) + handSize(s.players[1].hand), 0);
});

test('production: bank too short for two players means nobody gets it', () => {
  const s = afterSetup();
  emptyHands(s);
  const hex = s.board.hexes.find((h) => h.number === 5);
  const [c1, , c3] = HEX_CORNERS[hex.id];
  s.buildings = { [c1]: { player: 0, type: 'city' }, [c3]: { player: 1, type: 'city' } };
  s.bandit = 'none';
  s.bank[hex.resource] = 3;
  produce(s, 5);
  const other5 = s.board.hexes.find((h) => h.number === 5 && h.id !== hex.id);
  if (other5.resource !== hex.resource) {
    assert.equal(s.players[0].hand[hex.resource], 0);
    assert.equal(s.bank[hex.resource], 3);
  }
});

test('building a road: costs wood+clay and must connect', () => {
  let s = act(afterSetup(), { type: 'roll', player: 0 });
  emptyHands(s);
  const road = legalActions(s).find((a) => a.type === 'buildRoad');
  assert.equal(road, undefined, 'no road without resources');
  give(s, 0, { wood: 1, clay: 1 });
  const edges = legalActions(s).filter((a) => a.type === 'buildRoad');
  assert.ok(edges.length > 0);
  for (const a of edges) assert.equal(canPlaceRoad(s, 0, a.edge), null);
  s = act(s, edges[0]);
  assert.equal(s.roads[edges[0].edge], 0);
  assert.equal(s.players[0].hand.wood, 0);
  const lonely = Object.keys(EDGE_CORNERS).find((e) => !(e in s.roads) && canPlaceRoad(s, 0, e));
  give(s, 0, { wood: 1, clay: 1 });
  assert.equal(applyAction(s, { type: 'buildRoad', player: 0, edge: lonely }).ok, false);
});

test('an opponent settlement blocks building a road through it', () => {
  const s = afterSetup();
  s.roads = {}; s.buildings = {};
  const corner = Object.keys(CORNER_EDGES).find((c) => CORNER_EDGES[c].length === 3);
  const [e1, e2] = CORNER_EDGES[corner];
  s.roads[e1] = 0;
  s.buildings[corner] = { player: 1, type: 'settlement' };
  assert.notEqual(canPlaceRoad(s, 0, e2), null);
  s.buildings[corner].player = 0;
  assert.equal(canPlaceRoad(s, 0, e2), null);
});

test('settlement needs a road and the right cards; city upgrades it', () => {
  let s = act(afterSetup(), { type: 'roll', player: 0 });
  emptyHands(s);
  give(s, 0, { wood: 3, clay: 3, sheep: 1, wheat: 3, ore: 3 });
  // Build two roads out so a legal settlement spot appears.
  for (let i = 0; i < 2; i++) {
    const spot = legalActions(s).find((a) => a.type === 'buildSettlement');
    if (spot) break;
    s = act(s, legalActions(s).find((a) => a.type === 'buildRoad' &&
      EDGE_CORNERS[a.edge].some((c) => !s.buildings[c] && !CORNER_NEIGHBOURS[c].some((n) => s.buildings[n]))) ??
      legalActions(s).find((a) => a.type === 'buildRoad'));
  }
  const spot = legalActions(s).find((a) => a.type === 'buildSettlement');
  if (spot) {
    const before = points(s, 0);
    s = act(s, spot);
    assert.equal(points(s, 0), before + 1);
  }
  const mine = Object.keys(s.buildings).find((c) => s.buildings[c].player === 0);
  const before = points(s, 0);
  s = act(s, { type: 'buildCity', player: 0, corner: mine });
  assert.equal(s.buildings[mine].type, 'city');
  assert.equal(points(s, 0), before + 1);
  const theirs = Object.keys(s.buildings).find((c) => s.buildings[c].player === 1);
  give(s, 0, { wheat: 2, ore: 3 });
  assert.equal(applyAction(s, { type: 'buildCity', player: 0, corner: theirs }).ok, false);
});

test('ending the turn passes to the next player', () => {
  let s = act(afterSetup(), { type: 'roll', player: 0 });
  s = act(s, { type: 'endTurn', player: 0 });
  assert.equal(s.current, 1);
  assert.equal(s.turn.rolled, false);
  assert.deepEqual(waitingFor(s), [1]);
});

// A path of `n` connected edges that starts at corner `start`.
function pathFrom(start, n) {
  const edges = [];
  const seen = new Set([start]);
  let c = start;
  while (edges.length < n) {
    const e = CORNER_EDGES[c].find((x) => !edges.includes(x) && !seen.has(EDGE_CORNERS[x].find((y) => y !== c)));
    if (!e) return null;
    edges.push(e);
    c = EDGE_CORNERS[e].find((y) => y !== c);
    seen.add(c);
  }
  return edges;
}

test('longest route: 5 roads in a row earns 2 points; a building cuts it', () => {
  let s = act(afterSetup(), { type: 'roll', player: 0 });
  s.roads = {}; s.buildings = {};
  const start = Object.keys(CORNER_EDGES).find((c) => pathFrom(c, 6));
  const path = pathFrom(start, 6);
  for (const e of path.slice(0, 5)) s.roads[e] = 0;
  assert.equal(longestRoadFor(s, 0), 5);
  s = act(s, { type: 'endTurn', player: 0 });
  assert.equal(s.longestRoad.player, 0);
  assert.equal(points(s, 0), 2);
  // Opponent settles in the middle of the chain: it splits into 2 + 3.
  const middle = EDGE_CORNERS[path[1]].find((c) => EDGE_CORNERS[path[2]].includes(c));
  s.buildings[middle] = { player: 1, type: 'settlement' };
  assert.equal(longestRoadFor(s, 0), 3);
});

test('reaching 10 points on your turn wins', () => {
  let s = act(afterSetup(), { type: 'roll', player: 0 });
  // Player 0: one settlement (1) + three cities (6) + two point cards (2) = 9.
  const [settlement, city] = Object.keys(s.buildings).filter((c) => s.buildings[c].player === 0);
  s.buildings[city].type = 'city';
  const empty = Object.keys(CORNER_EDGES).filter((c) => !s.buildings[c]).slice(0, 2);
  for (const c of empty) s.buildings[c] = { player: 0, type: 'city' };
  s.players[0].cards = [{ type: 'point', turn: 0 }, { type: 'point', turn: 0 }];
  assert.equal(points(s, 0), 9);
  assert.equal(points(s, 0, { includeHidden: false }), 7);
  give(s, 0, { wheat: 2, ore: 3 });
  s = act(s, { type: 'buildCity', player: 0, corner: settlement });
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 0);
  assert.equal(applyAction(s, { type: 'endTurn', player: 0 }).ok, false);
});
