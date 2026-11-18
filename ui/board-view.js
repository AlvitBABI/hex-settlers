// Draws a board (from engine/board.js) as SVG. No game rules in here.
import { SIZE, el, centre, hexCentre, pointFromId, hexPoints } from './geometry.js';
import { NAMES, RESOURCE_COLOUR, defsMarkup } from './art.js';

// How many of the 36 dice combinations roll this number.
const pips = (n) => 6 - Math.abs(7 - n);

// Fills `svg` with the board. Returns the board's bounding box in SVG units.
export function renderBoard(svg, board) {
  svg.replaceChildren();
  const defs = el('defs');
  defs.innerHTML = defsMarkup();

  // Sea: a huge rectangle so it still fills the screen when you drag.
  const sea = el('g', { class: 'sea' });
  sea.append(
    el('rect', { x: -3000, y: -3000, width: 6000, height: 6000, fill: 'url(#g-sea)' }),
    el('rect', { x: -3000, y: -3000, width: 6000, height: 6000, fill: 'url(#p-waves)' }),
  );

  const beach = el('g', { class: 'beach' });
  const tiles = el('g', { class: 'tiles' });
  const ports = el('g', { class: 'ports' });
  const measured = el('g'); // everything that should fit on screen
  measured.append(ports, beach, tiles);
  svg.append(defs, sea, measured);

  for (const h of board.hexes) {
    const { x, y } = centre(h.q, h.r);
    beach.append(el('polygon', { points: hexPoints(x, y, SIZE + 7), class: 'sand' }));

    const g = el('g', { class: `tile tile-${h.resource}`, 'data-hex': h.id });
    g.append(el('polygon', { points: hexPoints(x, y, SIZE - 1.5), fill: `url(#g-${h.resource})`, class: 'hex' }));
    g.append(el('use', { href: `#i-${h.resource}`, x: x - 17, y: y - 38, width: 34, height: 26 }));
    if (h.number !== null) {
      const red = h.number === 6 || h.number === 8;
      g.append(el('circle', { cx: x, cy: y + 13, r: SIZE * 0.33, class: 'token', filter: 'url(#f-shadow)' }));
      g.append(el('text', { x, y: y + 11, class: `token-number${red ? ' red' : ''}` }, String(h.number)));
      const n = pips(h.number);
      for (let i = 0; i < n; i++) {
        g.append(el('circle', {
          cx: x + (i - (n - 1) / 2) * 3.6, cy: y + 23, r: 1.3, class: `pip${red ? ' red' : ''}`,
        }));
      }
    } else {
      g.append(el('text', { x, y: y + 14, class: 'tile-label' }, NAMES[h.resource]));
    }
    tiles.append(g);
  }

  for (const p of board.ports) {
    const mid = pointFromId(p.edge);
    const land = hexCentre(p.hex);
    // Push the port out to sea, away from its land hex.
    const dx = mid.x - land.x, dy = mid.y - land.y;
    const len = Math.hypot(dx, dy);
    const px = mid.x + (dx / len) * SIZE * 0.7;
    const py = mid.y + (dy / len) * SIZE * 0.7;
    const g = el('g', { class: 'port' });
    for (const c of p.corners) {
      const cp = pointFromId(c);
      g.append(el('line', { x1: px, y1: py, x2: cp.x, y2: cp.y, class: 'dock' }));
    }
    g.append(el('circle', { cx: px, cy: py, r: 17, fill: RESOURCE_COLOUR[p.type], class: 'port-badge', filter: 'url(#f-shadow)' }));
    g.append(el('use', { href: `#i-${p.type}`, x: px - 10, y: py - 15, width: 20, height: 15 }));
    g.append(el('text', { x: px, y: py + 8, class: 'port-ratio' }, `${p.ratio}:1`));
    ports.append(g);
  }

  // Measure what we drew (land + ports) plus a small margin.
  const box = measured.getBBox();
  const m = 8;
  return { x: box.x - m, y: box.y - m, width: box.width + 2 * m, height: box.height + 2 * m };
}
