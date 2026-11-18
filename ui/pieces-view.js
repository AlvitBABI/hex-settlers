// Draws the changing things on top of the board: roads, buildings,
// the bandit, the hexes that just produced, and tappable spots.
import { EDGE_CORNERS } from '../engine/topology.js';
import { SIZE, el, pointFromId, hexCentre, hexPoints } from './geometry.js';
import { PLAYER_COLOURS } from './art.js';

const SHAPES = {
  settlement: [[-8, 6], [-8, -2], [0, -9], [8, -2], [8, 6]],
  city: [[-12, 7], [-12, -3], [-6, -9], [0, -3], [0, -1], [12, -1], [12, 7]],
};
const SCALE = 1.25;
const shape = (type, x, y) => SHAPES[type].map(([dx, dy]) => `${x + dx * SCALE},${y + dy * SCALE}`).join(' ');

// Road line from corner a to corner b, pulled in a little at each end.
function roadLine(edge) {
  const [a, b] = EDGE_CORNERS[edge].map(pointFromId);
  const k = 0.16;
  return {
    x1: a.x + (b.x - a.x) * k, y1: a.y + (b.y - a.y) * k,
    x2: b.x + (a.x - b.x) * k, y2: b.y + (a.y - b.y) * k,
  };
}

// targets: legal actions the viewer can tap (each has a corner, edge or hex).
export function renderPieces(svg, state, { targets = [], hot = null } = {}) {
  let layer = svg.querySelector('#pieces');
  if (!layer) {
    layer = el('g', { id: 'pieces' });
    svg.append(layer);
  }
  layer.replaceChildren();

  if (hot) {
    for (const h of state.board.hexes) {
      if (h.number !== hot || h.id === state.bandit) continue;
      const c = hexCentre(h.id);
      layer.append(el('polygon', { points: hexPoints(c.x, c.y, SIZE - 4), class: 'hot' }));
    }
  }

  for (const [edge, p] of Object.entries(state.roads)) {
    const line = roadLine(edge);
    layer.append(el('line', { ...line, class: 'road-outline' }));
    layer.append(el('line', { ...line, class: 'road', stroke: PLAYER_COLOURS[p] }));
  }

  for (const [corner, b] of Object.entries(state.buildings)) {
    const { x, y } = pointFromId(corner);
    layer.append(el('polygon', { points: shape(b.type, x, y), fill: PLAYER_COLOURS[b.player], class: 'building' }));
  }

  const c = hexCentre(state.bandit);
  const bandit = el('g', { class: 'bandit', transform: `translate(${c.x - 25} ${c.y + 8})` });
  bandit.append(
    el('ellipse', { cx: 0, cy: 4, rx: 7, ry: 10 }),
    el('circle', { cx: 0, cy: -9, r: 5.5 }),
  );
  layer.append(bandit);

  targets.forEach((t, i) => {
    const g = el('g', { class: 'target', 'data-target': i });
    if (t.corner) {
      const { x, y } = pointFromId(t.corner);
      g.append(el('circle', { cx: x, cy: y, r: 18, class: 'hit' }));
      g.append(el('circle', { cx: x, cy: y, r: 8, class: 'spot' }));
    } else if (t.edge) {
      const line = roadLine(t.edge);
      g.append(el('line', { ...line, class: 'hit-line' }));
      g.append(el('line', { ...line, class: 'spot-edge-under' }));
      g.append(el('line', { ...line, class: 'spot-edge' }));
    } else if (t.hex) {
      const h = hexCentre(t.hex);
      g.append(el('polygon', { points: hexPoints(h.x, h.y, SIZE - 6), class: 'spot-hex' }));
    }
    layer.append(g);
  });
}
