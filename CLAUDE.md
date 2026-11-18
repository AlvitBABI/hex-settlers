# Hex Settlers

An offline-first hex-board strategy game (resource trading and building, in the style of classic settlement games) that runs as a PWA on an iPhone. Modes: play vs bots, and pass-and-play on one device.

## Hard rules
- Vanilla HTML/CSS/JS with ES modules. No frameworks, no build tools, no new dependencies without asking first.
- All paths are RELATIVE (the site is served from /hex-settlers/ on GitHub Pages). Never use paths starting with "/".
- Do not use the trademarked game's name, logo, card art or official terminology in the UI or code. Use our own names and our own simple artwork.
- Our names: resources Wood, Clay, Sheep, Wheat, Ore (chosen by the user); "Bandit"; "Bonus cards" (Soldier, Victory Point, Road Crew, Harvest, Monopoly); "Longest Route" and "Strongest Army" bonuses.
- Never commit secrets. Do not read or write .env files.

## Architecture (most important rule)
- `engine/` holds the game rules as pure JavaScript with NO DOM, NO browser APIs, NO UI code.
  - Game state is a plain JSON-serialisable object.
  - `applyAction(state, action)` returns `{ ok: true, state }` or `{ ok: false, error }`. It never mutates its input.
  - `legalActions(state)` lists every action the current player may take.
  - Randomness goes through a seeded random-number generator passed in via the state, so games are reproducible and testable.
- `ui/` renders state (SVG for the board) and sends actions to the engine. It contains no game rules.
- `bots/` pick one action from `legalActions(state)` (or a free-form discard/trade offer the engine then checks). Bots never bypass the engine. `timeoutAction` is what the turn timer does for a human whose time runs out.
- Engine modules: `game.js` (front door: createGame, applyAction, legalActions, waitingFor), `turn.js` (setup, dice, building), `bandit.js`, `trade.js`, `cards.js`, `scoring.js`, `topology.js`, `board.js`, `knowledge.js` (what each player has seen of others' cards; all card moves go through `transfer()`).
- Game options (`createGame({ options })`): numbers `spiral`|`random`, dice `random`|`balanced`, mode `classic`|`rush`. Rush = real time, no turns, dice on a clock; use helpers like `isRush`, `needsRoll`, `freeRoadsOf` instead of assuming a current player.
- Bots must not read other players' hands: use `knownHand` from `knowledge.js`.
- UI modules: `main.js` (start), `menu.js`, `game-screen.js` (screen state, bots loop, timer, animations, undo), `sound.js`, `board-view.js` + `pieces-view.js` (SVG), `pan-zoom.js`, `art.js`, `storage.js` (save/continue).
- Pass-and-play and bot games use the exact same engine.

## Offline / PWA
- `sw.js` caches every file listed in FILES. When adding a new file, add it to FILES.
- When ANY cached file changes, bump the CACHE version string in sw.js (e.g. hex-settlers-v2), or phones keep the old version.

## Testing
- Rules tests live in `tests/` and run with: `node --test` (includes full bot-only games).
- In the browser, add `?fast` to the address to make bots move almost instantly. The service worker is skipped on localhost.
- Add tests for every new rule before or with the code. Do not change a test to make it pass without explaining why.

## Working style
- One small milestone at a time. Explain what changed in plain language.
- Commit small and often, in logical steps. The user allows pushing to GitHub (main) without asking.
- Ask before making changes outside the current milestone.

## Milestones
0. Installable offline shell (DONE)
1. Board: random hex board, numbers, ports, pinch/scroll on phone (DONE)
2. Setup + turn loop: starting pieces, dice, resources, build roads/settlements/cities with legal-move checks (DONE)
3. Bandit: a 7 forces discards, bandit moves, stealing (DONE)
4. Trading: bank and port trades, then player-to-player (DONE)
5. Bonus cards, Longest Route, Strongest Army, win at 10 points (DONE)
6. Pass-and-play: "pass the phone" cover hides cards between players (DONE)
7. Bots: goal-based heuristic with colonist-style trading; menu with up to 4 seats; turn timer (DONE)
8. Polish: undo, sounds, smarter bots, trade counter-offers, animations, save/continue (DONE)
9. Feedback round 2: bots only use seen cards, human counter-offers, spiral/random boards, balanced dice, Rush mode (DONE)
10. Ideas next: game statistics, bot speed setting, Rush 'vote to roll' with several humans on separate devices
