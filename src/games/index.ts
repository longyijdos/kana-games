import dice from './liars-dice.js';
import gomoku from './gomoku.js';
import type { GameDefinition } from './types.js';

const games: Record<string, GameDefinition> = Object.fromEntries([dice, gomoku].map(game => [game.id, game]));
export default games;
