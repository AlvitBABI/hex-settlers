// Random board generation. Pure: no DOM, no Math.random.
import { shuffle } from './rng.js';
import {
  hexId, parseHexId, hexesInRadius, neighbour,
  edgeId, cornerId, edgeCorners,
} from './hex.js';
import {
  BOARD_RADIUS, TILE_COUNTS, NUMBER_TOKENS, RED_NUMBERS, PORT_TYPES, PORT_GAPS,
} from './constants.js';

// Build the empty map: hexes, plus every corner and edge that touches one.
export function buildLayout(radius = BOARD_RADIUS) {
  const hexes = [];
  const corners = {};
  const edges = {};
  for (const { q, r } of hexesInRadius(radius)) {
    const id = hexId(q, r);
    const hex = { id, q, r, corners: [], edges: [] };
    for (let i = 0; i < 6; i++) {
      const c = cornerId(q, r, i);
      corners[c] ??= { id: c, hexes: [] };
      corners[c].hexes.push(id);
      hex.corners.push(c);

      const e = edgeId(q, r, i);
      edges[e] ??= { id: e, corners: edgeCorners(q, r, i), hexes: [] };
      edges[e].hexes.push(id);
      hex.edges.push(e);
    }
    hexes.push(hex);
  }
  return { radius, hexes, corners, edges };
}

// Coastal edges (only one land hex next to them), in order going round.
export function coastalEdges(layout) {
  const angleOf = (edge) => {
    // Middle of the two hex centres on either side of the edge.
    let x = 0, y = 0;
    for (const id of edge.id.split('|')) {
      const { q, r } = parseHexId(id);
      x += Math.sqrt(3) * (q + r / 2);
      y += 1.5 * r;
    }
    return Math.atan2(y, x);
  };
  return Object.values(layout.edges)
    .filter((e) => e.hexes.length === 1)
    .sort((a, b) => angleOf(a) - angleOf(b));
}

// True if any two hexes holding a 6 or 8 are neighbours.
export function hasTouchingRedNumbers(hexes) {
  const numberAt = new Map(hexes.map((h) => [h.id, h.number]));
  return hexes.some((h) => RED_NUMBERS.includes(h.number) &&
    [0, 1, 2, 3, 4, 5].some((d) => {
      const n = neighbour(h.q, h.r, d);
      return RED_NUMBERS.includes(numberAt.get(hexId(n.q, n.r)));
    }));
}

// generateBoard(rng) -> { board, rng }
// Takes the random-number state and returns the next one, so the caller
// (later: the game state) keeps control of all randomness.
export function generateBoard(rng) {
  const layout = buildLayout(BOARD_RADIUS);

  // 1. Shuffle the tiles onto the hexes.
  const tiles = Object.entries(TILE_COUNTS).flatMap(([type, n]) => Array(n).fill(type));
  let s = shuffle(rng, tiles);
  rng = s.rng;
  const hexes = layout.hexes.map((h, i) => ({ ...h, resource: s.result[i], number: null }));

  // 2. Shuffle number tokens onto non-desert hexes until no 6/8 touch.
  const land = hexes.filter((h) => h.resource !== 'desert');
  for (let attempt = 0; ; attempt++) {
    if (attempt === 10000) throw new Error('Could not place number tokens');
    s = shuffle(rng, NUMBER_TOKENS);
    rng = s.rng;
    land.forEach((h, i) => { h.number = s.result[i]; });
    if (!hasTouchingRedNumbers(hexes)) break;
  }

  // 3. Ports sit at fixed spots round the coast; their types are shuffled.
  const coast = coastalEdges(layout);
  s = shuffle(rng, PORT_TYPES);
  rng = s.rng;
  const ports = [];
  let index = 0;
  PORT_GAPS.forEach((gap, i) => {
    const edge = coast[index];
    const type = s.result[i];
    ports.push({
      edge: edge.id,
      corners: edge.corners,
      hex: edge.hexes[0],
      type,
      ratio: type === 'any' ? 3 : 2,
    });
    index += gap;
  });

  const board = {
    radius: layout.radius,
    hexes,
    corners: layout.corners,
    edges: layout.edges,
    ports,
  };
  return { board, rng };
}

