// Start menu: choose who plays each seat and the turn timer.
// Seat 1 is always a human. Seats 2-4: Human, Bot or Off.
import { PLAYER_COLOURS } from './art.js';

const TIMERS = [
  { label: 'Off', seconds: 0 },
  { label: '30s', seconds: 30 },
  { label: '60s', seconds: 60 },
  { label: '90s', seconds: 90 },
  { label: '120s', seconds: 120 },
];

const seats = [
  { kind: 'human', name: 'Player 1' },
  { kind: 'bot', name: 'Player 2' },
  { kind: 'bot', name: 'Player 3' },
  { kind: 'bot', name: 'Player 4' },
];
let timer = 60;
const options = { numbers: 'spiral', dice: 'random' };

// Two-or-more-choice settings shown as segmented buttons.
const SETTINGS = [
  { key: 'numbers', title: 'Board numbers', choices: [['spiral', 'Spiral'], ['random', 'Random']],
    hint: { spiral: 'Standard: numbers laid A to R in a spiral from a random corner.', random: 'Fully random, but 6 and 8 never touch.' } },
  { key: 'dice', title: 'Dice', choices: [['random', 'Random'], ['balanced', 'Balanced']],
    hint: { random: 'Every roll is a fair, independent throw.', balanced: 'Rolls come from a shuffled deck of all 36 results, so numbers appear close to their odds.' } },
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Turn the seats into a player list (bots get bot names; Off seats skipped).
function playersFromSeats() {
  let bot = 0;
  return seats.filter((s) => s.kind !== 'off').map((s) => ({
    kind: s.kind,
    name: s.kind === 'bot' ? `Bot ${++bot}` : (s.name.trim() || 'Player').slice(0, 14),
  }));
}

export function showMenu({ saved, onStart, onContinue }) {
  const root = document.getElementById('menu');

  function draw() {
    const players = playersFromSeats();
    root.innerHTML = `
      <div class="menu-card">
        <svg class="logo" viewBox="-60 -52 120 104" aria-hidden="true">
          <polygon points="0,-50 43,-25 43,25 0,50 -43,25 -43,-25" fill="url(#logo-g)" stroke="#fff8e6" stroke-width="4"/>
          <defs><linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ffe17a"/><stop offset="1" stop-color="#e0a92c"/></linearGradient></defs>
          <polygon points="-16,14 -16,-2 0,-16 16,-2 16,14" fill="#e5484d" stroke="#fff" stroke-width="3"/>
        </svg>
        <h1>Hex Settlers</h1>
        <p class="tag">Gather, trade and build your way to 10 points.</p>
        ${saved ? `<button class="primary wide" data-menu="continue">Continue saved game</button>` : ''}
        <h2>Players</h2>
        <div class="seats">
          ${seats.map((s, i) => `
            <div class="seat ${s.kind === 'off' ? 'off' : ''}" style="--c:${PLAYER_COLOURS[i]}">
              <span class="dot"></span>
              ${s.kind === 'human'
                ? `<input data-name="${i}" value="${esc(s.name)}" maxlength="14" aria-label="Name for seat ${i + 1}">`
                : `<span class="seat-label">${s.kind === 'bot' ? 'Bot' : 'Empty seat'}</span>`}
              ${i === 0 ? '<span class="you">You</span>' : `
                <div class="seg small">
                  ${['human', 'bot', 'off'].map((k) => `
                    <button data-seat="${i}" data-kind="${k}" class="${s.kind === k ? 'on' : ''}">
                      ${k === 'human' ? 'Human' : k === 'bot' ? 'Bot' : 'Off'}</button>`).join('')}
                </div>`}
            </div>`).join('')}
        </div>
        ${SETTINGS.map((set) => `
          <h2>${set.title}</h2>
          <div class="seg">${set.choices.map(([v, label]) => `<button data-opt="${set.key}" data-val="${v}" class="${options[set.key] === v ? 'on' : ''}">${label}</button>`).join('')}</div>
          <p class="hint">${set.hint[options[set.key]]}</p>`).join('')}
        <h2>Turn timer</h2>
        <div class="seg">
          ${TIMERS.map((t) => `<button data-timer="${t.seconds}" class="${timer === t.seconds ? 'on' : ''}">${t.label}</button>`).join('')}
        </div>
        <p class="hint">When time runs out the game plays for you: it rolls, discards,
          moves the bandit and ends your turn.</p>
        <button class="primary wide big" data-menu="start" ${players.length < 2 ? 'disabled' : ''}>
          Start game (${players.length} players)</button>
        <p class="hint">Humans share this phone and pass it round. Bots play by themselves.</p>
      </div>`;
  }

  root.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.seat) seats[b.dataset.seat].kind = b.dataset.kind;
    if (b.dataset.timer) timer = Number(b.dataset.timer);
    if (b.dataset.opt) options[b.dataset.opt] = b.dataset.val;
    if (b.dataset.menu === 'start') {
      onStart({ players: playersFromSeats(), turnTime: timer, options: { ...options }, seed: Math.random().toString(36).slice(2, 8) });
      return;
    }
    if (b.dataset.menu === 'continue') { onContinue(); return; }
    draw();
  };
  root.oninput = (e) => {
    if (e.target.dataset.name !== undefined) seats[e.target.dataset.name].name = e.target.value;
  };
  draw();
}
