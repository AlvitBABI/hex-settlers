// App start: show the menu, start or continue a game.
import { createGame } from '../engine/game.js';
import { showMenu } from './menu.js';
import { startGame } from './game-screen.js';
import { loadGame } from './storage.js';

const menu = document.getElementById('menu');
const game = document.getElementById('game');

function openMenu() {
  game.hidden = true;
  menu.hidden = false;
  const saved = loadGame();
  showMenu({
    saved: saved && saved.state?.phase !== 'over' ? saved : null,
    onStart(config) {
      const state = createGame({ seed: config.seed, players: config.players, options: config.options });
      openGame(config, state);
    },
    onContinue() { openGame(saved.config, saved.state); },
  });
}

function openGame(config, state) {
  menu.hidden = true;
  game.hidden = false;
  startGame({ config, state, onExit: openMenu });
}

openMenu();

// Offline cache. Skipped on the local test server so edits show up at once.
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
