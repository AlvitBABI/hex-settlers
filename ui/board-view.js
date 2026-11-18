// Draws a board (from engine/board.js) as SVG. No game rules in here.
import { parseHexId } from '../engine/hex.js';

const SIZE = 50; // hex radius in SVG units
const SVG_NS = 'http://www.w3.org/2000/svg';

// Our own simple colour scheme.
const COLOURS = {
  wood: '#2e7d4f', clay: '#c4642d', wool: '#a5d46a',
  wheat: '#e8c14a', stone: '#8e9aa8', desert: '#dcc99a', any: '#ffffff',
};
const LABELS = {
  wood: 'Wood', clay: 'Clay', wool: 'Wool', wheat: 'Wheat', stone: 'Stone', desert: 'Desert',
};

// Centre of hex (q, r) in SVG units (pointy-top layout).
function centre(q, r) {
  return { x: SIZE * Math.sqrt(3) * (q + r / 2), y: SIZE * 1.5 * r };
}

// A corner or edge id is a list of hex ids; its position is the average
// of those hex centres (works for off-board hexes too).
function pointFromId(id) {
  const pts = id.split('|').map((h) => { const { q, r } = parseHexId(h); return centre(q, r); });
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

function el(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

// Pointy-top hexagon corners.
function hexPoints(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + size * Math.cos(a)).toFixed(2)},${(cy + size * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

// How many of the 36 dice combinations roll this number.
const pips = (n) => 6 - Math.abs(7 - n);

// Fills `svg` with the board. Returns the board's bounding box in SVG units.
export function renderBoard(svg, board) {
  svg.replaceChildren();
  const tiles = el('g', { class: 'tiles' });
  const ports = el('g', { class: 'ports' });
  svg.append(ports, tiles);

  // Sea: one big hexagon behind the land.
  for (const h of board.hexes) {
    const { x, y } = centre(h.q, h.r);
    const g = el('g', { class: `tile tile-${h.resource}` });
    g.append(el('polygon', {
      points: hexPoints(x, y, SIZE - 1.5), fill: COLOURS[h.resource], class: 'hex',
    }));
    g.append(el('text', { x, y: y - SIZE * 0.52, class: 'tile-label' }, LABELS[h.resource]));
    if (h.number !== null) {
      const red = h.number === 6 || h.number === 8;
      g.append(el('circle', { cx: x, cy: y + 2, r: SIZE * 0.36, class: 'token' }));
      g.append(el('text', {
        x, y: y + 2, class: `token-number${red ? ' red' : ''}`,
      }, String(h.number)));
      const n = pips(h.number);
      for (let i = 0; i < n; i++) {
        g.append(el('circle', {
          cx: x + (i - (n - 1) / 2) * 4.2, cy: y + 13, r: 1.5,
          class: `pip${red ? ' red' : ''}`,
        }));
      }
    }
    tiles.append(g);
  }

  for (const p of board.ports) {
    const mid = pointFromId(p.edge);
    const land = centre(parseHexId(p.hex).q, parseHexId(p.hex).r);
    // Push the port marker out to sea, away from its land hex.
    const dx = mid.x - land.x, dy = mid.y - land.y;
    const len = Math.hypot(dx, dy);
    const px = mid.x + (dx / len) * SIZE * 0.62;
    const py = mid.y + (dy / len) * SIZE * 0.62;
    const g = el('g', { class: 'port' });
    for (const c of p.corners) {
      const cp = pointFromId(c);
      g.append(el('line', { x1: px, y1: py, x2: cp.x, y2: cp.y, class: 'dock' }));
    }
    g.append(el('circle', { cx: px, cy: py, r: SIZE * 0.34, fill: COLOURS[p.type], class: 'port-badge' }));
    g.append(el('text', { x: px, y: py - 3, class: 'port-ratio' }, `${p.ratio}:1`));
    g.append(el('text', { x: px, y: py + 8, class: 'port-type' },
      p.type === 'any' ? 'any' : LABELS[p.type]));
    ports.append(g);
  }

  // Measure what we drew (land + ports) plus a small margin.
  const box = svg.getBBox();
  const m = 8;
  return { x: box.x - m, y: box.y - m, width: box.width + 2 * m, height: box.height + 2 * m };
}
