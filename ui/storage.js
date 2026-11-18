// Saves the game on this phone so it can be continued later.
// Wrapped in try/catch: storage can be unavailable (e.g. private mode).
const KEY = 'hex-settlers-save';

export function saveGame(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* not critical */ }
}
export function loadGame() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* not critical */ }
}
