import type { AvailableAction, GameDefinition, GameResult, Role } from '../../src/index.js';

export type Side = 'red' | 'black';
/** A piece is a FEN-style letter: K A B N R C P, uppercase red, lowercase black. */
export type Cell = string | null;
export interface Move { fx: number; fy: number; tx: number; ty: number }
export interface LegalMove extends Move { notation: string }
export interface LastMove extends Move { piece: string; captured: Cell; notation: string; role: Role }
export interface Pending { type: 'draw' | 'undo'; by: Role }

interface Ply {
  /** State before the move, restored by an accepted undo. */
  before: { board: Cell[][]; lastMove: LastMove | null; captured: Record<Side, string[]> };
  /** Position after the move, with the side to move. */
  key: string;
  mover: Side;
  check: boolean;
}

export interface XiangqiData {
  board: Cell[][];
  sides: Record<Role, Side>;
  lastMove: LastMove | null;
  captured: Record<Side, string[]>;
  pending: Pending | null;
  plies: Ply[];
  startKey: string;
  /** Ply count at which the side to move already made a draw or undo request. */
  requestPly: number;
}

export interface XiangqiView {
  board: Cell[][];
  sides: Record<Role, Side>;
  mySide: Side;
  turn: Role | null;
  lastMove: LastMove | null;
  /** Pieces each side has captured. */
  captured: Record<Side, string[]>;
  pending: Pending | null;
  moveCount: number;
  /** Whether the side to move is in check. */
  inCheck: boolean;
  /** Every legal move, only for the viewer on their own turn. */
  legalMoves: LegalMove[];
}

const START = [
  'rnbakabnr', '.........', '.c.....c.', 'p.p.p.p.p', '.........',
  '.........', 'P.P.P.P.P', '.C.....C.', '.........', 'RNBAKABNR'
];
export const PIECE_NAMES: Record<string, string> = {
  K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵',
  k: '将', a: '士', b: '象', n: '马', r: '车', c: '炮', p: '卒'
};
/** Distinct glyphs for the text board, where 马车炮 would be ambiguous. */
const TEXT_GLYPHS: Record<string, string> = {
  K: '帥', A: '仕', B: '相', N: '傌', R: '俥', C: '炮', P: '兵',
  k: '將', a: '士', b: '象', n: '馬', r: '車', c: '砲', p: '卒'
};
const RED_NUMBERS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const BLACK_NUMBERS = ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
const ORTHOGONAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGONAL = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KNIGHT = [[1, 2], [-1, 2], [1, -2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]];

const roleName = (role: Role) => role === 'player' ? '玩家' : 'Agent';
const other = (side: Side): Side => side === 'red' ? 'black' : 'red';
const sideOf = (piece: string): Side => piece === piece.toUpperCase() ? 'red' : 'black';
const at = (board: Cell[][], x: number, y: number) => board[y - 1][x - 1];
const inBoard = (x: number, y: number) => x >= 1 && x <= 9 && y >= 1 && y <= 10;
const inPalace = (side: Side, x: number, y: number) => x >= 4 && x <= 6 && (side === 'red' ? y >= 8 : y <= 3);
const onOwnHalf = (side: Side, y: number) => side === 'red' ? y >= 6 : y <= 5;
const forward = (side: Side) => side === 'red' ? -1 : 1;
const sameMove = (a: Move, b: Move) => a.fx === b.fx && a.fy === b.fy && a.tx === b.tx && a.ty === b.ty;
const positionKey = (board: Cell[][], toMove: Side) => board.map(row => row.map(cell => cell || '.').join('')).join('/') + ' ' + toMove;

/** Moves by piece rules alone, ignoring whether they leave the own general in check. */
function pieceMoves(board: Cell[][], x: number, y: number): Move[] {
  const piece = at(board, x, y)!;
  const side = sideOf(piece);
  const moves: Move[] = [];
  const add = (tx: number, ty: number) => {
    if (!inBoard(tx, ty)) return;
    const target = at(board, tx, ty);
    if (!target || sideOf(target) !== side) moves.push({ fx: x, fy: y, tx, ty });
  };
  switch (piece.toUpperCase()) {
    case 'K':
      for (const [dx, dy] of ORTHOGONAL) if (inPalace(side, x + dx, y + dy)) add(x + dx, y + dy);
      break;
    case 'A':
      for (const [dx, dy] of DIAGONAL) if (inPalace(side, x + dx, y + dy)) add(x + dx, y + dy);
      break;
    case 'B':
      for (const [dx, dy] of DIAGONAL) {
        const tx = x + 2 * dx, ty = y + 2 * dy;
        if (inBoard(tx, ty) && onOwnHalf(side, ty) && !at(board, x + dx, y + dy)) add(tx, ty);
      }
      break;
    case 'N':
      for (const [dx, dy] of KNIGHT) {
        const tx = x + dx, ty = y + dy;
        const [lx, ly] = Math.abs(dx) === 2 ? [x + dx / 2, y] : [x, y + dy / 2];
        if (inBoard(tx, ty) && !at(board, lx, ly)) add(tx, ty);
      }
      break;
    case 'R':
    case 'C': {
      const cannon = piece.toUpperCase() === 'C';
      for (const [dx, dy] of ORTHOGONAL) {
        let screened = false;
        for (let tx = x + dx, ty = y + dy; inBoard(tx, ty); tx += dx, ty += dy) {
          const target = at(board, tx, ty);
          if (!screened) {
            if (!target) add(tx, ty);
            else if (cannon) screened = true;
            else { add(tx, ty); break; }
          } else if (target) {
            if (sideOf(target) !== side) add(tx, ty);
            break;
          }
        }
      }
      break;
    }
    case 'P':
      add(x, y + forward(side));
      if (!onOwnHalf(side, y)) { add(x - 1, y); add(x + 1, y); }
      break;
  }
  return moves;
}

function findGeneral(board: Cell[][], side: Side) {
  const general = side === 'red' ? 'K' : 'k';
  for (let y = 1; y <= 10; y++) for (let x = 1; x <= 9; x++) if (at(board, x, y) === general) return { x, y };
  throw new Error(`${side} general missing`);
}

/** Whether side's general is attacked, including the two generals facing on an open file. */
export function inCheck(board: Cell[][], side: Side) {
  const own = findGeneral(board, side);
  const enemy = findGeneral(board, other(side));
  if (own.x === enemy.x) {
    const [from, to] = own.y < enemy.y ? [own.y, enemy.y] : [enemy.y, own.y];
    let open = true;
    for (let y = from + 1; y < to; y++) if (at(board, own.x, y)) open = false;
    if (open) return true;
  }
  for (let y = 1; y <= 10; y++) {
    for (let x = 1; x <= 9; x++) {
      const piece = at(board, x, y);
      if (piece && sideOf(piece) !== side && pieceMoves(board, x, y).some(m => m.tx === own.x && m.ty === own.y)) return true;
    }
  }
  return false;
}

function applyMove(board: Cell[][], { fx, fy, tx, ty }: Move) {
  const next = board.map(row => [...row]);
  next[ty - 1][tx - 1] = next[fy - 1][fx - 1];
  next[fy - 1][fx - 1] = null;
  return next;
}

export function legalMoves(board: Cell[][], side: Side): Move[] {
  const moves: Move[] = [];
  for (let y = 1; y <= 10; y++) {
    for (let x = 1; x <= 9; x++) {
      const piece = at(board, x, y);
      if (piece && sideOf(piece) === side) {
        for (const move of pieceMoves(board, x, y)) if (!inCheck(applyMove(board, move), side)) moves.push(move);
      }
    }
  }
  return moves;
}

/** Chinese notation such as 炮二平五 or 前车进三, from the mover's point of view. */
export function notation(board: Cell[][], move: Move) {
  const piece = at(board, move.fx, move.fy)!;
  const side = sideOf(piece);
  const numbers = side === 'red' ? RED_NUMBERS : BLACK_NUMBERS;
  const file = (x: number) => side === 'red' ? 10 - x : x;
  const sameFile: number[] = [];
  for (let y = 1; y <= 10; y++) if (at(board, move.fx, y) === piece) sameFile.push(y);
  let name = PIECE_NAMES[piece] + numbers[file(move.fx)];
  if (sameFile.length > 1) {
    // Front is the piece furthest advanced toward the opponent.
    sameFile.sort((a, b) => side === 'red' ? a - b : b - a);
    const labels = sameFile.length === 2 ? ['前', '后'] : sameFile.length === 3 ? ['前', '中', '后'] : ['一', '二', '三', '四', '五'];
    name = labels[sameFile.indexOf(move.fy)] + PIECE_NAMES[piece];
  }
  if (move.ty === move.fy) return name + '平' + numbers[file(move.tx)];
  const direction = (move.ty - move.fy) * forward(side) > 0 ? '进' : '退';
  const straight = 'KRCP'.includes(piece.toUpperCase());
  return name + direction + (straight ? numbers[Math.abs(move.ty - move.fy)] : numbers[file(move.tx)]);
}

function explainIllegal(data: XiangqiData, side: Side, move: Move) {
  const piece = at(data.board, move.fx, move.fy);
  if (!piece || sideOf(piece) !== side) return `(${move.fx}, ${move.fy}) 没有你的棋子`;
  const name = PIECE_NAMES[piece];
  if (!pieceMoves(data.board, move.fx, move.fy).some(m => sameMove(m, move))) {
    return `${name}不能从 (${move.fx}, ${move.fy}) 走到 (${move.tx}, ${move.ty})`;
  }
  return `${name}走到 (${move.tx}, ${move.ty}) 后己方将帅会被将军或照面，不能这样走`;
}

/** After a third repetition: a side that checked on every one of its moves loses, otherwise a draw. */
function repetitionResult(data: XiangqiData): GameResult | null {
  const keys = [data.startKey, ...data.plies.map(ply => ply.key)];
  const current = keys[keys.length - 1];
  const seen = keys.flatMap((key, index) => key === current ? [index] : []);
  if (seen.length < 3) return null;
  const cycle = data.plies.slice(seen[0]);
  const alwaysChecking = (side: Side) => cycle.filter(ply => ply.mover === side).every(ply => ply.check);
  const roleOf = (side: Side) => (Object.keys(data.sides) as Role[]).find(role => data.sides[role] === side)!;
  for (const side of ['red', 'black'] as Side[]) {
    if (alwaysChecking(side) && !alwaysChecking(other(side))) {
      const loser = roleOf(side);
      const winner = roleOf(other(side));
      return { outcome: 'win', winners: [winner], reason: `${roleName(loser)}长将，判负，${roleName(winner)}获胜！` };
    }
  }
  return { outcome: 'draw', winners: [], reason: '同一局面重复三次，和棋。' };
}

export default {
  id: 'xiangqi',
  name: '中国象棋',
  rules: [
    '棋盘 9 列 × 10 行，先手执红、后手执黑，红方先走。坐标 x 为 1～9（从左到右），y 为 1～10（从上到下）；黑方在上（y 1～5），红方在下（y 6～10）。',
    '走子：车直走不限步数；马走日，蹩马腿不能走；象（相）走田，塞象眼不能走，且不能过河；士（仕）在九宫内斜走一步；将（帅）在九宫内直走一步；炮走法同车，吃子须恰好隔一个子（炮架，敌我棋子都可以）；兵（卒）过河前只能向前一步，过河后可左右走。',
    '不能走出让己方将帅被将军的棋，将帅不能在同一列上无子相隔地照面。',
    '把对方将死或使对方无子可走（困毙）即获胜。轮到自己时可以认输。',
    '轮到自己时可以求和或悔棋（撤回双方各一步），由对方同意或拒绝；每回合只能提一次。',
    '同一局面重复三次时：一方一直在将军（长将）则长将方判负，否则和棋。'
  ],

  setup({ starter }) {
    const board = START.map(row => [...row].map(cell => cell === '.' ? null : cell));
    return {
      board,
      sides: { player: starter === 'player' ? 'red' : 'black', agent: starter === 'agent' ? 'red' : 'black' },
      lastMove: null, captured: { red: [], black: [] }, pending: null,
      plies: [], startKey: positionKey(board, 'red'), requestPly: -1
    };
  },

  actions({ data }): AvailableAction[] {
    if (data.pending) {
      const what = data.pending.type === 'draw' ? '求和' : '悔棋';
      return [
        { name: `accept_${data.pending.type}`, description: `同意对方的${what}请求`, parameters: {} },
        { name: `decline_${data.pending.type}`, description: `拒绝对方的${what}请求`, parameters: {} }
      ];
    }
    const actions: AvailableAction[] = [
      {
        name: 'move', description: '走子：把 (fx, fy) 的棋子走到 (tx, ty)，对应 state.data.board[y - 1][x - 1]；所有合法走法见 state.data.legalMoves',
        parameters: {
          fx: { type: 'integer', min: 1, max: 9 }, fy: { type: 'integer', min: 1, max: 10 },
          tx: { type: 'integer', min: 1, max: 9 }, ty: { type: 'integer', min: 1, max: 10 }
        }
      },
      { name: 'resign', description: '认输', parameters: {} }
    ];
    if (data.requestPly !== data.plies.length) {
      actions.push({ name: 'offer_draw', description: '向对方求和，对方同意则和棋', parameters: {} });
      if (data.plies.length >= 2) actions.push({ name: 'request_undo', description: '请求悔棋，撤回双方各一步', parameters: {} });
    }
    return actions;
  },

  act({ data, role, opponent }, action, args) {
    const side = data.sides[role];
    if (action === 'resign') {
      const result = { outcome: 'win' as const, winners: [opponent], reason: `${roleName(role)}认输，${roleName(opponent)}获胜！` };
      return { event: { type: 'resign', text: result.reason, data: {} }, result };
    }
    if (action === 'offer_draw' || action === 'request_undo') {
      const type = action === 'offer_draw' ? 'draw' : 'undo';
      data.pending = { type, by: role };
      data.requestPly = data.plies.length;
      return { event: { type: action, text: `${roleName(role)}${type === 'draw' ? '求和' : '请求悔棋'}`, data: {} } };
    }
    if (action === 'accept_draw') {
      const result = { outcome: 'draw' as const, winners: [], reason: '双方同意，和棋。' };
      return { event: { type: action, text: `${roleName(role)}同意和棋`, data: {} }, result };
    }
    if (action === 'accept_undo') {
      const restored = data.plies[data.plies.length - 2].before;
      data.plies.splice(-2);
      Object.assign(data, restored, { pending: null });
      return { event: { type: action, text: `${roleName(role)}同意悔棋，撤回双方各一步`, data: {} } };
    }
    if (action === 'decline_draw' || action === 'decline_undo') {
      data.pending = null;
      return { event: { type: action, text: `${roleName(role)}拒绝了${action === 'decline_draw' ? '求和' : '悔棋'}`, data: {} } };
    }

    const move = args as unknown as Move;
    if (!legalMoves(data.board, side).some(m => sameMove(m, move))) throw new Error(explainIllegal(data, side, move));
    const piece = at(data.board, move.fx, move.fy)!;
    const captured = at(data.board, move.tx, move.ty);
    const text = notation(data.board, move);
    const before = { board: data.board, lastMove: data.lastMove, captured: { red: [...data.captured.red], black: [...data.captured.black] } };
    data.board = applyMove(data.board, move);
    if (captured) data.captured[side].push(captured);
    const check = inCheck(data.board, other(side));
    data.lastMove = { ...move, piece, captured, notation: text, role };
    data.plies.push({ before, key: positionKey(data.board, other(side)), mover: side, check });
    const event = {
      type: 'move',
      text: `${roleName(role)} ${text}` + (captured ? `，吃${PIECE_NAMES[captured]}` : '') + (check ? '，将军！' : ''),
      data: { ...move, notation: text, captured, check }
    };
    if (!legalMoves(data.board, other(side)).length) {
      const reason = check ? `${roleName(role)}将死对方，获胜！` : `${roleName(opponent)}无子可走（困毙），${roleName(role)}获胜！`;
      return { event, result: { outcome: 'win', winners: [role], reason } };
    }
    const repetition = repetitionResult(data);
    return repetition ? { event, result: repetition } : { event };
  },

  view({ data, role, turn, ended }) {
    const mySide = data.sides[role];
    const toMove = turn ? data.sides[turn] : null;
    return {
      board: data.board, sides: data.sides, mySide, turn,
      lastMove: data.lastMove, captured: data.captured, pending: data.pending,
      moveCount: data.plies.length,
      inCheck: toMove ? inCheck(data.board, toMove) : false,
      legalMoves: !ended && turn === role && !data.pending
        ? legalMoves(data.board, mySide).map(move => ({ ...move, notation: notation(data.board, move) }))
        : []
    };
  },

  format(view) {
    const lines = [
      `你执${view.mySide === 'red' ? '红（帥仕相傌俥炮兵）' : '黑（將士象馬車砲卒）'}；红方在下。已走 ${view.moveCount} 步`,
      'y\\x １２３４５６７８９'
    ];
    view.board.forEach((row, index) => {
      lines.push(String(index + 1).padStart(3) + ' ' + row.map(cell => cell ? TEXT_GLYPHS[cell] : '．').join(''));
      if (index === 4) lines.push('    ～楚河～～汉界～');
    });
    if (view.lastMove) lines.push(`上一步: ${roleName(view.lastMove.role)} ${view.lastMove.notation}`);
    if (view.inCheck) lines.push('当前行棋方被将军！');
    if (view.pending) lines.push(`待回应: ${roleName(view.pending.by)}${view.pending.type === 'draw' ? '求和' : '请求悔棋'}`);
    if (view.legalMoves.length) {
      lines.push('合法走法: ' + view.legalMoves.map(m => `${m.notation}(${m.fx},${m.fy}→${m.tx},${m.ty})`).join(' '));
    }
    return lines.join('\n');
  }
} satisfies GameDefinition<XiangqiData, XiangqiView>;
