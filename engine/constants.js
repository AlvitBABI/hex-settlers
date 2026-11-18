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
