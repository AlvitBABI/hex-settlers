// Who-touches-whom lookups. Every board has the same shape (only the
// tiles differ), so we work these out once from the empty layout.
import { buildLayout } from './board.js';
import { BOARD_RADIUS } from './constants.js';

const layout = buildLayout(BOARD_RADIUS);

export const EDGE_CORNERS = {};      // edge -> [corner, corner]
export const CORNER_EDGES = {};      // corner -> edges touching it
export const CORNER_NEIGHBOURS = {}; // corner -> corners one road away
export const CORNER_HEXES = {};      // corner -> land hexes touching it
export const HEX_CORNERS = {};       // hex -> its 6 corners

for (const c of Object.values(layout.corners)) {
  CORNER_EDGES[c.id] = [];
  CORNER_NEIGHBOURS[c.id] = [];
  CORNER_HEXES[c.id] = c.hexes.slice();
}
for (const e of Object.values(layout.edges)) {
  EDGE_CORNERS[e.id] = e.corners.slice();
  const [a, b] = e.corners;
  CORNER_EDGES[a].push(e.id);
  CORNER_EDGES[b].push(e.id);
  CORNER_NEIGHBOURS[a].push(b);
  CORNER_NEIGHBOURS[b].push(a);
}
for (const h of layout.hexes) HEX_CORNERS[h.id] = h.corners.slice();
