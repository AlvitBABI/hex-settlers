import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knownHand } from '../engine/knowledge.js';
import { startSeven } from '../engine/bandit.js';
import { HEX_CORNERS } from '../engine/topology.js';
import { handSize } from '../engine/helpers.js';
import { act, afterSetup } from './helpers.js';

const known = (s, o, p) => knownHand(s, o, p);

test('setup resources are seen by everyone', () => {
  const s = afterSetup();
  for (const p of s.players) {
    const k = known(s, (p.id + 1) % 4, p.id);
    assert.deepEqual(k.known, p.hand);
    assert.equal(k.unknown, 0);
  }
});

test('you always know your own hand exactly', () => {
  const s = afterSetup();
  assert.deepEqual(known(s, 2, 2).known, s.players[2].hand);
});

test('a steal is only seen by the thief and the victim', () => {
  let s = act(afterSetup(), { type: 'roll', player: 0 });
  s.pending = null;
  s.turn.rolled = true;
  startSeven(s);
  if (s.pending.type === 'discard') return; // rare: big hands after setup
  const hex = Object.keys(HEX_CORNERS).find((h) => h !== s.bandit &&
    HEX_CORNERS[h].some((c) => s.buildings[c]?.player === 1 && handSize(s.players[1].hand) > 0) &&
    !HEX_CORNERS[h].some((c) => s.buildings[c]?.player === 0));
  if (!hex) return;
  s = act(s, { type: 'moveBandit', player: 0, hex });
  if (s.pending?.type === 'steal') s = act(s, { type: 'steal', player: 0, victim: 1 }); // else robbed automatically
  // Thief and victim know exactly.
  assert.deepEqual(known(s, 1, 0).known, s.players[0].hand);
  assert.deepEqual(known(s, 0, 1).known, s.players[1].hand);
  // Player 2 only knows one unknown card moved.
  assert.equal(known(s, 2, 0).unknown, 1);
  assert.equal(known(s, 2, 1).unknown + Object.values(known(s, 2, 1).known).reduce((a, b) => a + b, 0), handSize(s.players[1].hand));
});
