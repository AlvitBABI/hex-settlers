// What each player could know about everyone else's cards, from what they
// have seen happen at the table. Bots use this instead of peeking.
//
// seen[observer][player] = { known: { wood: 2, ... }, unknown: 1 }
//   known   - cards the observer saw that player receive
//   unknown - cards they hold but the observer couldn't see (e.g. steals)
// known + unknown always equals the player's real number of cards, and
// known never claims more of a resource than the player really has.
import { emptyHand, moveCards } from './helpers.js';

export const newKnowledge = (n) =>
  Array.from({ length: n }, () => Array.from({ length: n }, () => ({ known: emptyHand(), unknown: 0 })));

const size = (b) => Object.values(b).reduce((a, n) => a + n, 0);

// Older saved games have no notebook: start one from what is on the table.
function ensure(s) {
  s.seen ??= s.players.map(() => s.players.map((q) => ({ known: emptyHand(), unknown: size(q.hand) })));
}

function lose(entry, cards, visible) {
  if (visible) {
    for (const [r, n] of Object.entries(cards)) {
      const k = Math.min(entry.known[r], n);
      entry.known[r] -= k;
      entry.unknown = Math.max(0, entry.unknown - (n - k));
    }
  } else {
    // Some card we didn't see left: we can no longer be sure of any of them.
    entry.unknown = Math.max(0, size(entry.known) + entry.unknown - size(cards));
    entry.known = emptyHand();
  }
}

function gain(entry, cards, visible) {
  if (visible) for (const [r, n] of Object.entries(cards)) entry.known[r] += n;
  else entry.unknown += size(cards);
}

// Move cards between players and/or the bank ('bank'), and update what
// everyone knows. seenBy: list of players who see which cards moved
// (null = everyone, e.g. production, building, trades).
export function transfer(s, from, to, cards, seenBy = null) {
  ensure(s);
  const hand = (x) => (x === 'bank' ? s.bank : s.players[x].hand);
  moveCards(hand(from), hand(to), cards);
  for (let o = 0; o < s.players.length; o++) {
    const visible = !seenBy || seenBy.includes(o);
    if (from !== 'bank' && from !== o) lose(s.seen[o][from], cards, visible);
    if (to !== 'bank' && to !== o) gain(s.seen[o][to], cards, visible);
  }
}

// What `observer` knows about `player`'s cards. Your own hand is fully known.
export function knownHand(s, observer, player) {
  if (observer === player) return { known: { ...s.players[player].hand }, unknown: 0 };
  ensure(s);
  return s.seen[observer][player];
}
