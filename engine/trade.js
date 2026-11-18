// Trading with the bank (4:1, or 3:1 / 2:1 with a port) and with players.
// Player trades: the current player offers, others accept or decline,
// then the offerer picks one who accepted (or cancels).
import { RESOURCES } from './constants.js';
import { isCardBundle, bundleSize, hasCards, moveCards, mainTurnError, log, nameOf } from './helpers.js';

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

function bankTrade(s, { player, give, get }) {
  const err = mainTurnError(s, player);
  if (err) return err;
  if (!s.turn.rolled) return 'Roll the dice first';
  if (!RESOURCES.includes(give) || !RESOURCES.includes(get) || give === get) return 'Pick two different resources';
  const ratio = tradeRatio(s, player, give);
  if (s.players[player].hand[give] < ratio) return `You need ${ratio} ${give}`;
  if (s.bank[get] < 1) return `The bank has no ${get} left`;
  moveCards(s.players[player].hand, s.bank, { [give]: ratio });
  moveCards(s.bank, s.players[player].hand, { [get]: 1 });
  log(s, `${nameOf(s, player)} traded ${ratio} ${give} for 1 ${get} with the bank`);
}

function offerTrade(s, { player, give, get }) {
  const err = mainTurnError(s, player);
  if (err) return err;
  if (!s.turn.rolled) return 'Roll the dice first';
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

function respondTrade(s, { player, accept }) {
  const t = s.trade;
  if (!t) return 'There is no open trade';
  if (!(player in t.responses)) return 'This offer is not for you';
  if (accept && !hasCards(s.players[player].hand, t.get)) return 'You do not have the cards asked for';
  t.responses[player] = accept ? 'accept' : 'decline';
}

function confirmTrade(s, { player, with: partner }) {
  const t = s.trade;
  if (!t || t.from !== player) return 'You have no open offer';
  if (t.responses[partner] !== 'accept') return 'That player has not accepted';
  const me = s.players[player].hand;
  const them = s.players[partner].hand;
  if (!hasCards(me, t.give) || !hasCards(them, t.get)) return 'Someone no longer has the cards';
  moveCards(me, them, t.give);
  moveCards(them, me, t.get);
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
        ...Object.entries(t.responses).filter(([, r]) => r === 'accept')
          .map(([id]) => ({ type: 'confirmTrade', player: p, with: Number(id) })),
        { type: 'cancelTrade', player: p },
      ];
    }
    if (!(p in t.responses)) return [];
    const out = [{ type: 'respondTrade', player: p, accept: false }];
    if (hasCards(state.players[p].hand, t.get)) out.push({ type: 'respondTrade', player: p, accept: true });
    return out;
  }
  if (mainTurnError(state, p) || !state.turn.rolled || state.turn.freeRoads > 0) return [];
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
