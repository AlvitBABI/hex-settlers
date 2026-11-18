// Hex grid maths using axial coordinates (q, r).
// The third "cube" coordinate is always s = -q - r, so we never store it.
//
// Everything here is topology (who touches whom), not pixels:
// - a hex is identified by "q,r"
// - an edge is identified by the two hexes on either side of it
// - a corner is identified by the three hexes that meet at it
// Hexes off the board still count for naming, so coastal edges and
// corners get stable names too.

// The 6 neighbour directions, in order going round the hex.
export const DIRECTIONS = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

export function hexId(q, r) {
  return `${q},${r}`;
}

export function parseHexId(id) {
  const [q, r] = id.split(',').map(Number);
  return { q, r };
}

// Steps from the centre hex to (q, r).
export function distanceFromCentre(q, r) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
}

// All hexes within `radius` steps of the centre, top row first, left to right.
export function hexesInRadius(radius) {
  const out = [];
  for (let r = -radius; r <= radius; r++) {
    for (let q = -radius; q <= radius; q++) {
      if (distanceFromCentre(q, r) <= radius) out.push({ q, r });
    }
  }
  return out;
}

export function neighbour(q, r, dir) {
  const [dq, dr] = DIRECTIONS[dir];
  return { q: q + dq, r: r + dr };
}

function idFromHexes(hexes) {
  return hexes.map((h) => hexId(h.q, h.r)).sort().join('|');
}

// Edge `dir` of a hex is the side it shares with neighbour `dir`.
export function edgeId(q, r, dir) {
  return idFromHexes([{ q, r }, neighbour(q, r, dir)]);
}

// Corner `i` of a hex sits between edge i and edge i+1.
export function cornerId(q, r, i) {
  return idFromHexes([{ q, r }, neighbour(q, r, i), neighbour(q, r, (i + 1) % 6)]);
}

// The two corners at the ends of edge `dir`.
export function edgeCorners(q, r, dir) {
  return [cornerId(q, r, (dir + 5) % 6), cornerId(q, r, dir)];
}
