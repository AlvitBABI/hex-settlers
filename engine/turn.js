// Starting placement, dice, collecting resources, building, ending a turn.
import { COSTS, RESOURCES } from './constants.js';
import { nextInt } from './rng.js';
import { CORNER_EDGES, CORNER_NEIGHBOURS, EDGE_CORNERS, CORNER_HEXES, HEX_CORNERS } from './topology.js';
import { startSeven } from './bandit.js';
import { emptyHand, hasCards, moveCards, newTurn, log, nameOf, mainTurnError } from './helpers.js';

// ---- Placement checks (also used by bots and the UI) ----

// Returns why a settlement can't go on `corner`, or null if it can.
export function canPlaceSettlement(state, p, corner, { setup = false } = {}) {
  if (!(corner in CORNER_EDGES)) return 'No such corner';
  if (state.buildings[corner]) return 'That corner is taken';
  if (CORNER_NEIGHBOURS[corner].some((c) => state.buildings[c])) return 'Too close to another building';
  if (!setup && !CORNER_EDGES[corner].some((e) => state.roads[e] === p)) return 'Must touch one of your roads';
  return null;
}

// Returns why a road can't go on `edge`, or null if it can.
export function canPlaceRoad(state, p, edge) {
  if (!(edge in EDGE_CORNERS)) return 'No such edge';
  if (edge in state.roads) return 'That edge is taken';
  if (state.phase === 'setup') {
    return EDGE_CORNERS[edge].includes(state.setup.lastCorner)
      ? null : 'The road must touch the settlement you just placed';
  }
  const connected = EDGE_CORNERS[edge].some((c) => {
    const b = state.buildings[c];
    if (b) return b.player === p; // can't build through someone else's building
    return CORNER_EDGES[c].some((e) => e !== edge && state.roads[e] === p);
  });
  return connected ? null : 'Must connect to your road or building';
}

export const legalSettlementCorners = (state, p, setup = false) =>
  Object.keys(CORNER_EDGES).filter((c) => !canPlaceSettlement(state, p, c, { setup }));

export const legalRoadEdges = (state, p) =>
  Object.keys(EDGE_CORNERS).filter((e) => !canPlaceRoad(state, p, e));

const hexById = (state, id) => state.board.hexes.find((h) => h.id === id);

// ---- Resources from a dice roll ----

// Every settlement next to a hex with this number gets 1, a city 2.
// If the bank runs short of a resource and more than one player wants it,
// nobody gets it; a single player gets whatever is left.
export function produce(state, total) {
  const gains = state.players.map(() => emptyHand());
  for (const h of state.board.hexes) {
    if (h.number !== total || h.id === state.bandit) continue;
    for (const c of HEX_CORNERS[h.id]) {
      const b = state.buildings[c];
      if (b) gains[b.player][h.resource] += b.type === 'city' ? 2 : 1;
    }
  }
  for (const r of RESOURCES) {
    const takers = gains.filter((g) => g[r] > 0);
    const wanted = takers.reduce((s, g) => s + g[r], 0);
    if (wanted > state.bank[r] && takers.length > 1) {
      if (wanted) log(state, `The bank is short of ${r}: nobody gets any`);
      continue;
    }
    gains.forEach((g, p) => {
      const n = Math.min(g[r], state.bank[r]);
      if (n > 0) moveCards(state.bank, state.players[p].hand, { [r]: n });
    });
  }
}

// ---- Actions ----

function placeSettlement(s, { player, corner }) {
  if (s.phase !== 'setup' || s.setup.step !== 'settlement') return 'Not the time to place a settlement';
  if (player !== s.current) return 'Not your turn';
  const err = canPlaceSettlement(s, player, corner, { setup: true });
  if (err) return err;
  s.buildings[corner] = { player, type: 'settlement' };
  s.players[player].pieces.settlements--;
  s.setup.lastCorner = corner;
  s.setup.step = 'road';
  // Second round: collect one of each resource next to this settlement.
  if (s.setup.index >= s.players.length) {
    for (const id of CORNER_HEXES[corner]) {
      const r = hexById(s, id).resource;
      if (r !== 'desert' && s.bank[r] > 0) moveCards(s.bank, s.players[player].hand, { [r]: 1 });
    }
  }
  log(s, `${nameOf(s, player)} placed a settlement`);
}

function placeRoad(s, { player, edge }) {
  if (s.phase !== 'setup' || s.setup.step !== 'road') return 'Not the time to place a road';
  if (player !== s.current) return 'Not your turn';
  const err = canPlaceRoad(s, player, edge);
  if (err) return err;
  s.roads[edge] = player;
  s.players[player].pieces.roads--;
  s.setup.index++;
  s.setup.lastCorner = null;
  if (s.setup.index === s.setup.order.length) {
    s.phase = 'play';
    s.current = s.setup.order[0];
    s.turn = newTurn(1);
    log(s, `Setup done. ${nameOf(s, s.current)} starts`);
  } else {
    s.current = s.setup.order[s.setup.index];
    s.setup.step = 'settlement';
  }
}

function roll(s, { player }) {
  const err = mainTurnError(s, player);
  if (err) return err;
  if (s.turn.rolled) return 'You already rolled';
  const a = nextInt(s.rng, 6);
  const b = nextInt(a.rng, 6);
  s.rng = b.rng;
  const dice = [a.value + 1, b.value + 1];
  const total = dice[0] + dice[1];
  s.turn.rolled = true;
  s.turn.dice = dice;
  log(s, `${nameOf(s, player)} rolled ${total}`);
  if (total === 7) startSeven(s); // a 7 produces nothing: the bandit moves
  else produce(s, total);
}

// Shared checks for paid building: your turn, rolled, can afford, have pieces.
function buildError(s, player, cost, piece) {
  const err = mainTurnError(s, player);
  if (err) return err;
  if (!s.turn.rolled) return 'Roll the dice first';
  if (s.players[player].pieces[piece] <= 0) return `No ${piece} left`;
  if (cost && !hasCards(s.players[player].hand, cost)) return 'Not enough resources';
  return null;
}

function buildRoad(s, { player, edge }) {
  const free = s.turn.freeRoads > 0 && player === s.current;
  const err = free
    ? mainTurnError(s, player) || (s.players[player].pieces.roads <= 0 ? 'No roads left' : null)
    : buildError(s, player, COSTS.road, 'roads');
  if (err) return err;
  const placeErr = canPlaceRoad(s, player, edge);
  if (placeErr) return placeErr;
  if (free) s.turn.freeRoads--;
  else moveCards(s.players[player].hand, s.bank, COSTS.road);
  s.roads[edge] = player;
  s.players[player].pieces.roads--;
  log(s, `${nameOf(s, player)} built a road`);
}

function buildSettlement(s, { player, corner }) {
  const err = buildError(s, player, COSTS.settlement, 'settlements') || canPlaceSettlement(s, player, corner);
  if (err) return err;
  moveCards(s.players[player].hand, s.bank, COSTS.settlement);
  s.buildings[corner] = { player, type: 'settlement' };
  s.players[player].pieces.settlements--;
  log(s, `${nameOf(s, player)} built a settlement`);
}

function buildCity(s, { player, corner }) {
  const err = buildError(s, player, COSTS.city, 'cities');
  if (err) return err;
  const b = s.buildings[corner];
  if (!b || b.player !== player || b.type !== 'settlement') return 'A city must replace one of your settlements';
  moveCards(s.players[player].hand, s.bank, COSTS.city);
  b.type = 'city';
  s.players[player].pieces.cities--;
  s.players[player].pieces.settlements++; // the settlement piece comes back
  log(s, `${nameOf(s, player)} built a city`);
}

function endTurn(s, { player }) {
  const err = mainTurnError(s, player);
  if (err) return err;
  if (!s.turn.rolled) return 'Roll the dice first';
  s.current = (s.current + 1) % s.players.length;
  s.turn = newTurn(s.turn.number + 1);
}

export const handlers = { placeSettlement, placeRoad, roll, buildRoad, buildSettlement, buildCity, endTurn };

// Every legal action of these kinds for player p.
export function legal(state, p) {
  if (state.phase === 'setup') {
    if (p !== state.current) return [];
    return state.setup.step === 'settlement'
      ? legalSettlementCorners(state, p, true).map((corner) => ({ type: 'placeSettlement', player: p, corner }))
      : legalRoadEdges(state, p).map((edge) => ({ type: 'placeRoad', player: p, edge }));
  }
  if (mainTurnError(state, p)) return [];
  const pl = state.players[p];
  const roads = () => legalRoadEdges(state, p).map((edge) => ({ type: 'buildRoad', player: p, edge }));
  if (state.turn.freeRoads > 0) return roads();
  if (!state.turn.rolled) return [{ type: 'roll', player: p }];
  const out = [];
  if (pl.pieces.roads > 0 && hasCards(pl.hand, COSTS.road)) out.push(...roads());
  if (pl.pieces.settlements > 0 && hasCards(pl.hand, COSTS.settlement)) {
    out.push(...legalSettlementCorners(state, p).map((corner) => ({ type: 'buildSettlement', player: p, corner })));
  }
  if (pl.pieces.cities > 0 && hasCards(pl.hand, COSTS.city)) {
    for (const [corner, b] of Object.entries(state.buildings)) {
      if (b.player === p && b.type === 'settlement') out.push({ type: 'buildCity', player: p, corner });
    }
  }
  out.push({ type: 'endTurn', player: p });
  return out;
}
