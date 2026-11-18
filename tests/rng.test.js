import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, nextFloat, nextInt, shuffle } from '../engine/rng.js';

test('same seed gives the same sequence', () => {
  const run = (seed) => {
    let rng = createRng(seed);
    const out = [];
    for (let i = 0; i < 5; i++) { const r = nextFloat(rng); out.push(r.value); rng = r.rng; }
    return out;
  };
  assert.deepEqual(run(42), run(42));
  assert.deepEqual(run('hello'), run('hello'));
  assert.notDeepEqual(run(42), run(43));
});

test('floats stay in [0, 1) and ints in range', () => {
  let rng = createRng(1);
  for (let i = 0; i < 1000; i++) {
    const f = nextFloat(rng);
    assert.ok(f.value >= 0 && f.value < 1);
    const n = nextInt(f.rng, 6);
    assert.ok(Number.isInteger(n.value) && n.value >= 0 && n.value < 6);
    rng = n.rng;
  }
});

test('rng state is a plain number (fits in JSON)', () => {
  const rng = createRng('abc');
  assert.equal(typeof rng, 'number');
  assert.equal(typeof nextFloat(rng).rng, 'number');
});

test('shuffle keeps the same items and does not change its input', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const { result } = shuffle(createRng(7), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...result].sort(), [...input].sort());
});
