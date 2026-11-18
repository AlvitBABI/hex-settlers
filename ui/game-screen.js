// The game screen: shows the state, turns taps into engine actions,
// runs the bots and the turn timer. No game rules live here: everything
// goes through applyAction / legalActions.
import { applyAction, legalActions, waitingFor } from '../engine/game.js';
import { points } from '../engine/scoring.js';
import { tradeRatio } from '../engine/trade.js';
import { CARD_NAMES } from '../engine/cards.js';
import { COSTS, RESOURCES } from '../engine/constants.js';
import { handSize, hasCards } from '../engine/helpers.js';
import { chooseAction, timeoutAction } from '../bots/bot.js';
import { renderBoard } from './board-view.js';
import { renderPieces } from './pieces-view.js';
import { enablePanZoom } from './pan-zoom.js';
import { NAMES, RESOURCE_COLOUR, PLAYER_COLOURS } from './art.js';
import { saveGame, clearSave } from './storage.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// Add ?fast to the address to make bots move almost instantly (for testing).
const SPEED = new URLSearchParams(location.search).has('fast') ? 0.03 : 1;
const DICE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const CARD_HELP = {
  soldier: 'Move the bandit and steal a card.',
  point: '+1 victory point, kept secret.',
  roads: 'Build 2 roads for free.',
  harvest: 'Take any 2 resources from the bank.',
  monopoly: 'Take all of one resource from every player.',
};

// ---- Screen state (not game rules) ----
let S = null;          // game state
let config = null;     // { players, turnTime, seed }
let onExit = () => {};
let viewer = 0;        // the human whose cards are on screen
let cover = null;      // { type: 'pass', player } | null
let mode = null;       // 'road' | 'settlement' | 'city' while choosing a spot
let userSheet = null;  // 'trade' | 'cards' when opened by a button
let draft = null;      // trade offer being built
let bankPick = null;   // { give, get }
let discardPick = {};
let harvestPick = null; // [] while picking Harvest resources
let targets = [];
let autoTimer = null;
let deadline = null, deadlineKey = null, expiredKey = null, lastTick = Date.now();
let panZoom = null;
let toastTimer = null;

const isHuman = (p) => S.players[p].kind === 'human';
const humanCount = () => S.players.filter((p) => p.kind === 'human').length;
const resetDraft = () => { draft = { give: {}, get: {} }; bankPick = { give: null, get: null }; };

export function startGame({ config: cfg, state, onExit: exit }) {
  config = cfg;
  S = state;
  onExit = exit;
  viewer = S.players.find((p) => p.kind === 'human').id;
  mode = null; userSheet = null; harvestPick = null; discardPick = {};
  deadline = null; deadlineKey = null; expiredKey = null;
  resetDraft();
  updateViewer();
  if (humanCount() > 1) cover = { type: 'pass', player: viewer };

  const svg = $('board');
  const bounds = renderBoard(svg, S.board);
  if (panZoom) panZoom.setBounds(bounds);
  else panZoom = enablePanZoom(svg, bounds, { onTap });
  changed({ save: false });
}

export function stopGame() {
  clearTimeout(autoTimer);
  S = null;
}

// ---- Applying actions ----

function dispatch(action) {
  const res = applyAction(S, action);
  if (!res.ok) { toast(res.error); return false; }
  S = res.state;
  changed();
  return true;
}

function changed({ save = true } = {}) {
  if (save) saveGame({ config, state: S });
  if (S.phase === 'over') clearSave();
  const myTurn = S.phase === 'play' && S.current === viewer && !S.pending && !S.trade;
  if (mode && !myTurn) mode = null;
  if (S.pending?.type !== 'discard') discardPick = {};
  if (userSheet === 'trade' && (S.trade || S.pending)) userSheet = null;
  if (userSheet === 'cards' && S.pending) userSheet = null;
  updateViewer();
  updateDeadline();
  render();
  scheduleAuto();
}

// Pick whose cards are shown. With several humans, hand-overs get a cover.
function updateViewer() {
  const humans = waitingFor(S).filter(isHuman);
  let next = viewer;
  if (S.trade && !isHuman(S.trade.from)) next = viewer; // a bot's offer: everyone answers at the table
  else if (humans.includes(S.current)) next = S.current;
  else if (humans.length) next = humans[0];
  if (next !== viewer) {
    if (humanCount() > 1) cover = { type: 'pass', player: next };
    viewer = next;
    mode = null; userSheet = null; harvestPick = null;
  }
}

// ---- Bots and timeouts ----

function nextAuto() {
  if (!S || S.phase === 'over') return null;
  const timedOut = expiredKey !== null && expiredKey === deadlineKey;
  for (const p of waitingFor(S)) {
    if (!isHuman(p)) {
      const a = chooseAction(S, p);
      if (a) return a;
    } else if (timedOut) {
      const a = timeoutAction(S, p);
      if (a) return a;
    }
  }
  return null;
}

function scheduleAuto() {
  clearTimeout(autoTimer);
  const next = nextAuto();
  if (!next) return;
  const delay = isHuman(next.player) ? 150
    : S.phase === 'setup' ? 500
      : next.type === 'respondTrade' ? 600 : 850;
  const wait = delay * SPEED;
  autoTimer = setTimeout(() => {
    const a = nextAuto();
    if (!a) return;
    let res = applyAction(S, a);
    if (!res.ok) {
      console.warn('Automatic move refused:', a, res.error);
      const fallback = timeoutAction(S, a.player);
      res = fallback ? applyAction(S, fallback) : res;
      if (!res.ok) return;
    }
    S = res.state;
    changed();
  }, wait);
}

// ---- Turn timer (colonist-style: when it runs out, the game plays for you) ----

function timerKey() {
  if (!config.turnTime || S.phase === 'over') return null;
  const humans = waitingFor(S).filter(isHuman);
  if (!humans.length) return null;
  if (S.trade && !isHuman(S.trade.from)) return `offer-${S.turn.number}-${S.turn.offers}`;
  if (S.pending?.type === 'discard') return `discard-${S.turn.number}`;
  if (humans.includes(S.current)) return S.phase === 'setup' ? `setup-${S.setup.index}` : `turn-${S.turn.number}`;
  return null;
}

function secondsFor(key) {
  const t = config.turnTime;
  if (key.startsWith('offer')) return Math.min(15, t);
  if (key.startsWith('discard')) return Math.max(15, Math.round(t / 2));
  return t;
}

function updateDeadline() {
  const key = timerKey();
  if (key === deadlineKey) return;
  deadlineKey = key;
  deadline = key ? Date.now() + secondsFor(key) * 1000 : null;
}

function tick() {
  const now = Date.now();
  if (deadline && cover) deadline += now - lastTick; // paused while the phone is passed
  lastTick = now;
  const el = $('timer');
  if (!S || !deadline) { el.textContent = ''; return; }
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  el.textContent = `${left}s`;
  el.classList.toggle('low', left <= 10);
  if (left === 0 && expiredKey !== deadlineKey) {
    expiredKey = deadlineKey;
    mode = null; userSheet = null; harvestPick = null;
    toast('Time is up! Playing for you…');
    render();
    scheduleAuto();
  }
}
setInterval(tick, 250);

// ---- Taps ----

function onTap(target) {
  if (cover) return;
  const g = target.closest('[data-target]');
  if (!g) return;
  const action = targets[Number(g.dataset.target)];
  if (action) { mode = null; dispatch(action); }
}

const ACTIONS = {
  roll: () => dispatch({ type: 'roll', player: viewer }),
  end: () => dispatch({ type: 'endTurn', player: viewer }),
  road: () => { mode = mode === 'road' ? null : 'road'; render(); },
  settlement: () => { mode = mode === 'settlement' ? null : 'settlement'; render(); },
  city: () => { mode = mode === 'city' ? null : 'city'; render(); },
  buy: () => dispatch({ type: 'buyCard', player: viewer }),
  trade: () => { userSheet = 'trade'; mode = null; resetDraft(); render(); },
  cards: () => { userSheet = 'cards'; mode = null; harvestPick = null; render(); },
  close: () => { userSheet = null; harvestPick = null; render(); },
  fit: () => panZoom.fit(),
  menu: () => { if (S.phase === 'over') return exit(); userSheet = 'leave'; mode = null; render(); },
  leave: () => exit(),
  uncover: () => { cover = null; render(); },
  newgame: () => exit(),
};

function exit() {
  stopGame();
  onExit();
}

document.addEventListener('click', (e) => {
  if (!S) return;
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (ACTIONS[d.act]) return ACTIONS[d.act]();
  const n = (x) => Number(x);
  switch (d.act) {
    case 'draft': {
      const side = draft[d.side];
      side[d.res] = Math.max(0, (side[d.res] ?? 0) + n(d.delta));
      if (d.side === 'give') side[d.res] = Math.min(side[d.res], S.players[viewer].hand[d.res]);
      if (side[d.res] > 0) draft[d.side === 'give' ? 'get' : 'give'][d.res] = 0;
      return render();
    }
    case 'bank-pick':
      bankPick[d.side] = bankPick[d.side] === d.res ? null : d.res;
      return render();
    case 'bank-trade':
      if (dispatch({ type: 'bankTrade', player: viewer, give: bankPick.give, get: bankPick.get })) {
        bankPick = { give: null, get: null };
        userSheet = 'trade';
        render();
      }
      return;
    case 'offer': {
      const clean = (x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v > 0));
      dispatch({ type: 'offerTrade', player: viewer, give: clean(draft.give), get: clean(draft.get) });
      return;
    }
    case 'respond': return dispatch({ type: 'respondTrade', player: n(d.player), accept: d.accept === '1' });
    case 'confirm': return dispatch({ type: 'confirmTrade', player: viewer, with: n(d.with) });
    case 'cancel-offer': return dispatch({ type: 'cancelTrade', player: viewer });
    case 'discard-pick': {
      const have = S.players[viewer].hand[d.res];
      discardPick[d.res] = Math.min(have, Math.max(0, (discardPick[d.res] ?? 0) + n(d.delta)));
      return render();
    }
    case 'discard': return dispatch({ type: 'discard', player: viewer, cards: discardPick });
    case 'steal': return dispatch({ type: 'steal', player: viewer, victim: n(d.victim) });
    case 'play': {
      if (d.card === 'harvest') { harvestPick = []; return render(); }
      if (d.card === 'monopoly') { harvestPick = 'monopoly'; return render(); }
      if (dispatch({ type: 'playCard', player: viewer, card: d.card })) userSheet = null;
      return render();
    }
    case 'pick-res': {
      if (harvestPick === 'monopoly') {
        if (dispatch({ type: 'playCard', player: viewer, card: 'monopoly', resource: d.res })) { userSheet = null; harvestPick = null; render(); }
        return;
      }
      harvestPick.push(d.res);
      if (harvestPick.length === 2) {
        const resources = harvestPick;
        harvestPick = null;
        if (dispatch({ type: 'playCard', player: viewer, card: 'harvest', resources })) { userSheet = null; render(); }
        return;
      }
      return render();
    }
  }
});

// ---- Drawing ----

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

const icon = (r) => `<svg class="ico" viewBox="-24 -18 48 36"><use href="#i-${r}" x="-24" y="-18" width="48" height="36"/></svg>`;
const chips = (cards) => Object.entries(cards).filter(([, n]) => n > 0)
  .map(([r, n]) => `<span class="mini" style="--rc:${RESOURCE_COLOUR[r]}">${icon(r)}<b>${n}</b></span>`).join('') || '—';
const costDots = (cost) => `<span class="cost">${Object.entries(cost)
  .flatMap(([r, n]) => Array(n).fill(`<i style="background:${RESOURCE_COLOUR[r]}"></i>`)).join('')}</span>`;

function render() {
  if (!S) return;
  const legal = !cover && waitingFor(S).includes(viewer) ? legalActions(S, viewer) : [];
  targets = boardTargets(legal);
  const dice = S.turn.dice;
  const hot = S.phase === 'play' && S.turn.rolled && dice && dice[0] + dice[1] !== 7 ? dice[0] + dice[1] : null;
  renderPieces($('board'), S, { targets, hot });
  renderPlayers();
  renderStatus();
  renderDock(legal);
  renderSheet(legal);
  renderCover();
}

function boardTargets(legal) {
  if (S.phase === 'setup') return legal;
  if (S.pending?.type === 'moveBandit') return legal.filter((a) => a.type === 'moveBandit');
  if (S.turn.freeRoads > 0) return legal.filter((a) => a.type === 'buildRoad');
  const type = { road: 'buildRoad', settlement: 'buildSettlement', city: 'buildCity' }[mode];
  return type ? legal.filter((a) => a.type === type) : [];
}

function renderPlayers() {
  $('players').innerHTML = S.players.map((p) => {
    const showAll = S.phase === 'over' || (p.id === viewer && !cover);
    const pts = points(S, p.id, { includeHidden: showAll });
    const cls = [p.id === S.current ? 'current' : '', p.id === viewer && humanCount() > 1 ? 'viewer' : ''].join(' ');
    return `<div class="chip ${cls}" style="--c:${PLAYER_COLOURS[p.id]}">
      <div class="chip-name"><span class="dot"></span>${esc(p.name)}</div>
      <div class="chip-stats"><b>${pts}</b><span class="lbl">pts</span>
        <span class="stat-cards" title="Resource cards">${handSize(p.hand)}</span>
        <span class="stat-bonus" title="Bonus cards">${p.cards.length}</span></div>
      <div class="badges">${S.longestRoad.player === p.id ? '<span>Route</span>' : ''}${S.largestArmy.player === p.id ? '<span>Army</span>' : ''}</div>
    </div>`;
  }).join('');
}

function statusText() {
  const cur = S.players[S.current];
  const me = viewer;
  if (S.phase === 'over') return `${S.players[S.winner].name} wins!`;
  if (S.phase === 'setup') {
    if (S.current !== me) return `${cur.name} is placing…`;
    return S.setup.step === 'settlement' ? 'Tap a glowing corner for your settlement' : 'Now tap a glowing edge for its road';
  }
  if (S.pending?.type === 'discard') return S.pending.counts[me] ? `Too many cards: discard ${S.pending.counts[me]}` : 'Waiting for discards…';
  if (S.pending?.type === 'moveBandit') return S.current === me ? 'Move the bandit: tap a glowing tile' : `${cur.name} is moving the bandit…`;
  if (S.pending?.type === 'steal') return S.current === me ? 'Pick who to steal from' : `${cur.name} is stealing…`;
  if (S.trade) return S.trade.from === me ? 'Waiting for answers to your offer…' : `${S.players[S.trade.from].name} wants to trade`;
  if (S.current !== me) return `${cur.name}'s turn…`;
  if (S.turn.freeRoads) return `Place ${S.turn.freeRoads} free road${S.turn.freeRoads > 1 ? 's' : ''}`;
  if (!S.turn.rolled) return 'Your turn: roll the dice';
  if (mode) return `Tap a glowing spot for your ${mode}`;
  return 'Build, trade or end your turn';
}

function renderStatus() {
  $('msg').textContent = statusText();
  $('log').textContent = S.log.at(-1) ?? '';
  const d = S.turn.dice;
  $('dice').innerHTML = d && S.phase === 'play' ? `<span>${DICE[d[0]]}</span><span>${DICE[d[1]]}</span>` : '';
  $('status').style.setProperty('--c', PLAYER_COLOURS[S.current]);
}

function renderDock(legal) {
  const pl = S.players[viewer];
  const hidden = !!cover;
  $('hand').innerHTML = hidden ? '' : RESOURCES.map((r) => `
    <div class="res" style="--rc:${RESOURCE_COLOUR[r]}">${icon(r)}<b>${pl.hand[r]}</b><small>${NAMES[r]}</small></div>`).join('');
  const has = (t) => legal.some((a) => a.type === t);
  const myMain = S.phase === 'play' && S.current === viewer && !S.pending && !S.trade && !hidden;
  const btn = (act, label, enabled, extra = '', cls = '') =>
    `<button data-act="${act}" class="act ${cls} ${mode === act ? 'on' : ''}" ${enabled ? '' : 'disabled'}>${label}${extra}</button>`;
  const free = S.turn.freeRoads > 0;
  $('actions').innerHTML = [
    btn('road', 'Road', has('buildRoad') && !free, costDots(COSTS.road)),
    btn('settlement', 'House', has('buildSettlement'), costDots(COSTS.settlement)),
    btn('city', 'City', has('buildCity'), costDots(COSTS.city)),
    btn('buy', 'Card', has('buyCard'), costDots(COSTS.card)),
    btn('trade', 'Trade', myMain && S.turn.rolled && !free),
    btn('cards', `Cards <span class="count">${pl.cards.length}</span>`, !hidden && pl.cards.length > 0),
    has('roll') ? btn('roll', 'Roll', true, '', 'primary') : btn('end', 'End turn', has('endTurn'), '', 'primary'),
  ].join('');
}

// ---- Bottom sheets ----

function renderSheet(legal) {
  const sheet = $('sheet');
  const kind = autoSheet() ?? (cover ? null : userSheet);
  sheet.classList.toggle('open', !!kind);
  if (!kind) { sheet.innerHTML = ''; return; }
  const close = ['trade', 'cards', 'leave'].includes(kind) ? '<button class="close" data-act="close" aria-label="Close">✕</button>' : '';
  const body = { discard: discardSheet, steal: stealSheet, offer: offerSheet, myOffer: myOfferSheet, trade: tradeSheet, cards: cardsSheet, leave: leaveSheet }[kind](legal);
  sheet.innerHTML = `<div class="sheet-inner">${close}${body}</div>`;
}

function autoSheet() {
  if (cover || S.phase === 'over') return null;
  if (S.pending?.type === 'discard' && S.pending.counts[viewer] && isHuman(viewer)) return 'discard';
  if (S.pending?.type === 'steal' && S.current === viewer) return 'steal';
  if (S.trade) {
    if (S.trade.from === viewer) return 'myOffer';
    if (!isHuman(S.trade.from) && Object.keys(S.trade.responses).some((p) => isHuman(Number(p)))) return 'offer';
  }
  return null;
}

function discardSheet() {
  const need = S.pending.counts[viewer];
  const hand = S.players[viewer].hand;
  const picked = Object.values(discardPick).reduce((a, b) => a + b, 0);
  return `<h3>Discard ${need} cards</h3><p class="sub">You have more than 7 cards and a 7 was rolled.</p>
    <div class="steppers">${RESOURCES.filter((r) => hand[r] > 0).map((r) => stepper(r, discardPick[r] ?? 0, hand[r], 'discard-pick')).join('')}</div>
    <button class="primary wide" data-act="discard" ${picked === need ? '' : 'disabled'}>Discard ${picked} / ${need}</button>`;
}

function stepper(r, value, max, act, side = '') {
  const sideAttr = side ? `data-side="${side}"` : '';
  return `<div class="stepper" style="--rc:${RESOURCE_COLOUR[r]}">
    <span class="ic">${icon(r)}${max !== null ? `<small class="have">have ${max}</small>` : ''}</span>
    <span class="nm">${NAMES[r]}</span>
    <button data-act="${act}" ${sideAttr} data-res="${r}" data-delta="-1" ${value ? '' : 'disabled'}>−</button>
    <b>${value}</b>
    <button data-act="${act}" ${sideAttr} data-res="${r}" data-delta="1" ${max !== null && value >= max ? 'disabled' : ''}>+</button>
  </div>`;
}

function stealSheet() {
  return `<h3>Steal a card from…</h3><div class="list">${S.pending.victims.map((v) => `
    <button class="row-btn" data-act="steal" data-victim="${v}" style="--c:${PLAYER_COLOURS[v]}">
      <span class="dot"></span>${esc(S.players[v].name)}<small>${handSize(S.players[v].hand)} cards</small></button>`).join('')}</div>`;
}

// A bot (or other player) offers a trade; humans at the table answer.
function offerSheet() {
  const t = S.trade;
  const from = S.players[t.from];
  const rows = Object.entries(t.responses).filter(([p]) => isHuman(Number(p))).map(([p, r]) => {
    const id = Number(p);
    const can = hasCards(S.players[id].hand, t.get);
    const answer = r === null
      ? `<button data-act="respond" data-player="${id}" data-accept="0">Decline</button>
         <button class="primary" data-act="respond" data-player="${id}" data-accept="1" ${can ? '' : 'disabled'}>Accept</button>`
      : `<span class="answer ${r}">${r === 'accept' ? 'Accepted' : 'Declined'}</span>`;
    return `<div class="resp" style="--c:${PLAYER_COLOURS[id]}"><span class="dot"></span>${esc(S.players[id].name)}
      ${!can && r === null ? '<small>not enough cards</small>' : ''}<span class="grow"></span>${answer}</div>`;
  }).join('');
  return `<h3>${esc(from.name)} offers a trade</h3>
    <div class="deal"><div><small>You get</small>${chips(t.give)}</div><div class="arrow">⇄</div><div><small>You give</small>${chips(t.get)}</div></div>
    ${rows}`;
}

// The viewer's own open offer: see answers, pick a partner or cancel.
function myOfferSheet() {
  const t = S.trade;
  const rows = Object.entries(t.responses).map(([p, r]) => {
    const id = Number(p);
    let right;
    if (r === 'accept') right = `<button class="primary" data-act="confirm" data-with="${id}">Trade</button>`;
    else if (r === 'decline') right = '<span class="answer decline">Declined</span>';
    else if (isHuman(id)) {
      const can = hasCards(S.players[id].hand, t.get);
      right = `<button data-act="respond" data-player="${id}" data-accept="0">No</button>
        <button data-act="respond" data-player="${id}" data-accept="1" ${can ? '' : 'disabled'}>Yes</button>`;
    } else right = '<span class="answer wait">Thinking…</span>';
    return `<div class="resp" style="--c:${PLAYER_COLOURS[id]}"><span class="dot"></span>${esc(S.players[id].name)}<span class="grow"></span>${right}</div>`;
  }).join('');
  return `<h3>Your offer</h3>
    <div class="deal"><div><small>You give</small>${chips(t.give)}</div><div class="arrow">⇄</div><div><small>You get</small>${chips(t.get)}</div></div>
    ${rows}
    <button class="wide" data-act="cancel-offer">Cancel offer</button>`;
}

function tradeSheet() {
  const hand = S.players[viewer].hand;
  const bankBtn = (side, r) => {
    const ratio = tradeRatio(S, viewer, r);
    const ok = side === 'give' ? hand[r] >= ratio : S.bank[r] > 0;
    const on = bankPick[side] === r ? 'on' : '';
    return `<button class="pick ${on}" data-act="bank-pick" data-side="${side}" data-res="${r}" style="--rc:${RESOURCE_COLOUR[r]}" ${ok ? '' : 'disabled'}>
      ${icon(r)}${side === 'give' ? `<small>${ratio}:1</small>` : ''}</button>`;
  };
  const canBank = bankPick.give && bankPick.get && bankPick.give !== bankPick.get;
  const giveN = Object.values(draft.give).reduce((a, b) => a + b, 0);
  const getN = Object.values(draft.get).reduce((a, b) => a + b, 0);
  return `<h3>Trade</h3>
    <h4>With the bank</h4>
    <div class="pick-row"><span class="pr-lbl">Give</span>${RESOURCES.map((r) => bankBtn('give', r)).join('')}</div>
    <div class="pick-row"><span class="pr-lbl">Get</span>${RESOURCES.map((r) => bankBtn('get', r)).join('')}</div>
    <button class="wide" data-act="bank-trade" ${canBank ? '' : 'disabled'}>Trade with bank</button>
    <h4>With players</h4>
    <div class="two-col">
      <div><small>You give</small>${RESOURCES.map((r) => stepper(r, draft.give[r] ?? 0, hand[r], 'draft', 'give')).join('')}</div>
      <div><small>You want</small>${RESOURCES.map((r) => stepper(r, draft.get[r] ?? 0, null, 'draft', 'get')).join('')}</div>
    </div>
    <button class="primary wide" data-act="offer" ${giveN && getN ? '' : 'disabled'}>Offer to players</button>`;
}

function leaveSheet() {
  return `<h3>Leave this game?</h3><p class="sub">It is saved on this phone, so you can continue it from the menu.</p>
    <button class="primary wide" data-act="leave">Leave to menu</button>
    <button class="wide" data-act="close">Keep playing</button>`;
}

function cardsSheet(legal) {
  const pl = S.players[viewer];
  if (harvestPick) {
    const title = harvestPick === 'monopoly' ? 'Monopoly: pick a resource' : `Harvest: pick ${2 - harvestPick.length} more`;
    return `<h3>${title}</h3><div class="pick-row">${RESOURCES.map((r) => `
      <button class="pick" data-act="pick-res" data-res="${r}" style="--rc:${RESOURCE_COLOUR[r]}">${icon(r)}<small>${NAMES[r]}</small></button>`).join('')}</div>`;
  }
  const counts = {};
  for (const c of pl.cards) counts[c.type] = (counts[c.type] ?? 0) + 1;
  const canPlay = (type) => legal.some((a) => a.type === 'playCard' && a.card === type);
  const rows = Object.entries(counts).map(([type, n]) => `
    <div class="card-row"><div><b>${CARD_NAMES[type]}</b> ×${n}<br><small>${CARD_HELP[type]}</small></div>
    ${type === 'point' ? '' : `<button class="primary" data-act="play" data-card="${type}" ${canPlay(type) ? '' : 'disabled'}>Play</button>`}</div>`).join('');
  return `<h3>Your bonus cards</h3>${rows || '<p class="sub">No cards yet.</p>'}
    <p class="sub">One card per turn. New cards can be played from your next turn.</p>`;
}

// ---- Covers: pass the phone, and the winner ----

function renderCover() {
  const el = $('cover');
  if (S.phase === 'over') {
    const ranked = S.players.slice().sort((a, b) => points(S, b.id) - points(S, a.id));
    el.className = 'cover open';
    el.innerHTML = `<div class="cover-card"><h2>🏆 ${esc(S.players[S.winner].name)} wins!</h2>
      ${ranked.map((p) => `<div class="rank" style="--c:${PLAYER_COLOURS[p.id]}"><span class="dot"></span>${esc(p.name)}<span class="grow"></span><b>${points(S, p.id)}</b></div>`).join('')}
      <button class="primary wide big" data-act="newgame">Back to menu</button></div>`;
    return;
  }
  if (cover?.type === 'pass') {
    const p = S.players[cover.player];
    el.className = 'cover open';
    el.innerHTML = `<div class="cover-card" style="--c:${PLAYER_COLOURS[p.id]}">
      <p class="sub">Pass the phone to</p><h2><span class="dot big"></span>${esc(p.name)}</h2>
      <button class="primary wide big" data-act="uncover">I'm ${esc(p.name)}: show my cards</button></div>`;
    return;
  }
  el.className = 'cover';
  el.innerHTML = '';
}
