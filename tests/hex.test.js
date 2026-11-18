import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hexesInRadius, distanceFromCentre, edgeId, cornerId, edgeCorners, neighbour,
} from '../engine/hex.js';

test('radius 2 has 19 hexes in rows of 3-4-5-4-3', () => {
  const hexes = hexesInRadius(2);
  assert.equal(hexes.length, 19);
  const rows = [-2, -1, 0, 1, 2].map((r) => hexes.filter((h) => h.r === r).length);
  assert.deepEqual(rows, [3, 4, 5, 4, 3]);
});

test('distance from centre', () => {
  assert.equal(distanceFromCentre(0, 0), 0);
  assert.equal(distanceFromCentre(2, -1), 2);
  assert.equal(distanceFromCentre(-1, -1), 2);
});

test('neighbours share the same edge name from both sides', () => {
  for (let d = 0; d < 6; d++) {
    const n = neighbour(0, 0, d);
    assert.equal(edgeId(0, 0, d), edgeId(n.q, n.r, (d + 3) % 6));
  }
});

test('three hexes meeting at a corner agree on its name', () => {
  // Corner 0 of the centre hex is also a corner of neighbours 0 and 1.
  const c = cornerId(0, 0, 0);
  const n0 = neighbour(0, 0, 0);
  const n1 = neighbour(0, 0, 1);
  const cornersOf = (h) => [0, 1, 2, 3, 4, 5].map((i) => cornerId(h.q, h.r, i));
  assert.ok(cornersOf(n0).includes(c));
  assert.ok(cornersOf(n1).includes(c));
});

test('an edge joins two corners of its hex', () => {
  const [a, b] = edgeCorners(0, 0, 0);
  assert.notEqual(a, b);
  const corners = [0, 1, 2, 3, 4, 5].map((i) => cornerId(0, 0, i));
  assert.ok(corners.includes(a) && corners.includes(b));
});
