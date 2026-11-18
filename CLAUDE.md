# Hex Settlers

An offline-first hex-board strategy game (resource trading and building, in the style of classic settlement games) that runs as a PWA on an iPhone. Modes: play vs bots, and pass-and-play on one device.

## Hard rules
- Vanilla HTML/CSS/JS with ES modules. No frameworks, no build tools, no new dependencies without asking first.
- All paths are RELATIVE (the site is served from /hex-settlers/ on GitHub Pages). Never use paths starting with "/".
- Do not use the trademarked game's name, logo, card art or official terminology in the UI or code. Use our own names and our own simple artwork.
- Never commit secrets. Do not read or write .env files.

## Architecture (most important rule)
- `engine/` holds the game rules as pure JavaScript with NO DOM, NO browser APIs, NO UI code.
  - Game state is a plain JSON-serialisable object.
  - `applyAction(state, action)` returns `{ ok: true, state }` or `{ ok: false, error }`. It never mutates its input.
  - `legalActions(state)` lists every action the current player may take.
  - Randomness goes through a seeded random-number generator passed in via the state, so games are reproducible and testable.
- `ui/` renders state (SVG for the board) and sends actions to the engine. It contains no game rules.
- `bots/` pick one action from `legalActions(state)`. Bots never bypass the engine.
- Pass-and-play and bot games use the exact same engine.

## Offline / PWA
- `sw.js` caches every file listed in FILES. When adding a new file, add it to FILES.
- When ANY cached file changes, bump the CACHE version string in sw.js (e.g. hex-settlers-v2), or phones keep the old version.

## Testing
- Rules tests live in `tests/` and run with: `node --test`
- Add tests for every new rule before or with the code. Do not change a test to make it pass without explaining why.

## Working style
- One small milestone at a time. Explain what changed in plain language.
- Commit small and often. Never push to GitHub without being asked.
- Ask before making changes outside the current milestone.

## Milestones
0. Installable offline shell (DONE)
1. Board: random hex board, numbers, ports, pinch/scroll on phone
2. Setup + turn loop: starting pieces, dice, resources, build roads/settlements/cities with legal-move checks
3. Robber: a 7 forces discards, robber moves, stealing
4. Trading: bank and port trades, then player-to-player
5. Development cards, longest road, largest army, win at 10 points
6. Pass-and-play: "hand the phone to Player 2" screen hides cards between turns
7. Bots: random legal moves first, then a scored heuristic
8. Polish: save/resume, undo, sounds, own artwork
