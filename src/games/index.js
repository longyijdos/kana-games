const dice = require('./liars-dice');
const gomoku = require('./gomoku');

module.exports = Object.fromEntries([dice, gomoku].map(game => [game.id, game]));
