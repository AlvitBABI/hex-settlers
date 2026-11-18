// Pinch-zoom, drag and tap for an SVG, by changing its viewBox.
// We track: the SVG point at the middle of the screen (cx, cy) and
// `scale` = SVG units per screen pixel. Smaller scale = more zoomed in.
// A short touch that barely moves counts as a tap: onTap(element).

const TAP_SLOP = 10; // pixels a finger may wobble and still count as a tap

export function enablePanZoom(svg, bounds, { onTap = () => {} } = {}) {
  const view = { cx: 0, cy: 0, scale: 1 };
  const pointers = new Map(); // pointerId -> {x, y} in screen pixels
  let fitScale = 1;
  let tap = null; // { id, x, y } while a possible tap is in progress

  const rect = () => svg.getBoundingClientRect();
  const clampScale = (s) => Math.min(fitScale, Math.max(fitScale / 5, s));

  function apply() {
    const { width, height } = rect();
    view.scale = clampScale(view.scale);
    // Keep the middle of the screen over the board.
    view.cx = Math.min(bounds.x + bounds.width, Math.max(bounds.x, view.cx));
    view.cy = Math.min(bounds.y + bounds.height, Math.max(bounds.y, view.cy));
    const w = width * view.scale, h = height * view.scale;
    svg.setAttribute('viewBox', `${view.cx - w / 2} ${view.cy - h / 2} ${w} ${h}`);
  }

  // Screen pixel (relative to the SVG) -> SVG units, for the current view.
  function toSvg(p) {
    const { width, height } = rect();
    return {
      x: view.cx + (p.x - width / 2) * view.scale,
      y: view.cy + (p.y - height / 2) * view.scale,
    };
  }

  // Zoom by `factor` keeping SVG point `anchor` under screen point `screen`.
  function zoomAt(anchor, screen, factor) {
    const { width, height } = rect();
    view.scale = clampScale(view.scale * factor);
    view.cx = anchor.x - (screen.x - width / 2) * view.scale;
    view.cy = anchor.y - (screen.y - height / 2) * view.scale;
    apply();
  }

  function fit() {
    const { width, height } = rect();
    if (!width || !height) return;
    lastSize = `${Math.round(width)}x${Math.round(height)}`;
    fitScale = Math.max(bounds.width / width, bounds.height / height);
    view.scale = fitScale;
    view.cx = bounds.x + bounds.width / 2;
    view.cy = bounds.y + bounds.height / 2;
    apply();
  }

  const local = (e) => {
    const r = rect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const twoFinger = () => {
    const [a, b] = [...pointers.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  svg.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, local(e));
    tap = pointers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    // Keep receiving this finger's moves even if it slides off the board.
    try { svg.setPointerCapture(e.pointerId); } catch { /* not critical */ }
  });

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) tap = null;
    const before = pointers.size === 2 ? twoFinger() : null;
    const old = pointers.get(e.pointerId);
    const now = local(e);
    pointers.set(e.pointerId, now);

    if (pointers.size === 1) {
      view.cx -= (now.x - old.x) * view.scale;
      view.cy -= (now.y - old.y) * view.scale;
      apply();
    } else if (before) {
      const after = twoFinger();
      if (after.dist > 0) zoomAt(toSvg(before.mid), after.mid, before.dist / after.dist);
    }
  });

  const lift = (e) => {
    const wasTap = tap && tap.id === e.pointerId && e.type === 'pointerup';
    pointers.delete(e.pointerId);
    if (wasTap) {
      tap = null;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (target) onTap(target);
    }
  };
  svg.addEventListener('pointerup', lift);
  svg.addEventListener('pointercancel', lift);

  // Mouse wheel / trackpad, for testing on the Mac.
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    zoomAt(toSvg(p), p, Math.exp(e.deltaY * 0.002));
  }, { passive: false });

  // Stop Safari zooming the whole page instead of the board.
  for (const type of ['gesturestart', 'gesturechange']) {
    document.addEventListener(type, (e) => e.preventDefault());
  }

  // When the board area changes size (rotating the phone, or the bars
  // above/below it growing), keep the same zoom and centre instead of
  // letting the browser stretch the drawing. Stay "fitted" if we were.
  let lastSize = '';
  function checkSize() {
    const { width, height } = rect();
    const size = `${Math.round(width)}x${Math.round(height)}`;
    if (!width || !height || size === lastSize) return;
    const first = lastSize === '';
    lastSize = size;
    if (first) return;
    const wasFitted = Math.abs(view.scale - fitScale) < 1e-9;
    fitScale = Math.max(bounds.width / width, bounds.height / height);
    if (wasFitted) view.scale = fitScale;
    apply();
  }
  // Watch the box around the board (an <svg> reports its drawing, not its box).
  new ResizeObserver(checkSize).observe(svg.parentElement);
  fit();

  return {
    fit,
    checkSize, // call after the screen redraws, in case the board area changed size
    setBounds(b) { bounds = b; fit(); },
    setOnTap(fn) { onTap = fn; },
  };
}
