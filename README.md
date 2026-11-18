# Hex Settlers

An offline hex-board strategy game for iPhone, built as an installable web app (PWA).

## How to play
- Modes: **Classic** (take turns) or **⚡ Rush** (real time against bots: no turns, everyone builds and trades at once, the dice roll every 8/12/20 seconds; tap Roll now to go faster).
- Options: board numbers **Spiral** (standard A-R spiral) or **Random** (6 and 8 never touch); dice **Random** or **Balanced** (drawn from a deck of all 36 results).
- In the menu, seat 1 is you. Seats 2-4 can be a human (sharing the phone), a bot, or off (2-4 players).
- Pick a turn timer. When it runs out, the game plays for you: it rolls, discards, moves the bandit and ends your turn.
- Setup: each player places a house and a road, then again in reverse order. Your second house gives you its resources.
- On your turn: roll, then build (costs are the coloured dots on each button), trade, or play a bonus card. First to 10 points wins.
- A 7 moves the bandit: anyone with more than 7 cards discards half, and the roller steals a card.
- Trade: tap a card in your hand to start a trade, add what you want, then press Bank (if it matches your 4:1 / 3:1 / 2:1 rates) or Offer to players. Bots may accept, decline or counter-offer, and you can counter their offers too. Bots only know cards they have seen change hands.
- Your timer pauses while your offer waits for answers. ↶ Undo takes back a build or bank trade.
- Pinch to zoom, drag to move, ⤢ to fit the board, 🔊 for sound. ☰ leaves the game; it is saved and can be continued.

## Run locally
Open the folder in VS Code and use the Live Server extension on `index.html`.

## Tests
```
node --test
```
Add `?fast` to the address in the browser to make bots move almost instantly (for testing).

## Live site
https://alvitbabi.github.io/hex-settlers/

## Install on iPhone
Open the live site in Safari, tap Share, then Add to Home Screen.

## Updating
Edit, commit and push to `main`. If any cached file changed, bump the `CACHE` version in `sw.js` first so phones fetch the update.
