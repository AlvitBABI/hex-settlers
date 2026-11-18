// Seeded random numbers (mulberry32).
// The whole generator state is ONE integer, so it can live inside the
// JSON game state. Every function here is pure: it takes the current
// state and returns the new state instead of changing anything.

// Turn any seed (number or text) into a starting state.
export function createRng(seed) {
  const text = String(seed);
  let h = 2166136261; // FNV-1a hash, so "abc" and 123 both work as seeds
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

// Returns { value, rng }: value is in [0, 1), rng is the next state.
export function nextFloat(rng) {
  const state = (rng + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, rng: state };
}

// Whole number from 0 to max-1. Returns { value, rng }.
export function nextInt(rng, max) {
  const r = nextFloat(rng);
  return { value: Math.floor(r.value * max), rng: r.rng };
}

// Returns { result, rng }: a shuffled COPY of items (Fisher-Yates).
export function shuffle(rng, items) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const r = nextInt(rng, i + 1);
    rng = r.rng;
    [result[i], result[r.value]] = [result[r.value], result[i]];
  }
  return { result, rng };
}
