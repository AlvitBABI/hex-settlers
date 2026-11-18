// Little sound effects made on the fly with the Web Audio API (no files).
// iPhones only allow sound after a tap, so unlock() runs on the first touch.
const KEY = 'hex-settlers-sound';
let ctx = null;
let on = true;
try { on = localStorage.getItem(KEY) !== 'off'; } catch { /* default on */ }

export const soundOn = () => on;
export function toggleSound() {
  on = !on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* not critical */ }
  return on;
}

function unlock() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}
document.addEventListener('pointerdown', unlock, { passive: true });

function tone(freq, dur, { type = 'sine', vol = 0.15, at = 0, slide = 0 } = {}) {
  if (!on || !ctx) return;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// A short burst of soft, muffled noise (lowpass-filtered).
function noise(dur, vol, at = 0, cutoff = 1800) {
  if (!on || !ctx) return;
  const t = ctx.currentTime + at;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  gain.gain.value = vol;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t);
}

export const sfx = {
  dice() { [0, 0.11, 0.2, 0.33].forEach((at, i) => noise(0.035, 0.05 - i * 0.008, at, 1400)); },
  coin() { tone(880, 0.08, { vol: 0.1 }); tone(1320, 0.14, { at: 0.06, vol: 0.1 }); },
  build() { tone(160, 0.14, { type: 'triangle', vol: 0.3 }); tone(240, 0.12, { at: 0.06, type: 'triangle', vol: 0.2 }); },
  trade() { tone(660, 0.1); tone(990, 0.16, { at: 0.08 }); },
  bandit() { tone(150, 0.5, { type: 'sawtooth', vol: 0.1, slide: -70 }); },
  soldier() { [392, 523, 659].forEach((f, i) => tone(f, i === 2 ? 0.3 : 0.12, { at: i * 0.12, type: 'square', vol: 0.07 })); },
  turn() { tone(523, 0.12); tone(784, 0.2, { at: 0.11 }); },
  tick() { tone(1100, 0.04, { vol: 0.07 }); },
  warn() { tone(330, 0.12, { type: 'square', vol: 0.06 }); tone(330, 0.12, { at: 0.18, type: 'square', vol: 0.06 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { at: i * 0.15, type: 'triangle', vol: 0.2 })); },
};
