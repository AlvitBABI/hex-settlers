// Rolling a 7: big hands discard half, the bandit moves, and the mover
// steals one random card from a player next to the bandit's new hex.
import { RESOURCES, DISCARD_LIMIT } from './constants.js';
import { nextInt } from './rng.js';
import { HEX_CORNERS } from './topology.js';
import { handSize, isCardBundle, bundleSize, hasCards, log, nameOf } from './helpers.js';
import { transfer } from './knowledge.js';

// Called when a 7 is rolled.
export function startSeven(s) {
  const counts = {};
  for (const p of s.players) {
    const n = handSize(p.hand);
    if (n > DISCARD_LIMIT) counts[p.id] = Math.floor(n / 2);
  }
  s.pending = Object.keys(counts).length ? { type: 'discard', counts } : { type: 'moveBandit' };
}

// Players with cards next to `hex`, other than `player`.
export function victimsAt(s, hex, player) {
  const ids = new Set();
  for (const c of HEX_CORNERS[hex]) {
    const b = s.buildings[c];
    if (b && b.player !== player && handSize(s.players[b.player].hand) > 0) ids.add(b.player);
  }
  return [...ids].sort();
}

function discard(s, { player, cards }) {
  const need = s.pending?.type === 'discard' ? s.pending.counts[player] : undefined;
  if (!need) return 'You do not need to discard';
  if (!isCardBundle(cards) || bundleSize(cards) !== need) return `Discard exactly ${need} cards`;
  if (!hasCards(s.players[player].hand, cards)) return 'You do not have those cards';
  transfer(s, player, 'bank', cards);
  delete s.pending.counts[player];
  log(s, `${nameOf(s, player)} discarded ${need} cards`);
  if (Object.keys(s.pending.counts).length === 0) s.pending = { type: 'moveBandit' };
}

function moveBandit(s, { player, hex }) {
  if (s.pending?.type !== 'moveBandit') return 'The bandit is not moving now';
  if (player !== s.current) return 'Not your turn';
  if (!(hex in HEX_CORNERS)) return 'No such hex';
  if (hex === s.bandit) return 'The bandit must move to a different hex';
  s.bandit = hex;
  log(s, `${nameOf(s, player)} moved the bandit`);
  const victims = victimsAt(s, hex, player);
  s.pending = victims.length ? { type: 'steal', victims } : null;
}

function steal(s, { player, victim }) {
  if (s.pending?.type !== 'steal') return 'Nothing to steal now';
  if (player !== s.current) return 'Not your turn';
  if (!s.pending.victims.includes(victim)) return 'You cannot steal from that player';
  const hand = s.players[victim].hand;
  const cards = RESOURCES.flatMap((r) => Array(hand[r]).fill(r));
  const pick = nextInt(s.rng, cards.length);
  s.rng = pick.rng;
  // Only the thief and the victim see which card it was.
  transfer(s, victim, player, { [cards[pick.value]]: 1 }, [player, victim]);
  s.pending = null;
  log(s, `${nameOf(s, player)} stole a card from ${nameOf(s, victim)}`);
}

export const handlers = { discard, moveBandit, steal };

export function legal(state, p) {
  const pending = state.pending;
  if (state.phase !== 'play' || !pending) return [];
  if (pending.type === 'discard') {
    // Too many combinations to list: this is a template saying how many.
    return pending.counts[p] ? [{ type: 'discard', player: p, count: pending.counts[p] }] : [];
  }
  if (p !== state.current) return [];
  if (pending.type === 'moveBandit') {
    return Object.keys(HEX_CORNERS).filter((h) => h !== state.bandit)
      .map((hex) => ({ type: 'moveBandit', player: p, hex }));
  }
  return pending.victims.map((victim) => ({ type: 'steal', player: p, victim }));
}
