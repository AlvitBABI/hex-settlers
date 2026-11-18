import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.js';
import { generateBoard, buildLayout, coastalEdges, hasTouchingRedNumbers } from '../engine/board.js';
import { TILE_COUNTS, NUMBER_TOKENS } from '../engine/constants.js';
import { neighbour, hexId } from '../engine/hex.js';

const boardFor = (seed) => generateBoard(createRng(seed)).board;
const SEEDS = Array.from({ length: 200 }, (_, i) => i);

test('same seed gives the same board, different seeds differ', () => {
  assert.deepEqual(boardFor(123), boardFor(123));
  assert.notDeepEqual(boardFor(123), boardFor(124));
});

test('board is plain JSON (survives a save/load round trip)', () => {
  const b = boardFor(5);
  assert.deepEqual(JSON.parse(JSON.stringify(b)), b);
});

test('generateBoard returns a new rng state', () => {
  const rng = createRng(9);
  assert.notEqual(generateBoard(rng).rng, rng);
});

test('layout has 19 hexes, 54 corners, 72 edges, 30 coastal edges', () => {
  const layout = buildLayout(2);
  assert.equal(layout.hexes.length, 19);
  assert.equal(Object.keys(layout.corners).length, 54);
  assert.equal(Object.keys(layout.edges).length, 72);
  assert.equal(coastalEdges(layout).length, 30);
});

test('right number of each tile and each number token', () => {
  for (const seed of SEEDS) {
    const b = boardFor(seed);
    const counts = {};
    for (const h of b.hexes) counts[h.resource] = (counts[h.resource] ?? 0) + 1;
    assert.deepEqual(counts, TILE_COUNTS);
    const numbers = b.hexes.map((h) => h.number).filter((n) => n !== null).sort((a, b) => a - b);
    assert.deepEqual(numbers, [...NUMBER_TOKENS].sort((a, b) => a - b));
  }
});

test('desert has no number; every other hex has one', () => {
  for (const seed of SEEDS) {
    for (const h of boardFor(seed).hexes) {
      if (h.resource === 'desert') assert.equal(h.number, null);
      else assert.ok(Number.isInteger(h.number));
    }
  }
});

test('no 6 or 8 touches another 6 or 8', () => {
  for (const seed of SEEDS) {
    const b = boardFor(seed);
    assert.equal(hasTouchingRedNumbers(b.hexes), false, `seed ${seed}`);
    // Check it a second way, by hand, so the helper itself is tested.
    const at = new Map(b.hexes.map((h) => [h.id, h.number]));
    for (const h of b.hexes.filter((x) => x.number === 6 || x.number === 8)) {
      for (let d = 0; d < 6; d++) {
        const n = neighbour(h.q, h.r, d);
        assert.ok(![6, 8].includes(at.get(hexId(n.q, n.r))), `seed ${seed}`);
      }
    }
  }
});

test('the red-number checker spots touching 6s', () => {
  const hexes = [
    { id: '0,0', q: 0, r: 0, number: 6 },
    { id: '1,0', q: 1, r: 0, number: 8 },
  ];
  assert.equal(hasTouchingRedNumbers(hexes), true);
});

test('9 ports: 4 at 3:1 and one 2:1 per resource, on coastal edges, none sharing a corner', () => {
  for (const seed of SEEDS) {
    const b = boardFor(seed);
    assert.equal(b.ports.length, 9);
    const types = b.ports.map((p) => p.type).sort();
    assert.deepEqual(types, ['any', 'any', 'any', 'any', 'clay', 'stone', 'wheat', 'wood', 'wool']);
    for (const p of b.ports) {
      assert.equal(p.ratio, p.type === 'any' ? 3 : 2);
      assert.equal(b.edges[p.edge].hexes.length, 1, 'port must be on the coast');
    }
    const corners = b.ports.flatMap((p) => p.corners);
    assert.equal(new Set(corners).size, corners.length);
  }
});
