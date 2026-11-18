// Bonus cards: bought for sheep + wheat + ore, played on a later turn,
// at most one per turn.
//   soldier  - move the bandit and steal (3+ soldiers: Strongest Army, 2 points)
//   point    - 1 hidden victory point (never played)
//   roads    - build 2 roads for free
//   harvest  - take any 2 resources from the bank
//   monopoly - every other player gives you all of one resource
import { COSTS, RESOURCES, STRONGEST_ARMY_MIN } from './constants.js';
import { hasCards, moveCards, mainTurnError, log, nameOf } from './helpers.js';
import { legalRoadEdges } from './turn.js';

export const CARD_NAMES = {
  soldier: 'Soldier', point: 'Victory Point', roads: 'Road Crew', harvest: 'Harvest', monopoly: 'Monopoly',
};

const playable = (state, p, type) =>
  state.players[p].cards.findIndex((c) => c.type === type && c.turn < state.turn.number);

function buyCard(s, { player }) {
  const err = mainTurnError(s, player);
  if (err) return err;
  if (!s.turn.rolled) return 'Roll the dice first';
  if (!s.deck.length) return 'No bonus cards left';
  if (!hasCards(s.players[player].hand, COSTS.card)) return 'Not enough resources';
  moveCards(s.players[player].hand, s.bank, COSTS.card);
  s.players[player].cards.push({ type: s.deck.shift(), turn: s.turn.number });
  log(s, `${nameOf(s, player)} bought a bonus card`);
}

function playCard(s, { player, card, resources, resource }) {
  const err = mainTurnError(s, player);
  if (err) return err;
  if (s.turn.cardPlayed) return 'Only one bonus card per turn';
  if (card === 'point') return 'Victory Point cards count automatically';
  const index = playable(s, player, card);
  if (index < 0) return 'You have no playable card of that kind (new cards wait a turn)';
  const pl = s.players[player];

  if (card === 'soldier') {
    pl.soldiers++;
    s.pending = { type: 'moveBandit' };
    const army = s.largestArmy;
    if (pl.soldiers >= STRONGEST_ARMY_MIN && pl.soldiers > army.count) {
      if (army.player !== player) log(s, `${pl.name} takes the Strongest Army bonus`);
      s.largestArmy = { player, count: pl.soldiers };
    }
  } else if (card === 'roads') {
    if (pl.pieces.roads === 0 || !legalRoadEdges(s, player).length) return 'Nowhere to build roads';
    s.turn.freeRoads = Math.min(2, pl.pieces.roads);
  } else if (card === 'harvest') {
    if (!Array.isArray(resources) || resources.length !== 2 || !resources.every((r) => RESOURCES.includes(r))) {
      return 'Pick 2 resources';
    }
    const want = {};
    for (const r of resources) want[r] = (want[r] ?? 0) + 1;
    if (!hasCards(s.bank, want)) return 'The bank does not have those';
    moveCards(s.bank, pl.hand, want);
  } else if (card === 'monopoly') {
    if (!RESOURCES.includes(resource)) return 'Pick a resource';
    for (const other of s.players) {
      if (other.id !== player && other.hand[resource] > 0) {
        moveCards(other.hand, pl.hand, { [resource]: other.hand[resource] });
      }
    }
  } else {
    return 'Unknown card';
  }
  pl.cards.splice(index, 1);
  s.turn.cardPlayed = true;
  log(s, `${pl.name} played ${CARD_NAMES[card]}`);
}

export const handlers = { buyCard, playCard };

// Free roads end early if there's nowhere left to put them.
export function after(s) {
  if (s.turn.freeRoads > 0 &&
      (s.players[s.current].pieces.roads === 0 || !legalRoadEdges(s, s.current).length)) {
    s.turn.freeRoads = 0;
  }
}

export function legal(state, p) {
  if (mainTurnError(state, p) || state.turn.freeRoads > 0) return [];
  const out = [];
  const pl = state.players[p];
  if (state.turn.rolled && state.deck.length && hasCards(pl.hand, COSTS.card)) out.push({ type: 'buyCard', player: p });
  if (state.turn.cardPlayed) return out;
  if (playable(state, p, 'soldier') >= 0) out.push({ type: 'playCard', player: p, card: 'soldier' });
  if (playable(state, p, 'roads') >= 0 && pl.pieces.roads > 0 && legalRoadEdges(state, p).length) {
    out.push({ type: 'playCard', player: p, card: 'roads' });
  }
  if (playable(state, p, 'harvest') >= 0) {
    RESOURCES.forEach((a, i) => RESOURCES.slice(i).forEach((b) => {
      const want = a === b ? { [a]: 2 } : { [a]: 1, [b]: 1 };
      if (hasCards(state.bank, want)) out.push({ type: 'playCard', player: p, card: 'harvest', resources: [a, b] });
    }));
  }
  if (playable(state, p, 'monopoly') >= 0) {
    for (const r of RESOURCES) out.push({ type: 'playCard', player: p, card: 'monopoly', resource: r });
  }
  return out;
}
