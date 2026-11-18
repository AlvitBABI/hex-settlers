// Pinch-zoom and drag for an SVG, by changing its viewBox.
// We track: the SVG point at the middle of the screen (cx, cy) and
// `scale` = SVG units per screen pixel. Smaller scale = more zoomed in.

export function enablePanZoom(svg, bounds) {
  const view = { cx: 0, cy: 0, scale: 1 };
  const pointers = new Map(); // pointerId -> {x, y} in screen pixels
  let fitScale = 1;

  const rect = () => svg.getBoundingClientRect();

  function apply() {
    const { width, height } = rect();
    // Never zoom out past "whole board fits", never in past 5x.
    view.scale = Math.min(fitScale, Math.max(fitScale / 5, view.scale));
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
    view.scale *= factor;
    view.scale = Math.min(fitScale, Math.max(fitScale / 5, view.scale));
    view.cx = anchor.x - (screen.x - width / 2) * view.scale;
    view.cy = anchor.y - (screen.y - height / 2) * view.scale;
    apply();
  }

  function fit() {
    const { width, height } = rect();
    if (!width || !height) return;
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
    // Keep receiving this finger's moves even if it slides off the board.
    try { svg.setPointerCapture(e.pointerId); } catch { /* not critical */ }
  });

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
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

  const lift = (e) => pointers.delete(e.pointerId);
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

  window.addEventListener('resize', fit);
  fit();

  return {
    fit,
    setBounds(b) { bounds = b; fit(); },
  };
}
