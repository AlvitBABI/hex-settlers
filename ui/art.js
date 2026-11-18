// Our own artwork: colour gradients and small icons, drawn as SVG.
// Icons are drawn in a box about 40 x 28 units centred on (0, 0).

export const NAMES = {
  wood: 'Wood', clay: 'Clay', sheep: 'Sheep', wheat: 'Wheat', ore: 'Ore', desert: 'Desert',
};

// [light, dark] for each tile's gradient.
export const TILE_COLOURS = {
  wood: ['#4caf50', '#1f6b33'],
  clay: ['#e98a4f', '#b4532a'],
  sheep: ['#c8ec8a', '#86c04f'],
  wheat: ['#ffe17a', '#e0a92c'],
  ore: ['#b4bfd0', '#6d7a90'],
  desert: ['#f4e3b5', '#d6bb7d'],
};

// A flat colour per resource for small things (cards, port badges).
export const RESOURCE_COLOUR = {
  wood: '#2e8b45', clay: '#cf6a35', sheep: '#9fd35f', wheat: '#f2c23d', ore: '#8794a8', any: '#ffffff',
};

const ICONS = {
  wood: `
    <rect x="-13" y="6" width="3" height="6" fill="#5b3a1e"/>
    <rect x="-1.5" y="3" width="3" height="9" fill="#5b3a1e"/>
    <rect x="10" y="6" width="3" height="6" fill="#5b3a1e"/>
    <polygon points="-20,8 -11.5,-10 -3,8" fill="#14512a"/>
    <polygon points="-9,5 0,-16 9,5" fill="#0f4423"/>
    <polygon points="3,8 11.5,-10 20,8" fill="#14512a"/>
    <polygon points="-6,-2 0,-16 6,-2" fill="#1d6b37"/>`,
  clay: `
    <g fill="#8e3b19" stroke="#f3c9a8" stroke-width="1.2">
      <rect x="-18" y="-10" width="17" height="8" rx="1"/>
      <rect x="1" y="-10" width="17" height="8" rx="1"/>
      <rect x="-9" y="-2" width="17" height="8" rx="1"/>
      <rect x="-18" y="6" width="17" height="8" rx="1"/>
      <rect x="1" y="6" width="17" height="8" rx="1"/>
    </g>`,
  sheep: `
    <g fill="#fff" stroke="#d9d9d9" stroke-width=".8">
      <circle cx="-8" cy="0" r="7"/><circle cx="0" cy="-4" r="8"/>
      <circle cx="8" cy="0" r="7"/><circle cx="0" cy="4" r="7"/>
    </g>
    <rect x="-7" y="7" width="2.5" height="7" fill="#333"/>
    <rect x="5" y="7" width="2.5" height="7" fill="#333"/>
    <ellipse cx="15" cy="-3" rx="5" ry="4" fill="#333"/>
    <circle cx="16.5" cy="-4" r="1" fill="#fff"/>`,
  wheat: `
    <g stroke="#8a5a12" stroke-width="1.6" fill="none">
      <path d="M-8,14 Q-9,0 -12,-12"/><path d="M0,14 L0,-15"/><path d="M8,14 Q9,0 12,-12"/>
    </g>
    <g fill="#b07812">
      <ellipse cx="-12" cy="-10" rx="2.6" ry="5" transform="rotate(-15 -12 -10)"/>
      <ellipse cx="-10.5" cy="-3" rx="2.6" ry="5" transform="rotate(-15 -10.5 -3)"/>
      <ellipse cx="0" cy="-13" rx="2.6" ry="5"/><ellipse cx="0" cy="-5" rx="2.6" ry="5"/>
      <ellipse cx="12" cy="-10" rx="2.6" ry="5" transform="rotate(15 12 -10)"/>
      <ellipse cx="10.5" cy="-3" rx="2.6" ry="5" transform="rotate(15 10.5 -3)"/>
    </g>`,
  ore: `
    <polygon points="-22,12 -8,-12 6,12" fill="#4f5a6d"/>
    <polygon points="-4,12 9,-16 22,12" fill="#3d4657"/>
    <polygon points="-12,-5 -8,-12 -4,-5 -8,-3" fill="#fff"/>
    <polygon points="4,-6 9,-16 14,-6 9,-3" fill="#fff"/>`,
  desert: `
    <circle cx="11" cy="-9" r="5" fill="#ffb84d"/>
    <path d="M-22,12 Q-10,0 2,12 Z" fill="#c9a35c"/>
    <path d="M-4,12 Q8,2 22,12 Z" fill="#b8914b"/>
    <g fill="#4d8b3f"><rect x="-11" y="-12" width="5" height="22" rx="2.5"/>
    <rect x="-17" y="-5" width="4" height="9" rx="2"/><rect x="-6" y="-8" width="4" height="8" rx="2"/></g>`,
  any: `<text x="0" y="1" text-anchor="middle" dominant-baseline="middle" font-size="22" font-weight="800" fill="#1e3a5f">?</text>`,
};

// The <defs> block: gradients, sea pattern and icon symbols.
export function defsMarkup() {
  const grads = Object.entries(TILE_COLOURS).map(([k, [a, b]]) => `
    <radialGradient id="g-${k}" cx="45%" cy="35%" r="75%">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
    </radialGradient>`).join('');
  const icons = Object.entries(ICONS).map(([k, body]) =>
    `<symbol id="i-${k}" viewBox="-24 -18 48 36" overflow="visible">${body}</symbol>`).join('');
  return `
    ${grads}
    <linearGradient id="g-sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3d8fd1"/><stop offset="1" stop-color="#1f5a8f"/>
    </linearGradient>
    <pattern id="p-waves" width="60" height="30" patternUnits="userSpaceOnUse">
      <path d="M0,15 q7.5,-7 15,0 t15,0" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="2"/>
      <path d="M30,30 q7.5,-7 15,0 t15,0" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="2"/>
    </pattern>
    <filter id="f-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity=".35"/>
    </filter>
    ${icons}`;
}
