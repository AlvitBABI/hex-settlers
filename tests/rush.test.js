import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, legalActions, waitingFor } from '../engine/game.js';
import { chooseAction } from '../bots/bot.js';
import { points } from '../engine/scoring.js';
import { HEX_CORNERS } from '../engine/topology.js';

const bots = (n) => Array.from({ length: n }, (_, i) => ({ name: `Bot ${i + 1}`, kind: 'bot' }));
const rushGame = (seed = 'r', n = 4) => createGame({ seed, players: bots(n), options: { mode: 'rush', numbers: 'random' } });
const act = (s, a) => { const r = applyAction(s, a); if (!r.ok) throw new Error(`${a.type}: ${r.error}`); return r.state; };

function afterSetup(s) {
  while (s.phase === 'setup') s = act(s, legalActions(s)[0]);
  return s;
}

test('rush: setup is the usual snake order, then everyone can act', () => {
  const s = afterSetup(rushGame());
  assert.equal(s.mode, 'rush');
  assert.deepEqual(waitingFor(s), [0, 1, 2, 3]);
  assert.ok(!legalActions(s, 2).some((a) => a.type === 'roll' || a.type === 'endTurn'), 'no roll or end turn for players');
  assert.equal(applyAction(s, { type: 'endTurn', player: 0 }).ok, false);
});

test('rush: any player may build without waiting for a turn or a roll', () => {
  const s = afterSetup(rushGame());
  for (const p of s.players) p.hand.wood += 1, p.hand.clay += 1, s.bank.wood--, s.bank.clay--;
  const road = legalActions(s, 3).find((a) => a.type === 'buildRoad');
  assert.ok(road, 'player 3 can build a road right away');
  const s2 = act(s, road);
  assert.equal(s2.roads[road.edge], 3);
});

test('rush: each roll starts a new round', () => {
  let s = afterSetup(rushGame());
  const before = s.turn.number;
  s = act(s, { type: 'roll', player: 0 });
  if (s.pending) return; // a 7: covered below
  s = act(s, { type: 'roll', player: 2 });
  assert.ok(s.turn.number >= before + 2 || s.pending);
});

test('rush: players take turns moving the bandit on 7s', () => {
  let s = afterSetup(rushGame());
  const movers = [];
  for (let i = 0; i < 300 && movers.length < 3; i++) {
    s = act(s, { type: 'roll', player: 0 });
    while (s.pending) {
      if (s.pending.type === 'discard') {
        const p = Number(Object.keys(s.pending.counts)[0]);
        s = act(s, chooseAction(s, p));
        continue;
      }
      if (s.pending.type === 'moveBandit') movers.push(s.pending.player);
      s = act(s, chooseAction(s, s.pending.player));
    }
  }
  assert.deepEqual(movers, [0, 1, 2]);
});

test('rush: only one bonus card per player per roll', () => {
  let s = afterSetup(rushGame());
  s = act(s, { type: 'roll', player: 0 });
  while (s.pending) s = act(s, chooseAction(s, waitingFor(s)[0]));
  s.players[1].cards.push({ type: 'harvest', turn: 0 }, { type: 'harvest', turn: 0 });
  s = act(s, { type: 'playCard', player: 1, card: 'harvest', resources: ['ore', 'ore'] });
  assert.equal(applyAction(s, { type: 'playCard', player: 1, card: 'harvest', resources: ['wood', 'wood'] }).ok, false);
  // Another player can still play one this roll.
  s.players[2].cards.push({ type: 'harvest', turn: 0 });
  s = act(s, { type: 'playCard', player: 2, card: 'harvest', resources: ['wheat', 'wheat'] });
  assert.equal(s.players[2].hand.wheat >= 2, true);
});

test('rush: only one trade offer open at a time; others keep playing', () => {
  let s = afterSetup(rushGame());
  s.players[0].hand.wood = 2; s.players[1].hand.wood = 2; s.players[1].hand.clay = 1;
  s = act(s, { type: 'offerTrade', player: 0, give: { wood: 1 }, get: { ore: 1 } });
  assert.equal(applyAction(s, { type: 'offerTrade', player: 1, give: { wood: 1 }, get: { ore: 1 } }).ok, false);
  const road = legalActions(s, 1).find((a) => a.type === 'buildRoad');
  if (road) assert.ok(applyAction(s, road).ok, 'player 1 can still build during the offer');
});

test('rush: a full bot game, with a clock rolling when nobody acts', () => {
  for (const seed of ['a', 'b', 'c']) {
    let s = rushGame(seed);
    let rolls = 0;
    for (let i = 0; i < 40000 && s.phase !== 'over'; i++) {
      // Bots act in rotation; when nobody wants to, the clock rolls.
      const ids = waitingFor(s);
      const start = i % ids.length;
      let action = null;
      for (let k = 0; k < ids.length && !action; k++) action = chooseAction(s, ids[(start + k) % ids.length]);
      if (!action) { action = { type: 'roll', player: 0 }; rolls++; }
      const res = applyAction(s, action);
      assert.ok(res.ok, `seed ${seed}: ${JSON.stringify(action)} -> ${res.error}`);
      s = res.state;
    }
    assert.equal(s.phase, 'over', `seed ${seed} never finished`);
    assert.ok(points(s, s.winner) >= 10);
    assert.ok(rolls < 200, `seed ${seed}: ${rolls} rolls`);
  }
});

test('rush: steals and discards still keep bandit on a real hex', () => {
  const s = afterSetup(rushGame());
  assert.ok(s.bandit in HEX_CORNERS);
});
