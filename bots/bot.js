// Bot players. A bot only ever picks one of the engine's legal actions
// (or a free-form discard/offer that the engine then checks).
// No randomness, so games with the same seed play out the same way.
import { legalActions, waitingFor } from '../engine/game.js';
import { COSTS, RESOURCES } from '../engine/constants.js';
import { CORNER_HEXES, CORNER_NEIGHBOURS, EDGE_CORNERS, HEX_CORNERS } from '../engine/topology.js';
import { canPlaceSettlement, legalSettlementCorners } from '../engine/turn.js';
import { tradeRatio, dealWith } from '../engine/trade.js';
import { points } from '../engine/scoring.js';
import { handSize, hasCards } from '../engine/helpers.js';

const pips = (n) => (n ? 6 - Math.abs(7 - n) : 0);
const WEIGHT = { wood: 1, clay: 1, sheep: 0.85, wheat: 1.1, ore: 1.1, desert: 0 };
const MAX_OFFERS = 2;     // trade offers a bot makes per turn (the 2nd is more generous)
// How much better than even a deal must be, per seat: bots differ a little.
const PICKINESS = [0.2, 0.45, 0.3, 0.6];
const LEADER_POINTS = 8;  // bots won't trade with someone this close to winning

const hexMap = (s) => new Map(s.board.hexes.map((h) => [h.id, h]));

// How much a player earns of each resource (in dice "pips").
function income(s, p) {
  const hexes = hexMap(s);
  const out = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  for (const [c, b] of Object.entries(s.buildings)) {
    if (b.player !== p) continue;
    for (const id of CORNER_HEXES[c]) {
      const h = hexes.get(id);
      if (h.resource !== 'desert') out[h.resource] += pips(h.number) * (b.type === 'city' ? 2 : 1);
    }
  }
  return out;
}

// How good a corner is for player p to settle on.
function cornerValue(s, corner, p, hexes = hexMap(s), inc = income(s, p)) {
  let v = 0;
  const kinds = new Set();
  for (const id of CORNER_HEXES[corner]) {
    const h = hexes.get(id);
    if (h.resource === 'desert' || id === s.bandit) continue;
    v += pips(h.number) * WEIGHT[h.resource];
    if (inc[h.resource] === 0) v += 1.5; // something we don't get yet
    kinds.add(h.resource);
  }
  v += kinds.size;
  const port = s.board.ports.find((pt) => pt.corners.includes(corner));
  if (port) v += port.type === 'any' ? 1.5 : (inc[port.type] >= 5 ? 3 : 1);
  return v;
}

const missing = (hand, cost) => RESOURCES.reduce((n, r) => n + Math.max(0, (cost[r] ?? 0) - hand[r]), 0);

// What the bot is saving for right now.
export function goal(s, p) {
  const pl = s.players[p];
  const hasSettlement = Object.values(s.buildings).some((b) => b.player === p && b.type === 'settlement');
  const spots = pl.pieces.settlements > 0 ? legalSettlementCorners(s, p) : [];
  const options = [];
  if (hasSettlement && pl.pieces.cities > 0) options.push({ name: 'city', cost: COSTS.city, penalty: 0 });
  if (spots.length) options.push({ name: 'settlement', cost: COSTS.settlement, penalty: 0 });
  else if (pl.pieces.roads > 0 && pl.pieces.settlements > 0) options.push({ name: 'road', cost: COSTS.road, penalty: 0.5 });
  if (s.deck.length) options.push({ name: 'card', cost: COSTS.card, penalty: 1.5 });
  if (!options.length) return { name: 'none', cost: {} };
  options.sort((a, b) => (missing(pl.hand, a.cost) + a.penalty) - (missing(pl.hand, b.cost) + b.penalty));
  return options[0];
}

// Best road: one that heads for a good empty corner.
function bestRoad(s, p, edges) {
  const hexes = hexMap(s);
  const inc = income(s, p);
  let best = null, bestScore = -Infinity;
  for (const e of edges) {
    let score = 0;
    for (const c of EDGE_CORNERS[e]) {
      if (s.buildings[c]) continue;
      if (!canPlaceSettlement(s, p, c, { setup: true })) score = Math.max(score, cornerValue(s, c, p, hexes, inc) + 3);
      for (const n of CORNER_NEIGHBOURS[c]) {
        if (!canPlaceSettlement(s, p, n, { setup: true })) score = Math.max(score, cornerValue(s, n, p, hexes, inc));
      }
    }
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return best;
}

function bestCorner(s, p, corners) {
  const hexes = hexMap(s);
  const inc = income(s, p);
  let best = corners[0], bestScore = -Infinity;
  for (const c of corners) {
    const v = cornerValue(s, c, p, hexes, inc);
    if (v > bestScore) { bestScore = v; best = c; }
  }
  return best;
}

// Which cards to throw away on a 7: the ones furthest beyond our goal.
export function chooseDiscard(s, p, count) {
  const hand = { ...s.players[p].hand };
  const cost = goal(s, p).cost;
  const out = {};
  for (let i = 0; i < count; i++) {
    const r = RESOURCES.filter((x) => hand[x] > 0)
      .sort((a, b) => (hand[b] - (cost[b] ?? 0)) - (hand[a] - (cost[a] ?? 0)))[0];
    hand[r]--;
    out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}

// Bandit: hurt the strongest opponent's best hex, never ourselves.
function bestBanditHex(s, p) {
  const hexes = hexMap(s);
  let best = null, bestScore = -Infinity;
  for (const id of Object.keys(HEX_CORNERS)) {
    if (id === s.bandit) continue;
    let score = 0;
    for (const c of HEX_CORNERS[id]) {
      const b = s.buildings[c];
      if (!b) continue;
      if (b.player === p) { score -= 100; continue; }
      const strength = 1 + points(s, b.player, { includeHidden: false }) / 5;
      score += pips(hexes.get(id).number) * (b.type === 'city' ? 2 : 1) * strength;
      if (handSize(s.players[b.player].hand) > 0) score += 0.5;
    }
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return best;
}

function bestVictim(s, victims) {
  return victims.slice().sort((a, b) =>
    (points(s, b, { includeHidden: false }) - points(s, a, { includeHidden: false })) ||
    (handSize(s.players[b].hand) - handSize(s.players[a].hand)))[0];
}

// How much each resource is worth to this bot right now: more if it's
// needed for the goal or rarely collected, less if we have plenty.
function values(s, p) {
  const hand = s.players[p].hand;
  const cost = goal(s, p).cost;
  const inc = income(s, p);
  const v = {};
  for (const r of RESOURCES) {
    let x = 1;
    if ((cost[r] ?? 0) > hand[r]) x += 1;
    if (inc[r] === 0) x += 0.4; else if (inc[r] < 4) x += 0.2;
    if (hand[r] - (cost[r] ?? 0) >= 2) x -= 0.4;
    v[r] = x;
  }
  return v;
}

// Score for bot p receiving `get` and paying `give` (> 0 means good).
// Counts card values plus progress towards the goal, so a 2-for-1 or
// 3-for-1 in the bot's favour is tempting even if it doesn't need the cards.
export function dealScore(s, p, get, give) {
  const hand = s.players[p].hand;
  if (!hasCards(hand, give)) return -Infinity;
  const cost = goal(s, p).cost;
  const after = { ...hand };
  for (const [r, n] of Object.entries(give)) after[r] -= n;
  for (const [r, n] of Object.entries(get)) after[r] += n;
  const v = values(s, p);
  const worth = (b) => Object.entries(b).reduce((t, [r, n]) => t + v[r] * n, 0);
  return (missing(hand, cost) - missing(after, cost)) * 2 + worth(get) - worth(give);
}

const pickiness = (p) => PICKINESS[p % PICKINESS.length];
const nearWin = (s, p) => points(s, p, { includeHidden: false }) >= LEADER_POINTS;

// Would this bot accept the open trade? (colonist-style: only good deals,
// and never with a player who is about to win.)
export function wantsTrade(s, p) {
  const t = s.trade;
  if (!t || nearWin(s, t.from)) return false;
  return dealScore(s, p, t.give, t.get) > pickiness(p);
}

const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

// Instead of a flat "no": propose terms this bot would take.
export function counterOffer(s, p) {
  const t = s.trade;
  if (!t || nearWin(s, t.from)) return null;
  const hand = s.players[p].hand;
  const theirs = s.players[t.from].hand;
  const cost = goal(s, p).cost;
  const want = needed(hand, cost).find((r) => theirs[r] > 0);
  if (!want) return null;
  const options = [];
  if (hasCards(hand, t.get)) options.push({ give: t.get, get: { [want]: 1 } }); // what you asked for, but I want this
  for (const r of surplus(hand, cost)) options.push({ give: { [r]: 1 }, get: { [want]: 1 } });
  for (const o of options) {
    if (RESOURCES.some((r) => o.give[r] > 0 && o.get[r] > 0)) continue;
    if (same(o.give, t.get) && same(o.get, t.give)) continue; // that's just "accept"
    if (dealScore(s, p, o.get, o.give) > pickiness(p)) return o;
  }
  return null;
}

// Spare cards: what we hold beyond the goal's cost, most spare first.
function surplus(hand, cost) {
  return RESOURCES.filter((r) => hand[r] - (cost[r] ?? 0) > 0)
    .sort((a, b) => (hand[b] - (cost[b] ?? 0)) - (hand[a] - (cost[a] ?? 0)));
}
const needed = (hand, cost) => RESOURCES.filter((r) => (cost[r] ?? 0) > hand[r]);

// The main brain: one action for player p, or null if p has nothing to do.
export function chooseAction(s, p) {
  if (!waitingFor(s).includes(p)) return null;
  const legal = legalActions(s, p);
  const find = (type) => legal.filter((a) => a.type === type);

  if (s.phase === 'setup') {
    if (s.setup.step === 'settlement') {
      return { type: 'placeSettlement', player: p, corner: bestCorner(s, p, legal.map((a) => a.corner)) };
    }
    return { type: 'placeRoad', player: p, edge: bestRoad(s, p, legal.map((a) => a.edge)) };
  }

  const pending = s.pending;
  if (pending?.type === 'discard') {
    return { type: 'discard', player: p, cards: chooseDiscard(s, p, pending.counts[p]) };
  }
  if (pending?.type === 'moveBandit') return { type: 'moveBandit', player: p, hex: bestBanditHex(s, p) };
  if (pending?.type === 'steal') return { type: 'steal', player: p, victim: bestVictim(s, pending.victims) };

  const t = s.trade;
  if (t) {
    if (t.from !== p) {
      if (t.responses[p] !== null) return null;
      if (wantsTrade(s, p)) return { type: 'respondTrade', player: p, accept: true };
      const counter = counterOffer(s, p);
      return { type: 'respondTrade', player: p, accept: false, ...(counter ? { counter } : {}) };
    }
    const answers = Object.entries(t.responses);
    if (answers.some(([, r]) => r === null)) return null; // still waiting for answers
    const weakestFirst = (a, b) => points(s, a, { includeHidden: false }) - points(s, b, { includeHidden: false });
    const yes = answers.filter(([, r]) => r === 'accept').map(([id]) => Number(id)).sort(weakestFirst);
    if (yes.length) return { type: 'confirmTrade', player: p, with: yes[0] };
    // Take the best counter-offer, if it's good enough.
    let best = null, bestScore = pickiness(p);
    for (const [id, r] of answers) {
      if (r !== 'counter') continue;
      const deal = dealWith(t, Number(id));
      const score = dealScore(s, p, deal.get, deal.give);
      if (score > bestScore) { bestScore = score; best = Number(id); }
    }
    return best !== null ? { type: 'confirmTrade', player: p, with: best } : { type: 'cancelTrade', player: p };
  }

  const pl = s.players[p];
  if (s.turn.freeRoads > 0) return { type: 'buildRoad', player: p, edge: bestRoad(s, p, find('buildRoad').map((a) => a.edge)) };

  const banditOnMe = HEX_CORNERS[s.bandit]?.some((c) => s.buildings[c]?.player === p);
  const soldier = legal.find((a) => a.type === 'playCard' && a.card === 'soldier');
  if (!s.turn.rolled) return soldier && banditOnMe ? soldier : { type: 'roll', player: p };

  // 1. Build the best thing we can afford.
  const cities = find('buildCity');
  if (cities.length) {
    return cities.sort((a, b) => cornerValue(s, b.corner, p) - cornerValue(s, a.corner, p))[0];
  }
  const settlements = find('buildSettlement');
  if (settlements.length) {
    return { type: 'buildSettlement', player: p, corner: bestCorner(s, p, settlements.map((a) => a.corner)) };
  }
  const g = goal(s, p);
  const roads = find('buildRoad');
  if (roads.length && g.name === 'road') {
    const edge = bestRoad(s, p, roads.map((a) => a.edge));
    if (edge) return { type: 'buildRoad', player: p, edge };
  }

  // 2. Bonus cards that help.
  const card = (name) => legal.filter((a) => a.type === 'playCard' && a.card === name);
  if (soldier && banditOnMe) return soldier;
  if (card('roads').length && g.name === 'road') return card('roads')[0];
  const want = needed(pl.hand, g.cost);
  if (card('harvest').length && want.length) {
    const short = RESOURCES.flatMap((r) => Array(Math.max(0, (g.cost[r] ?? 0) - pl.hand[r])).fill(r));
    const pick = [short[0], short[1] ?? short[0]];
    const action = card('harvest').find((a) => a.resources.slice().sort().join() === pick.slice().sort().join());
    if (action) return action;
  }
  if (card('monopoly').length) {
    const others = (r) => s.players.reduce((n, o) => n + (o.id === p ? 0 : o.hand[r]), 0);
    const r = RESOURCES.slice().sort((a, b) => others(b) - others(a))[0];
    if (others(r) >= 3) return card('monopoly').find((a) => a.resource === r);
  }

  // 3. Buy a bonus card if that's the plan.
  if (g.name === 'card' && find('buyCard').length) return find('buyCard')[0];

  // 4. Trade towards the goal: bank/port first, then ask the players.
  if (want.length) {
    for (const give of surplus(pl.hand, g.cost)) {
      const ratio = tradeRatio(s, p, give);
      if (pl.hand[give] - (g.cost[give] ?? 0) < ratio) continue;
      const get = want.find((r) => s.bank[r] > 0);
      if (get) return { type: 'bankTrade', player: p, give, get };
    }
    // Ask the players, but only for a card somebody actually holds.
    const spare = surplus(pl.hand, g.cost);
    const short = missing(pl.hand, g.cost);
    const get = want.find((r) => s.players.some((o) => o.id !== p && o.hand[r] > 0));
    if (s.turn.offers < MAX_OFFERS && spare.length && get && short <= 2) {
      let give = null;
      if (s.turn.offers === 0) give = { [spare[0]]: 1 };
      else {
        // Second try: sweeten it to 2-for-1 if we have plenty, or offer something else.
        const rich = spare.find((r) => pl.hand[r] - (g.cost[r] ?? 0) >= 2);
        if (rich) give = { [rich]: 2 };
        else if (spare.length > 1) give = { [spare[1]]: 1 };
      }
      if (give) return { type: 'offerTrade', player: p, give, get: { [get]: 1 } };
    }
  }

  // 5. Too many cards (a 7 would hurt): spend on a card or a road.
  if (handSize(pl.hand) > 7) {
    if (find('buyCard').length) return find('buyCard')[0];
    if (roads.length) {
      const edge = bestRoad(s, p, roads.map((a) => a.edge));
      if (edge) return { type: 'buildRoad', player: p, edge };
    }
  }
  return { type: 'endTurn', player: p };
}

// When a human's timer runs out: do the least surprising thing
// (colonist-style): finish placements sensibly, roll, discard, move the
// bandit, decline/cancel trades, then end the turn.
export function timeoutAction(s, p) {
  if (!waitingFor(s).includes(p)) return null;
  if (s.phase === 'setup' || s.pending) return chooseAction(s, p);
  if (s.trade) {
    return s.trade.from === p
      ? { type: 'cancelTrade', player: p }
      : (s.trade.responses[p] === null ? { type: 'respondTrade', player: p, accept: false } : null);
  }
  if (s.turn.freeRoads > 0) return chooseAction(s, p);
  if (!s.turn.rolled) return { type: 'roll', player: p };
  return { type: 'endTurn', player: p };
}
