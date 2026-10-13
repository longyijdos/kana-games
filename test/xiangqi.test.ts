import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/runtime.js';
import xiangqi, { inCheck, legalMoves, notation } from '../games/xiangqi/game.js';
import type { Cell, XiangqiData, XiangqiView } from '../games/xiangqi/game.js';

const move = (fx: number, fy: number, tx: number, ty: number) => ({ action: 'act' as const, move: 'move', args: { fx, fy, tx, ty } });
const act = (name: string) => ({ action: 'act' as const, move: name });

function started() {
  const session = new GameSession(xiangqi);
  session.executeAction('player', { action: 'new' });
  return { session, data: session.data as XiangqiData };
}

/** A board with only the given pieces, e.g. { '5,1': 'k', '4,10': 'K' }. */
function board(pieces: Record<string, string>): Cell[][] {
  const cells: Cell[][] = Array.from({ length: 10 }, () => Array(9).fill(null));
  for (const [key, piece] of Object.entries(pieces)) {
    const [x, y] = key.split(',').map(Number);
    cells[y - 1][x - 1] = piece;
  }
  return cells;
}

test('xiangqi: opening position, notation and the player view', () => {
  const { session, data } = started();
  assert.equal(legalMoves(data.board, 'red').length, 44);
  assert.equal(notation(data.board, { fx: 2, fy: 8, tx: 5, ty: 8 }), '炮八平五');
  assert.equal(notation(data.board, { fx: 8, fy: 8, tx: 5, ty: 8 }), '炮二平五');
  assert.equal(notation(data.board, { fx: 2, fy: 10, tx: 3, ty: 8 }), '马八进七');
  const view = session.getStateForRole('player').data as XiangqiView;
  assert.equal(view.mySide, 'red');
  assert.equal(view.legalMoves.length, 44);
  assert.equal((session.getStateForRole('agent').data as XiangqiView).legalMoves.length, 0);
  session.executeAction('player', move(8, 8, 5, 8));
  assert.equal(notation(data.board, { fx: 2, fy: 3, tx: 5, ty: 3 }), '炮２平５');
  assert.match(session.getStateForRole('agent').summary, /上一步: 玩家 炮二平五/);
});

test('xiangqi: blocked horse, cannon screen, facing generals and illegal moves', () => {
  const { session, data } = started();
  assert.ok(legalMoves(data.board, 'red').some(m => m.fx === 2 && m.fy === 10 && m.tx === 1 && m.ty === 8));
  // Toward (4,9) the horse's leg at (3,10) is blocked by the elephant.
  assert.throws(() => session.executeAction('player', move(2, 10, 4, 9)), /马不能/);
  assert.throws(() => session.executeAction('player', move(1, 1, 1, 2)), /没有你的棋子/);
  // The cannon captures the black horse over the black cannon at (2,3).
  session.executeAction('player', move(2, 8, 2, 1));
  assert.equal(data.lastMove!.captured, 'n');
  assert.deepEqual(data.captured.red, ['n']);

  // A horse standing between the generals may not move away.
  data.board = board({ '5,1': 'k', '5,10': 'K', '5,5': 'N' });
  assert.ok(legalMoves(data.board, 'red').every(m => !(m.fx === 5 && m.fy === 5)));
  data.board = board({ '5,1': 'k', '5,10': 'K' });
  assert.equal(inCheck(data.board, 'red'), true);
});

test('xiangqi: checkmate ends the game', () => {
  const { session, data } = started();
  data.board = board({ '5,1': 'k', '1,3': 'R', '9,2': 'R', '4,10': 'K' });
  session.executeAction('player', move(1, 3, 1, 1));
  const state = session.getStateForRole('agent');
  assert.equal(state.status, 'ended');
  assert.deepEqual(state.result!.winners, ['player']);
  assert.match(state.result!.reason, /将死/);
});

test('xiangqi: threefold repetition is a draw, perpetual check loses', () => {
  const { session } = started();
  for (let i = 0; i < 2; i++) {
    session.executeAction('player', move(2, 10, 3, 8));
    session.executeAction('agent', move(2, 1, 3, 3));
    session.executeAction('player', move(3, 8, 2, 10));
    session.executeAction('agent', move(3, 3, 2, 1));
  }
  assert.equal(session.status, 'ended');
  assert.equal(session.result!.outcome, 'draw');

  // Red checks with the rook every move while the black king steps between two files.
  const perpetual = started();
  perpetual.data.board = board({ '4,1': 'k', '5,5': 'R', '6,10': 'K' });
  perpetual.data.startKey = '';
  const cycle = [move(5, 5, 4, 5), move(4, 1, 5, 1), move(4, 5, 5, 5), move(5, 1, 4, 1)];
  let plies = 0;
  while (perpetual.session.status === 'playing') {
    perpetual.session.executeAction(plies % 2 ? 'agent' : 'player', cycle[plies % 4]);
    plies++;
  }
  // The position after the first check recurs a third time on the ninth move.
  assert.equal(plies, 9);
  assert.deepEqual(perpetual.session.result!.winners, ['agent']);
  assert.match(perpetual.session.result!.reason, /长将/);
});

test('xiangqi: undo and draw requests need the opponent and are limited to one per turn', () => {
  const { session, data } = started();
  const names = (role: 'player' | 'agent') => session.getStateForRole(role).availableActions.map(a => a.name);
  assert.ok(!names('player').includes('request_undo'));
  session.executeAction('player', move(8, 8, 5, 8));
  session.executeAction('agent', move(8, 1, 7, 3));
  session.executeAction('player', act('request_undo'));
  assert.deepEqual(names('agent'), ['accept_undo', 'decline_undo']);
  session.executeAction('agent', act('decline_undo'));
  assert.equal(session.turn, 'player');
  assert.ok(!names('player').includes('offer_draw'), 'one request per turn');
  session.executeAction('player', move(2, 10, 3, 8));
  session.executeAction('agent', move(2, 1, 3, 3));
  session.executeAction('player', act('request_undo'));
  session.executeAction('agent', act('accept_undo'));
  assert.equal(session.turn, 'player');
  assert.equal(data.plies.length, 2);
  assert.equal(data.lastMove!.notation, '马８进７');
  assert.equal(data.board[9][1], 'N');

  session.executeAction('player', act('offer_draw'));
  session.executeAction('agent', act('accept_draw'));
  assert.equal(session.result!.outcome, 'draw');
});
