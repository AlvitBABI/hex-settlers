// Trading with the bank (4:1, or 3:1 / 2:1 with a port) and with players.
// Player trades: the current player offers, others accept or decline,
// then the offerer picks one who accepted (or cancels).
import { RESOURCES } from './constants.js';
import { isCardBundle, bundleSize, hasCards, mainTurnError, log, nameOf, needsRoll, freeRoadsOf } from './helpers.js';
import { transfer } from './knowledge.js';

const MAX_OFFERS_PER_TURN = 20;

// How many of `resource` this player must give the bank for 1 card.
export function tradeRatio(state, p, resource) {
  let ratio = 4;
  for (const port of state.board.ports) {
    if (!port.corners.some((c) => state.buildings[c]?.player === p)) continue;
    if (port.type === 'any') ratio = Math.min(ratio, 3);
    else if (port.type === resource) ratio = 2;
  }
  return ratio;
}

const clean = (cards) => Object.fromEntries(Object.entries(cards).filter(([, n]) => n > 0));

// Bank trade. Either the simple form { give: 'wood', get: 'ore' } (one
// card at your best ratio) or bundles, colonist-style:
// { give: { wood: 4, clay: 2 }, get: { ore: 1, wheat: 1 } } with a 2:1 clay port.
// Each resource given must be a whole multiple of its ratio, and you get
// one card for each "lot".
export function bankTradeError(s, player, give, get) {
  if (!isCardBundle(give) || !isCardBundle(get)) return 'Bad trade';
  const giveR = RESOURCES.filter((r) => give[r] > 0);
  const getR = RESOURCES.filter((r) => get[r] > 0);
  if (!giveR.length || !getR.length) return 'Pick what to give and what to get';
  if (giveR.some((r) => get[r] > 0)) return 'A resource cannot be on both sides';
  let lots = 0;
  for (const r of giveR) {
    const ratio = tradeRatio(s, player, r);
    if (give[r] % ratio) return `${r} goes to the bank in lots of ${ratio}`;
    lots += give[r] / ratio;
  }
  if (bundleSize(get) !== lots) return `That pays for ${lots} card${lots === 1 ? '' : 's'}`;
  if (!hasCards(s.players[player].hand, give)) return 'You do not have those cards';
  if (!hasCards(s.bank, get)) return 'The bank has run out of that';
  return null;
}

function bankTrade(s, { player, give, get }) {
  const err = mainTurnError(s, player);
  if (err) return err;
  if (needsRoll(s)) return 'Roll the dice first';
  if (typeof give === 'string') {
    if (!RESOURCES.includes(give) || !RESOURCES.includes(get) || give === get) return 'Pick two different resources';
    give = { [give]: tradeRatio(s, player, give) };
    get = { [get]: 1 };
  }
  const tradeErr = bankTradeError(s, player, give, get);
  if (tradeErr) return tradeErr;
  transfer(s, player, 'bank', clean(give));
  transfer(s, 'bank', player, clean(get));
  log(s, `${nameOf(s, player)} traded ${bundleSize(give)} cards for ${bundleSize(get)} with the bank`);
}

function offerTrade(s, { player, give, get }) {
  const err = mainTurnError(s, player);
  if (err) return err;
  if (needsRoll(s)) return 'Roll the dice first';
  if (s.trade) return 'Another trade is open';
  if (!isCardBundle(give) || !isCardBundle(get)) return 'Bad trade';
  if (!bundleSize(give) || !bundleSize(get)) return 'Both sides of a trade need cards';
  if (RESOURCES.some((r) => give[r] > 0 && get[r] > 0)) return 'A resource cannot be on both sides';
  if (!hasCards(s.players[player].hand, give)) return 'You do not have those cards';
  if (s.turn.offers >= MAX_OFFERS_PER_TURN) return 'Too many offers this turn';
  s.turn.offers++;
  const responses = {};
  for (const p of s.players) if (p.id !== player) responses[p.id] = null;
  s.trade = { from: player, give: clean(give), get: clean(get), responses };
  log(s, `${nameOf(s, player)} offered a trade`);
}

// Answer an offer: accept, decline, or decline with a counter-offer.
// counter is from the responder's side: { give: what I'd give, get: what I want }.
function respondTrade(s, { player, accept, counter }) {
  const t = s.trade;
  if (!t) return 'There is no open trade';
  if (!(player in t.responses)) return 'This offer is not for you';
  if (accept && !hasCards(s.players[player].hand, t.get)) return 'You do not have the cards asked for';
  if (counter && !accept) {
    const { give, get } = counter;
    if (!isCardBundle(give) || !isCardBundle(get) || !bundleSize(give) || !bundleSize(get)) return 'Bad counter-offer';
    if (RESOURCES.some((r) => give[r] > 0 && get[r] > 0)) return 'A resource cannot be on both sides';
    if (!hasCards(s.players[player].hand, give)) return 'You do not have those cards';
    t.counters = { ...(t.counters ?? {}), [player]: { give: clean(give), get: clean(get) } };
    t.responses[player] = 'counter';
    return;
  }
  t.responses[player] = accept ? 'accept' : 'decline';
}

// The terms the offerer would get with this partner: { give, get } from
// the offerer's side, or null if that partner hasn't said yes.
export function dealWith(t, partner) {
  if (t.responses[partner] === 'accept') return { give: t.give, get: t.get };
  if (t.responses[partner] === 'counter') return { give: t.counters[partner].get, get: t.counters[partner].give };
  return null;
}

function confirmTrade(s, { player, with: partner }) {
  const t = s.trade;
  if (!t || t.from !== player) return 'You have no open offer';
  const deal = dealWith(t, partner);
  if (!deal) return 'That player has not accepted';
  const me = s.players[player].hand;
  const them = s.players[partner].hand;
  if (!hasCards(me, deal.give) || !hasCards(them, deal.get)) return 'Someone no longer has the cards';
  transfer(s, player, partner, deal.give);
  transfer(s, partner, player, deal.get);
  s.trade = null;
  log(s, `${nameOf(s, player)} traded with ${nameOf(s, partner)}`);
}

function cancelTrade(s, { player }) {
  if (!s.trade || s.trade.from !== player) return 'You have no open offer';
  s.trade = null;
}

export const handlers = { bankTrade, offerTrade, respondTrade, confirmTrade, cancelTrade };

export function legal(state, p) {
  if (state.phase !== 'play') return [];
  const t = state.trade;
  if (t) {
    if (p === t.from) {
      return [
        ...Object.entries(t.responses).filter(([, r]) => r === 'accept' || r === 'counter')
          .map(([id]) => ({ type: 'confirmTrade', player: p, with: Number(id) })),
        { type: 'cancelTrade', player: p },
      ];
    }
    if (!(p in t.responses)) return [];
    const out = [{ type: 'respondTrade', player: p, accept: false }];
    if (hasCards(state.players[p].hand, t.get)) out.push({ type: 'respondTrade', player: p, accept: true });
    return out;
  }
  if (mainTurnError(state, p) || needsRoll(state) || freeRoadsOf(state, p) > 0) return [];
  // Offers to players are free-form, so they are not listed here.
  const out = [];
  for (const give of RESOURCES) {
    if (state.players[p].hand[give] < tradeRatio(state, p, give)) continue;
    for (const get of RESOURCES) {
      if (get !== give && state.bank[get] > 0) out.push({ type: 'bankTrade', player: p, give, get });
    }
  }
  return out;
}
