// Points, the Longest Route bonus and the winner check.
import { CORNER_EDGES, EDGE_CORNERS } from './topology.js';
import { WIN_POINTS, LONGEST_ROUTE_MIN } from './constants.js';
import { log, nameOf } from './helpers.js';

// Victory points. includeHidden=false leaves out secret point cards
// (what the other players can see).
export function points(state, p, { includeHidden = true } = {}) {
  let n = 0;
  for (const b of Object.values(state.buildings)) {
    if (b.player === p) n += b.type === 'city' ? 2 : 1;
  }
  if (state.longestRoad.player === p) n += 2;
  if (state.largestArmy.player === p) n += 2;
  if (includeHidden) n += state.players[p].cards.filter((c) => c.type === 'point').length;
  return n;
}

// Longest chain of a player's roads. An opponent's building cuts the chain.
export function longestRoadFor(state, p) {
  let best = 0;
  const blocked = (corner) => {
    const b = state.buildings[corner];
    return b && b.player !== p;
  };
  const walk = (corner, used, length) => {
    if (length > best) best = length;
    if (length > 0 && blocked(corner)) return;
    for (const e of CORNER_EDGES[corner]) {
      if (state.roads[e] !== p || used.has(e)) continue;
      used.add(e);
      const next = EDGE_CORNERS[e].find((c) => c !== corner);
      walk(next, used, length + 1);
      used.delete(e);
    }
  };
  for (const [e, owner] of Object.entries(state.roads)) {
    if (owner === p) for (const c of EDGE_CORNERS[e]) walk(c, new Set(), 0);
  }
  return best;
}

function updateLongestRoad(state) {
  const lengths = state.players.map((pl) => longestRoadFor(state, pl.id));
  const max = Math.max(...lengths);
  const holder = state.longestRoad.player;
  // The holder keeps it while still (joint) longest; otherwise it goes to a
  // single clear leader, or to nobody if there's a tie.
  if (holder !== null && lengths[holder] === max && max >= LONGEST_ROUTE_MIN) {
    state.longestRoad.length = max;
    return;
  }
  const top = lengths.flatMap((len, i) => (len === max ? [i] : []));
  const next = max >= LONGEST_ROUTE_MIN && top.length === 1 ? top[0] : null;
  if (next !== holder && next !== null) log(state, `${nameOf(state, next)} takes the Longest Route bonus`);
  state.longestRoad = { player: next, length: next === null ? 0 : max };
}

// Runs after every successful action.
export function after(state, action) {
  if (state.phase !== 'play') return;
  updateLongestRoad(state);
  // Classic: you can only win on your own turn. Rush: whoever gets there
  // first (the player who just acted is checked first).
  const order = state.mode === 'rush'
    ? [action?.player, ...state.players.map((p) => p.id)].filter((p) => Number.isInteger(p))
    : [state.current];
  const winner = order.find((p) => points(state, p) >= WIN_POINTS);
  if (winner !== undefined) {
    state.phase = 'over';
    state.winner = winner;
    log(state, `${nameOf(state, winner)} wins!`);
  }
}
