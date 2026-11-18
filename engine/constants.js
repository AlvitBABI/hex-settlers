// Our own names for the five resources. "desert" produces nothing.
export const RESOURCES = ['wood', 'clay', 'sheep', 'wheat', 'ore'];

export const BOARD_RADIUS = 2; // 1 + 6 + 12 = 19 hexes

// How many of each tile go on the board (19 in total).
export const TILE_COUNTS = {
  wood: 4, clay: 3, sheep: 4, wheat: 4, ore: 3, desert: 1,
};

// One token per non-desert tile. No 7: rolling a 7 does something else.
export const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

// The most likely rolls. Two of these must never touch.
export const RED_NUMBERS = [6, 8];

// 4 ports trade any resource 3:1, plus one 2:1 port for each resource.
export const PORT_TYPES = ['any', 'any', 'any', 'any', ...RESOURCES];

// Gaps (in coastal edges) between one port and the next, going round.
// 3+3+4 three times = 30, the number of coastal edges on a radius-2 board.
export const PORT_GAPS = [3, 3, 4, 3, 3, 4, 3, 3, 4];

// What each thing costs to build or buy.
export const COSTS = {
  road: { wood: 1, clay: 1 },
  settlement: { wood: 1, clay: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  card: { sheep: 1, wheat: 1, ore: 1 },
};

// Pieces each player starts with.
export const PIECES = { roads: 15, settlements: 5, cities: 4 };

export const BANK_SIZE = 19; // of each resource
export const WIN_POINTS = 10;
export const DISCARD_LIMIT = 7; // more than this when a 7 is rolled: discard half
export const LONGEST_ROUTE_MIN = 5; // roads needed for the Longest Route bonus
export const STRONGEST_ARMY_MIN = 3; // soldiers needed for the Strongest Army bonus

// Bonus card deck (25 cards).
export const CARD_COUNTS = { soldier: 14, point: 5, roads: 2, harvest: 2, monopoly: 2 };

// "Alphabetical spiral" order of number tokens (A to R), laid from an outer
// corner round and inward, skipping the desert.
export const SPIRAL_TOKENS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

// Game options and their defaults.
export const DEFAULT_OPTIONS = {
  numbers: 'spiral', // 'spiral' | 'random' (random: 6 and 8 never touch)
  dice: 'random',    // 'random' | 'balanced' (a shuffled deck of all 36 rolls)
  mode: 'classic',   // 'classic' | 'rush'
};
export const BALANCED_RESHUFFLE_AT = 5; // reshuffle the dice deck when this few rolls are left
