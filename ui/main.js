// Wires the screen to the engine. No game rules in here.
import { createRng } from '../engine/rng.js';
import { generateBoard } from '../engine/board.js';
import { renderBoard } from './board-view.js';
import { enablePanZoom } from './pan-zoom.js';

const svg = document.getElementById('board');
const seedLabel = document.getElementById('seed');
let panZoom = null;

// A short random code, e.g. "k3f9qz". The board for a code is always the same.
const randomSeed = () => Math.random().toString(36).slice(2, 8);

function show(seed) {
  const { board } = generateBoard(createRng(seed));
  const bounds = renderBoard(svg, board);
  seedLabel.textContent = `Board ${seed}`;
  // Put the seed in the address so a board can be reopened (relative URL).
  history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}`);
  if (panZoom) panZoom.setBounds(bounds);
  else panZoom = enablePanZoom(svg, bounds);
}

document.getElementById('new-board').addEventListener('click', () => show(randomSeed()));
document.getElementById('fit').addEventListener('click', () => panZoom.fit());

show(new URLSearchParams(location.search).get('seed') || randomSeed());

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
