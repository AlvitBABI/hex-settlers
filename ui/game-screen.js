// The game screen: shows the state, turns taps into engine actions,
// runs the bots, the turn timer, animations and sounds. No game rules
// live here: everything goes through applyAction / legalActions.
import { applyAction, legalActions, waitingFor } from '../engine/game.js';
import { points, longestRoadFor } from '../engine/scoring.js';
import { tradeRatio, bankTradeError, dealWith } from '../engine/trade.js';
import { CARD_NAMES } from '../engine/cards.js';
import { COSTS, RESOURCES, DISCARD_LIMIT } from '../engine/constants.js';
import { HEX_CORNERS } from '../engine/topology.js';
import { handSize, hasCards } from '../engine/helpers.js';
import { chooseAction, timeoutAction } from '../bots/bot.js';
import { renderBoard } from './board-view.js';
import { renderPieces, ripple, toScreen } from './pieces-view.js';
import { hexCentre } from './geometry.js';
import { enablePanZoom } from './pan-zoom.js';
import { NAMES, RESOURCE_COLOUR, PLAYER_COLOURS } from './art.js';
import { saveGame, clearSave } from './storage.js';
import { sfx, soundOn, toggleSound } from './sound.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// Add ?fast to the address to make bots move almost instantly (for testing).
const SPEED = new URLSearchParams(location.search).has('fast') ? 0.03 : 1;
const CARD_HELP = {
  soldier: 'Move the bandit and steal a card.',
  point: '+1 victory point, kept secret.',
  roads: 'Build 2 roads for free.',
  harvest: 'Take any 2 resources from the bank.',
  monopoly: 'Take all of one resource from every player.',
};
// Moves that can be taken back (they reveal nothing random).
const UNDOABLE = new Set(['placeSettlement', 'buildRoad', 'buildSettlement', 'buildCity', 'bankTrade']);

// ---- Screen state (not game rules) ----
let S = null;          // game state
let config = null;     // { players, turnTime, seed }
let onExit = () => {};
let viewer = 0;        // the human whose cards are on screen
let cover = null;      // { type: 'pass', player } | null
let mode = null;       // 'road' | 'settlement' | 'city' while choosing a spot
let userSheet = null;  // 'trade' | 'cards' | 'leave' when opened by a button
let draft = null;      // trade being built: { give: {}, get: {} }
let backToTrade = false; // reopen the trade panel when an offer closes
let countering = null;  // a human building a counter-offer to the open trade
let discardPick = {};
let harvestPick = null; // [] while picking Harvest, 'monopoly' while picking Monopoly
let targets = [];
let undoStack = [];
let autoTimer = null;
let deadline = null, deadlineKey = null, expiredKey = null, lastTick = Date.now(), lastBeep = null;
let panZoom = null;

const isHuman = (p) => S.players[p].kind === 'human';
const humanCount = () => S.players.filter((p) => p.kind === 'human').length;
const clean = (b) => Object.fromEntries(Object.entries(b).filter(([, n]) => n > 0));
const total = (b) => Object.values(b).reduce((a, n) => a + n, 0);
const resetDraft = () => { draft = { give: {}, get: {} }; };

export function startGame({ config: cfg, state, onExit: exit }) {
  config = cfg;
  S = state;
  onExit = exit;
  viewer = S.players.find((p) => p.kind === 'human').id;
  mode = null; userSheet = null; harvestPick = null; discardPick = {}; undoStack = []; backToTrade = false; countering = null;
  deadline = null; deadlineKey = null; expiredKey = null;
  resetDraft();
  updateViewer();
  if (humanCount() > 1) cover = { type: 'pass', player: viewer };

  const svg = $('board');
  const bounds = renderBoard(svg, S.board);
  if (panZoom) panZoom.setBounds(bounds);
  else panZoom = enablePanZoom(svg, bounds, { onTap });
  $('sound').textContent = soundOn() ? '🔊' : '🔇';
  changed(null, { save: false });
}

export function stopGame() {
  clearTimeout(autoTimer);
  S = null;
}

// ---- Applying actions ----

function dispatch(action) {
  const before = S;
  const res = applyAction(S, action);
  if (!res.ok) { toast(res.error); return false; }
  if (UNDOABLE.has(action.type) && isHuman(action.player)) undoStack.push(before);
  else undoStack = [];
  S = res.state;
  changed(before);
  return true;
}

function undo() {
  if (!undoStack.length) return;
  const prev = S;
  S = undoStack.pop();
  mode = null;
  changed(prev, { quiet: true });
}

function changed(prev, { save = true, quiet = false } = {}) {
  if (save) saveGame({ config, state: S });
  if (S.phase === 'over') clearSave();
  const myTurn = S.phase === 'play' && S.current === viewer && !S.pending && !S.trade;
  if (mode && !myTurn) mode = null;
  if (S.pending?.type !== 'discard') discardPick = {};
  if (countering !== null && S.trade?.responses[countering] !== null) countering = null;
  if (userSheet === 'trade' && (S.trade || S.pending)) userSheet = null;
  if (userSheet === 'cards' && S.pending) userSheet = null;
  if (backToTrade && !S.trade) {
    backToTrade = false;
    if (myTurn) { userSheet = 'trade'; resetDraft(); }
  }
  updateViewer();
  updateDeadline();
  render();
  if (prev && !quiet) showEvents(prev, S);
  scheduleAuto(prev);
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
    mode = null; userSheet = null; harvestPick = null; undoStack = [];
  }
}

// ---- Bots, automatic declines and timeouts ----

function nextAuto() {
  if (!S || S.phase === 'over') return null;
  const t = S.trade;
  for (const p of waitingFor(S)) {
    if (!isHuman(p)) {
      const a = chooseAction(S, p);
      if (a) return a;
    } else if (t && t.from !== p && t.responses[p] === null && !hasCards(S.players[p].hand, t.get)) {
      return { type: 'respondTrade', player: p, accept: false }; // can't accept anyway: no need to ask
    } else if (timedOut()) {
      const a = timeoutAction(S, p);
      if (a) return a;
    }
  }
  return null;
}

// A new roll happened between prev and next (compare the turn, not the dice
// array: every move copies the state, so the array is always a new object).
const newRoll = (prev, next) => !!(next.turn.rolled && next.turn.dice &&
  (!prev.turn.rolled || prev.turn.number !== next.turn.number));

const timedOut = () => expiredKey !== null && expiredKey === deadlineKey;

function scheduleAuto(prev) {
  clearTimeout(autoTimer);
  const next = nextAuto();
  if (!next) return;
  // Give people time to see what just happened before the next bot move.
  const justRolled = prev && newRoll(prev, S);
  const banditMoved = prev && prev.bandit !== S.bandit;
  let delay = isHuman(next.player) ? (next.type === 'respondTrade' ? 300 : 150)
    : S.phase === 'setup' ? 500
      : next.type === 'respondTrade' ? 350 : 850;
  if (justRolled) delay = Math.max(delay, 1700);
  if (banditMoved) delay = Math.max(delay, 1200);
  autoTimer = setTimeout(() => {
    const a = nextAuto();
    if (!a) return;
    const before = S;
    let res = applyAction(S, a);
    if (!res.ok) {
      console.warn('Automatic move refused:', a, res.error);
      const fallback = timeoutAction(S, a.player);
      res = fallback ? applyAction(S, fallback) : res;
      if (!res.ok) return;
    }
    undoStack = [];
    S = res.state;
    if (a.type === 'cancelTrade' && before.trade) {
      const countered = Object.entries(before.trade.responses).filter(([p, r]) => r === 'counter' && isHuman(Number(p)));
      if (countered.length) note(`${S.players[a.player].name} turned down the counter-offer`);
    }
    if (a.type === 'respondTrade' && isHuman(a.player) && !a.accept && !timedOut() && before.trade) {
      const t = before.trade;
      note(`${S.players[t.from].name} wanted ${describe(t.get)}: you don't have it`);
    }
    changed(before);
  }, delay * SPEED);
}

// ---- Turn timer (colonist-style: when it runs out, the game plays for you) ----

function timerKey() {
  if (!config.turnTime || S.phase === 'over') return null;
  const humans = waitingFor(S).filter(isHuman);
  if (!humans.length) return null;
  const t = S.trade;
  if (t && !isHuman(t.from)) {
    const canAnswer = humans.some((p) => t.responses[p] === null && hasCards(S.players[p].hand, t.get));
    return canAnswer ? `offer-${S.turn.number}-${S.turn.offers}` : null;
  }
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

// The clock stops while the phone is being passed, and while your own
// offer is waiting for answers (so trying trades doesn't eat your turn).
function timerPaused() {
  if (cover || countering !== null) return true;
  const t = S.trade;
  return !!(t && t.from === viewer && Object.values(t.responses).some((r) => r === null));
}

function tick() {
  const now = Date.now();
  if (S && deadline && timerPaused()) deadline += now - lastTick;
  lastTick = now;
  const el = $('timer');
  if (!S || !deadline) { el.textContent = ''; return; }
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  el.textContent = `${left}s`;
  el.classList.toggle('low', left <= 10);
  el.classList.toggle('paused', timerPaused());
  if (left <= 5 && left > 0 && lastBeep !== left && !timerPaused()) { lastBeep = left; sfx.tick(); }
  if (left === 0 && expiredKey !== deadlineKey) {
    expiredKey = deadlineKey;
    mode = null; userSheet = null; harvestPick = null; backToTrade = false;
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

const canTradeNow = () => S.phase === 'play' && S.current === viewer && !S.pending && !S.trade &&
  S.turn.rolled && !S.turn.freeRoads && !cover;

const ACTIONS = {
  roll: () => dispatch({ type: 'roll', player: viewer }),
  end: () => dispatch({ type: 'endTurn', player: viewer }),
  road: () => { mode = mode === 'road' ? null : 'road'; render(); },
  settlement: () => { mode = mode === 'settlement' ? null : 'settlement'; render(); },
  city: () => { mode = mode === 'city' ? null : 'city'; render(); },
  buy: () => dispatch({ type: 'buyCard', player: viewer }),
  trade: () => { userSheet = userSheet === 'trade' ? null : 'trade'; mode = null; resetDraft(); render(); },
  cards: () => { userSheet = userSheet === 'cards' ? null : 'cards'; mode = null; harvestPick = null; render(); },
  close: () => { userSheet = null; harvestPick = null; render(); },
  fit: () => panZoom.fit(),
  undo: () => undo(),
  sound: () => { $('sound').textContent = toggleSound() ? '🔊' : '🔇'; },
  menu: () => { if (S.phase === 'over') return exit(); userSheet = 'leave'; mode = null; render(); },
  leave: () => exit(),
  uncover: () => { cover = null; render(); },
  newgame: () => exit(),
  'bank-trade': () => {
    if (dispatch({ type: 'bankTrade', player: viewer, give: clean(draft.give), get: clean(draft.get) })) {
      sfx.trade();
      resetDraft();
      userSheet = 'trade';
      render();
    }
  },
  offer: () => {
    if (dispatch({ type: 'offerTrade', player: viewer, give: clean(draft.give), get: clean(draft.get) })) backToTrade = true;
  },
  'cancel-offer': () => dispatch({ type: 'cancelTrade', player: viewer }),
  discard: () => dispatch({ type: 'discard', player: viewer, cards: discardPick }),
};

function exit() {
  stopGame();
  onExit();
}

// Add/remove one card on one side of the trade being built.
function adjustDraft(side, r, delta, who = viewer) {
  const other = side === 'give' ? 'get' : 'give';
  const max = side === 'give' ? S.players[who].hand[r] : 19;
  draft[side][r] = Math.min(max, Math.max(0, (draft[side][r] ?? 0) + delta));
  if (draft[side][r] > 0) draft[other][r] = 0;
}

document.addEventListener('click', (e) => {
  if (!S) return;
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (ACTIONS[d.act]) return ACTIONS[d.act]();
  const n = Number;
  switch (d.act) {
    case 'hand-card':
      // Tap a card in your hand: start (or add to) a trade with it.
      if (userSheet === 'trade' || canTradeNow()) {
        if (userSheet !== 'trade') { resetDraft(); userSheet = 'trade'; mode = null; }
        adjustDraft('give', d.res, 1);
        render();
      }
      return;
    case 'tt':
      adjustDraft(d.side, d.res, n(d.delta), countering ?? viewer);
      return render();
    case 'counter': {
      // Start a counter-offer: the open deal flipped round, ready to adjust.
      const t = S.trade;
      countering = n(d.player);
      draft = { give: { ...t.get }, get: { ...t.give } };
      return render();
    }
    case 'counter-back': countering = null; return render();
    case 'send-counter': {
      const who = countering;
      countering = null;
      dispatch({ type: 'respondTrade', player: who, accept: false, counter: { give: clean(draft.give), get: clean(draft.get) } });
      return;
    }
    case 'respond': return dispatch({ type: 'respondTrade', player: n(d.player), accept: d.accept === '1' });
    case 'confirm':
      if (dispatch({ type: 'confirmTrade', player: viewer, with: n(d.with) })) sfx.trade();
      return;
    case 'discard-pick': {
      const have = S.players[viewer].hand[d.res];
      discardPick[d.res] = Math.min(have, Math.max(0, (discardPick[d.res] ?? 0) + n(d.delta)));
      return render();
    }
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

// ---- Little messages ----

let toastTimer = null, noteTimer = null, bannerTimer = null;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
// A small, quiet message at the side of the board.
function note(text) {
  const t = $('note');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
// A big message across the board for important moments.
function banner(html, cls = '') {
  const b = $('banner');
  b.className = `banner show ${cls}`;
  b.innerHTML = html;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.className = 'banner'; }, 1900);
}

const describe = (cards) => Object.entries(cards).map(([r, n]) => `${n} ${NAMES[r].toLowerCase()}`).join(' + ');

// ---- Animations and sounds for what just changed ----

function showEvents(prev, next) {
  const svg = $('board');
  const fresh = (next.logCount ?? 0) - (prev.logCount ?? 0);
  const newLines = fresh > 0 ? next.log.slice(-fresh) : [];
  const rolled = newRoll(prev, next);
  const slow = Math.max(SPEED, 0.3);

  if (rolled) {
    rollDice(next.turn.dice);
    const sum = next.turn.dice[0] + next.turn.dice[1];
    if (sum === 7) setTimeout(() => { banner('🎲 7! The bandit strikes', 'danger'); sfx.bandit(); }, 900 * slow);
    else setTimeout(() => flyProduction(prev, next, sum), 800 * slow);
  } else {
    showHandChanges(prev, next);
  }

  if (prev.bandit !== next.bandit) {
    ripple(svg, next.bandit);
    sfx.bandit();
  }
  for (const line of newLines) {
    if (line.includes('played Soldier')) {
      banner(`⚔️ ${esc(line.replace(' played Soldier', ''))} plays a Soldier!`, 'soldier');
      sfx.soldier();
    } else if (/played (Monopoly|Harvest|Road Crew)/.test(line)) {
      banner(`✨ ${esc(line)}`);
    } else if (/takes the (Longest Route|Strongest Army)/.test(line)) {
      banner(`🏅 ${esc(line)}`, 'award');
    } else if (/stole a card|traded with|discarded/.test(line)) {
      note(line);
    } else if (/built a (road|settlement|city)/.test(line)) {
      sfx.build();
    }
  }
  if (next.phase === 'over' && prev.phase !== 'over') sfx.win();
  const myTurnStarts = next.phase === 'play' && next.current === viewer && isHuman(viewer) &&
    !next.turn.rolled && (prev.current !== next.current || prev.phase !== 'play');
  if (myTurnStarts) { sfx.turn(); if (humanCount() === 1) banner('Your turn!', 'turn'); }
  if (handSize(next.players[viewer].hand) > DISCARD_LIMIT && handSize(prev.players[viewer].hand) <= DISCARD_LIMIT) sfx.warn();
}

// Two big dice tumble in the middle of the board.
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const die = (n) => `<div class="die">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i + 1) ? 'on' : ''}"></i>`).join('')}</div>`;

function rollDice([a, b]) {
  const box = $('dicepop');
  box.innerHTML = `${die(a)}${die(b)}<span class="sum">${a + b}</span>`;
  box.className = 'dicepop';
  void box.offsetWidth; // restart the animation
  box.className = 'dicepop show';
  sfx.dice();
  clearTimeout(box._t);
  box._t = setTimeout(() => { box.className = 'dicepop'; }, 1700 * Math.max(SPEED, 0.4));
}

// Cards fly from each producing tile to the player who gets them.
function flyProduction(prev, next, sum) {
  if (!S) return;
  const svg = $('board');
  const gained = next.players.map((p) => Object.fromEntries(RESOURCES.map((r) => [r, p.hand[r] - prev.players[p.id].hand[r]])));
  let delay = 0;
  let mine = false;
  for (const h of next.board.hexes) {
    if (h.number !== sum || h.id === next.bandit) continue;
    const c = hexCentre(h.id);
    const from = toScreen(svg, c.x, c.y);
    for (const corner of HEX_CORNERS[h.id]) {
      const b = next.buildings[corner];
      if (!b) continue;
      const n = Math.min(b.type === 'city' ? 2 : 1, gained[b.player][h.resource]);
      for (let i = 0; i < n; i++) {
        gained[b.player][h.resource]--;
        if (b.player === viewer) mine = true;
        flyCard(h.resource, from, targetFor(b.player, h.resource), delay);
        delay += 110;
      }
    }
  }
  if (mine) setTimeout(() => sfx.coin(), 650);
  setTimeout(() => showHandChanges(prev, next), (750 + delay) * Math.max(SPEED, 0.3));
}

// Where a player's cards go on screen: your hand slot, or their chip.
function targetFor(p, r) {
  const el = p === viewer && !cover ? document.querySelector(`.res[data-res="${r}"]`) : document.querySelector(`[data-chip="${p}"]`);
  const rect = el.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function flyCard(r, from, to, delay) {
  const el = document.createElement('div');
  el.className = 'fly';
  el.innerHTML = `<span class="card" style="--rc:${RESOURCE_COLOUR[r]}">${icon(r)}</span>`;
  el.style.transform = `translate(${from.x - 15}px, ${from.y - 19}px) scale(1.4)`;
  document.body.append(el);
  setTimeout(() => {
    el.style.transform = `translate(${to.x - 15}px, ${to.y - 19}px) scale(.8)`;
    el.style.opacity = '0.3';
  }, 30 + delay * SPEED);
  setTimeout(() => el.remove(), 950 + delay * SPEED);
}

// "+2" / "-1" bubbles on the players whose cards changed.
function showHandChanges(prev, next) {
  if (!S) return;
  for (const p of next.players) {
    const diff = handSize(p.hand) - handSize(prev.players[p.id].hand);
    if (!diff) continue;
    const chip = document.querySelector(`[data-chip="${p.id}"]`);
    if (!chip) continue;
    const r = chip.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = `delta ${diff > 0 ? 'up' : 'down'}`;
    el.textContent = diff > 0 ? `+${diff}` : `${diff}`;
    el.style.left = `${r.x + r.width - 20}px`;
    el.style.top = `${r.y + r.height - 8}px`;
    document.body.append(el);
    setTimeout(() => el.remove(), 1500);
    if (p.id === viewer && !cover) {
      for (const res of RESOURCES) {
        if (p.hand[res] > prev.players[p.id].hand[res]) document.querySelector(`.res[data-res="${res}"]`)?.classList.add('bump');
      }
    }
  }
}

// ---- Drawing ----

const icon = (r) => `<svg class="ico" viewBox="-24 -18 48 36"><use href="#i-${r}" x="-24" y="-18" width="48" height="36"/></svg>`;
const chips = (cards) => Object.entries(cards).filter(([, n]) => n > 0)
  .map(([r, n]) => `<span class="mini" style="--rc:${RESOURCE_COLOUR[r]}">${icon(r)}<b>${n}</b></span>`).join('') || '—';
const costDots = (cost) => `<span class="cost">${Object.entries(cost)
  .flatMap(([r, n]) => Array(n).fill(`<i style="background:${RESOURCE_COLOUR[r]}"></i>`)).join('')}</span>`;
const ROAD_ICON = '<svg class="si" viewBox="0 0 12 12"><path d="M3 11 L5 1 M9 11 L7 1" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 2v1.5M6 5.5V7M6 9.5V11" stroke="currentColor" stroke-width="1"/></svg>';
const SWORD_ICON = '<svg class="si" viewBox="0 0 12 12"><path d="M10.5 1.5 4 8M2.5 6.5l3 3M2 10l1.5-1.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';

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
  $('undo').hidden = !undoStack.length || !!cover || S.phase === 'over';
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
    const cards = handSize(p.hand);
    const cls = [p.id === S.current ? 'current' : '', p.id === viewer && humanCount() > 1 ? 'viewer' : ''].join(' ');
    const army = S.largestArmy.player === p.id ? 'hold' : '';
    const road = S.longestRoad.player === p.id ? 'hold' : '';
    return `<div class="chip ${cls}" data-chip="${p.id}" style="--c:${PLAYER_COLOURS[p.id]}">
      <div class="chip-name"><span class="dot"></span>${esc(p.name)}</div>
      <div class="chip-stats"><b>${pts}</b><span class="lbl">pts</span>
        <span class="stat-cards ${cards > DISCARD_LIMIT ? 'danger' : ''}" title="Resource cards">${cards}</span>
        <span class="stat-bonus" title="Bonus cards">${p.cards.length}</span></div>
      <div class="chip-extra">
        <span class="${army}" title="Soldiers played">${SWORD_ICON}${p.soldiers}</span>
        <span class="${road}" title="Longest road">${ROAD_ICON}${longestRoadFor(S, p.id)}</span></div>
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
  if (S.trade) return S.trade.from === me ? 'Waiting for answers (timer paused)' : `${S.players[S.trade.from].name} wants to trade`;
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
  $('dice').innerHTML = d && S.phase === 'play' ? `${die(d[0])}${die(d[1])}<span class="dsum">${d[0] + d[1]}</span>` : '';
  $('status').style.setProperty('--c', PLAYER_COLOURS[S.current]);
}

function renderDock(legal) {
  const pl = S.players[viewer];
  const hidden = !!cover;
  const size = handSize(pl.hand);
  const danger = !hidden && size > DISCARD_LIMIT;
  const handEl = $('hand');
  handEl.classList.toggle('danger', danger);
  $('warn').hidden = !danger;
  $('warn').textContent = danger ? `⚠️ ${size} cards: a 7 would cost you ${Math.floor(size / 2)}` : '';
  handEl.innerHTML = hidden ? '' : RESOURCES.map((r) => {
    const n = pl.hand[r];
    const layers = Math.max(1, Math.min(n, 4));
    return `<button class="res ${n ? '' : 'empty'}" data-act="hand-card" data-res="${r}" style="--rc:${RESOURCE_COLOUR[r]}">
      <span class="stack">${Array.from({ length: layers }, (_, i) => `<span class="card" style="--i:${i}">${icon(r)}</span>`).join('')}</span>
      <b class="count">${n}</b><small>${NAMES[r]}</small></button>`;
  }).join('');
  const has = (t) => legal.some((a) => a.type === t);
  const btn = (act, label, enabled, extra = '', cls = '') =>
    `<button data-act="${act}" class="act ${cls} ${mode === act || userSheet === act ? 'on' : ''}" ${enabled ? '' : 'disabled'}>${label}${extra}</button>`;
  const free = S.turn.freeRoads > 0;
  $('actions').innerHTML = [
    btn('road', 'Road', has('buildRoad') && !free, costDots(COSTS.road)),
    btn('settlement', 'House', has('buildSettlement'), costDots(COSTS.settlement)),
    btn('city', 'City', has('buildCity'), costDots(COSTS.city)),
    btn('buy', 'Card', has('buyCard'), costDots(COSTS.card)),
    btn('trade', 'Trade', canTradeNow()),
    btn('cards', `Cards <span class="count">${pl.cards.length}</span>`, !hidden && pl.cards.length > 0),
    has('roll') ? btn('roll', 'Roll', true, '', 'primary') : btn('end', 'End turn', has('endTurn'), '', 'primary'),
  ].join('');
}

// ---- Panels (they sit above your hand, so your cards stay visible) ----

function renderSheet(legal) {
  const sheet = $('sheet');
  const kind = autoSheet() ?? (cover ? null : userSheet);
  sheet.classList.toggle('open', !!kind);
  if (!kind) { sheet.innerHTML = ''; return; }
  const close = ['trade', 'cards', 'leave'].includes(kind) ? '<button class="close" data-act="close" aria-label="Close">✕</button>' : '';
  const body = {
    discard: discardSheet, steal: stealSheet, offer: offerSheet, myOffer: myOfferSheet,
    trade: tradeSheet, cards: cardsSheet, leave: leaveSheet, counter: counterSheet,
  }[kind](legal);
  sheet.innerHTML = `<div class="sheet-inner">${close}${body}</div>`;
}

function autoSheet() {
  if (cover || S.phase === 'over') return null;
  if (S.pending?.type === 'discard' && S.pending.counts[viewer] && isHuman(viewer)) return 'discard';
  if (S.pending?.type === 'steal' && S.current === viewer) return 'steal';
  const t = S.trade;
  if (t && countering !== null && t.responses[countering] === null) return 'counter';
  if (t) {
    if (t.from === viewer) return 'myOffer';
    const askable = Object.entries(t.responses).some(([p, r]) => isHuman(Number(p)) && r === null && hasCards(S.players[p].hand, t.get));
    if (!isHuman(t.from) && askable) return 'offer';
  }
  return null;
}

function discardSheet() {
  const need = S.pending.counts[viewer];
  const hand = S.players[viewer].hand;
  const picked = total(discardPick);
  return `<h3>Discard ${need} cards</h3><p class="sub">You have more than 7 cards and a 7 was rolled.</p>
    <div class="steppers">${RESOURCES.filter((r) => hand[r] > 0).map((r) => stepper(r, discardPick[r] ?? 0, hand[r])).join('')}</div>
    <button class="primary wide" data-act="discard" ${picked === need ? '' : 'disabled'}>Discard ${picked} / ${need}</button>`;
}

function stepper(r, value, max) {
  return `<div class="stepper" style="--rc:${RESOURCE_COLOUR[r]}">
    <span class="ic">${icon(r)}<small class="have">have ${max}</small></span><span class="nm">${NAMES[r]}</span>
    <button data-act="discard-pick" data-res="${r}" data-delta="-1" ${value ? '' : 'disabled'}>−</button>
    <b>${value}</b>
    <button data-act="discard-pick" data-res="${r}" data-delta="1" ${value >= max ? 'disabled' : ''}>+</button>
  </div>`;
}

function stealSheet() {
  return `<h3>Steal a card from…</h3><div class="list">${S.pending.victims.map((v) => `
    <button class="row-btn" data-act="steal" data-victim="${v}" style="--c:${PLAYER_COLOURS[v]}">
      <span class="dot"></span>${esc(S.players[v].name)}<small>${handSize(S.players[v].hand)} cards</small></button>`).join('')}</div>`;
}

// A bot offers a trade; only humans who could accept are asked.
function offerSheet() {
  const t = S.trade;
  const from = S.players[t.from];
  const rows = Object.entries(t.responses).filter(([p]) => isHuman(Number(p)) && hasCards(S.players[p].hand, t.get)).map(([p, r]) => {
    const id = Number(p);
    const answer = r === null
      ? `<button data-act="respond" data-player="${id}" data-accept="0">No</button>
         <button data-act="counter" data-player="${id}">Counter</button>
         <button class="primary" data-act="respond" data-player="${id}" data-accept="1">Accept</button>`
      : `<span class="answer ${r}">${r === 'accept' ? 'Accepted' : 'Declined'}</span>`;
    return `<div class="resp" style="--c:${PLAYER_COLOURS[id]}"><span class="dot"></span>${esc(S.players[id].name)}<span class="grow"></span>${answer}</div>`;
  }).join('');
  return `<h3>${esc(from.name)} offers a trade</h3>
    <div class="deal"><div><small>You get</small>${chips(t.give)}</div><div class="arrow">⇄</div><div><small>You give</small>${chips(t.get)}</div></div>
    ${rows}`;
}

// Your own open offer: see answers and counter-offers, pick one or cancel.
function myOfferSheet() {
  const t = S.trade;
  const rows = Object.entries(t.responses).map(([p, r]) => {
    const id = Number(p);
    let right;
    if (r === 'accept') right = `<button class="primary" data-act="confirm" data-with="${id}">Trade</button>`;
    else if (r === 'counter') {
      const deal = dealWith(t, id);
      right = `<span class="counter">gives ${chips(deal.get)} for ${chips(deal.give)}</span>
        <button class="primary" data-act="confirm" data-with="${id}">OK</button>`;
    } else if (r === 'decline') right = '<span class="answer decline">No thanks</span>';
    else if (isHuman(id)) {
      const can = hasCards(S.players[id].hand, t.get);
      right = `<button data-act="respond" data-player="${id}" data-accept="0">No</button>
        <button data-act="counter" data-player="${id}">Counter</button>
        ${can ? `<button data-act="respond" data-player="${id}" data-accept="1">Yes</button>` : ''}`;
    } else right = '<span class="answer wait">Thinking…</span>';
    return `<div class="resp" style="--c:${PLAYER_COLOURS[id]}"><span class="dot"></span>${esc(S.players[id].name)}<span class="grow"></span>${right}</div>`;
  }).join('');
  return `<h3>Your offer</h3>
    <div class="deal"><div><small>You give</small>${chips(t.give)}</div><div class="arrow">⇄</div><div><small>You get</small>${chips(t.get)}</div></div>
    ${rows}
    <button class="wide" data-act="cancel-offer">Cancel offer</button>`;
}

// Colonist-style: pick cards to give (tap your hand or the tiles) and to
// get, then trade with the bank (if the numbers match) or offer to players.
// One resource tile in a trade builder (tap to add, − to remove).
function tradeTile(side, r, who, showRatio) {
  const n = draft[side][r] ?? 0;
  const full = side === 'give' && n >= S.players[who].hand[r];
  return `<div class="ttile ${n ? 'on' : ''}" style="--rc:${RESOURCE_COLOUR[r]}">
    <button class="tadd" data-act="tt" data-side="${side}" data-res="${r}" data-delta="1" ${full ? 'disabled' : ''}>
      ${icon(r)}${showRatio && side === 'give' ? `<small>${tradeRatio(S, who, r)}:1</small>` : ''}</button>
    ${n ? `<b>${n}</b><button class="tminus" data-act="tt" data-side="${side}" data-res="${r}" data-delta="-1" aria-label="Remove one">−</button>` : ''}
  </div>`;
}

// Your counter-offer to someone else's trade.
function counterSheet() {
  const t = S.trade;
  const who = countering;
  const ok = total(clean(draft.give)) > 0 && total(clean(draft.get)) > 0;
  return `<h3>Counter-offer to ${esc(S.players[t.from].name)}</h3>
    <p class="sub">${humanCount() > 1 ? `${esc(S.players[who].name)}: ` : ''}change the deal, then send it back.</p>
    <div class="trow"><span class="tl">Give</span>${RESOURCES.map((r) => tradeTile('give', r, who, false)).join('')}</div>
    <div class="trow"><span class="tl">Get</span>${RESOURCES.map((r) => tradeTile('get', r, who, false)).join('')}</div>
    <div class="tbtns" style="margin-top:14px">
      <button data-act="counter-back">Back</button>
      <button class="primary" data-act="send-counter" ${ok ? '' : 'disabled'}>Send counter</button>
    </div>`;
}

function tradeSheet() {
  const give = clean(draft.give), get = clean(draft.get);
  const tile = (side, r) => tradeTile(side, r, viewer, true);
  const bankErr = bankTradeError(S, viewer, give, get);
  const canOffer = total(give) > 0 && total(get) > 0;
  let hint = 'Tap your cards (or the tiles) to choose what to give, then what you want.';
  if (total(give) && !total(get)) hint = 'Now choose what you want.';
  else if (total(give) && total(get)) hint = bankErr ? `Bank: ${bankErr}` : 'The bank will take this deal.';
  return `<h3>Trade</h3>
    <div class="trow"><span class="tl">Give</span>${RESOURCES.map((r) => tile('give', r)).join('')}</div>
    <div class="trow"><span class="tl">Get</span>${RESOURCES.map((r) => tile('get', r)).join('')}</div>
    <p class="sub hint-line ${total(give) && total(get) && !bankErr ? 'ok' : ''}">${esc(hint)}</p>
    <div class="tbtns">
      <button data-act="bank-trade" ${bankErr ? 'disabled' : ''}>🏦 Bank</button>
      <button class="primary" data-act="offer" ${canOffer ? '' : 'disabled'}>Offer to players</button>
    </div>`;
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
