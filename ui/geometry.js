// Where things go on screen, in SVG units. Shared by all drawing code.
import { parseHexId } from '../engine/hex.js';

export const SIZE = 50; // hex radius
export const SVG_NS = 'http://www.w3.org/2000/svg';

// Centre of hex (q, r), pointy-top layout.
export function centre(q, r) {
  return { x: SIZE * Math.sqrt(3) * (q + r / 2), y: SIZE * 1.5 * r };
}

export function hexCentre(id) {
  const { q, r } = parseHexId(id);
  return centre(q, r);
}

// Corner and edge ids are lists of hex ids ("0,0|1,0|1,-1"); the point
// is the average of those hex centres.
export function pointFromId(id) {
  const pts = id.split('|').map(hexCentre);
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

export function hexPoints(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + size * Math.cos(a)).toFixed(2)},${(cy + size * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

// Create an SVG element with attributes (and optional text).
export function el(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}
