import type { AvailableAction, GameDefinition, Role } from '../../src/index.js';

export type Color = 'black' | 'white';
export interface Position { x: number; y: number }
export interface LastMove extends Position { color: Color; role: Role }
export interface GomokuData {
  board: (Color | null)[][];
  colors: Record<Role, Color>;
  lastMove: LastMove | null;
  moveCount: number;
  winningLine: Position[];
}
export interface GomokuView extends GomokuData {
  size: number;
  myColor: Color;
}

const SIZE = 15;
const roleName = (role: Role) => role === 'player' ? '玩家' : 'Agent';

function findWinningLine(board: GomokuData['board'], x: number, y: number, color: Color): Position[] {
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const line = [{ x, y }];
    for (const direction of [-1, 1]) {
      let cx = x + dx * direction;
      let cy = y + dy * direction;
      while (cx >= 1 && cx <= SIZE && cy >= 1 && cy <= SIZE && board[cy - 1][cx - 1] === color) {
        line.push({ x: cx, y: cy });
        cx += dx * direction;
        cy += dy * direction;
      }
    }
    if (line.length >= 5) return line;
  }
  return [];
}

export default {
  id: 'gomoku',
  name: '五子棋',
  rules: [
    '棋盘为 15×15，先手执黑，后手执白，双方交替在空交叉点落子。',
    '横、竖或斜向连续五颗及以上同色棋子获胜。无禁手，长连也算获胜。',
    '棋盘填满且无人获胜时和局。轮到自己时可以认输。',
    '坐标 x、y 都为 1～15：x 从左向右，y 从上向下，左上角是 (1, 1)，天元是 (8, 8)。'
  ],

  setup({ starter }) {
    return {
      board: Array.from({ length: SIZE }, () => Array(SIZE).fill(null)),
      colors: { player: starter === 'player' ? 'black' : 'white', agent: starter === 'agent' ? 'black' : 'white' },
      lastMove: null, moveCount: 0, winningLine: []
    };
  },

  actions(): AvailableAction[] {
    return [
      {
        name: 'place', description: '在空交叉点落子；x 是从左向右的列，y 是从上向下的行',
        parameters: { x: { type: 'integer', min: 1, max: SIZE }, y: { type: 'integer', min: 1, max: SIZE } }
      },
      { name: 'resign', description: '认输', parameters: {} }
    ];
  },

  act({ data, role, opponent }, move, { x, y }) {
    if (move === 'resign') {
      const result = { outcome: 'win' as const, winners: [opponent], reason: `${roleName(role)}认输，${roleName(opponent)}获胜！` };
      return { event: { type: 'resign', text: result.reason, data: {} }, result };
    }
    if (data.board[y - 1][x - 1]) throw new Error(`(${x}, ${y}) 已有棋子`);
    const color = data.colors[role];
    data.board[y - 1][x - 1] = color;
    data.moveCount++;
    data.lastMove = { x, y, color, role };
    data.winningLine = findWinningLine(data.board, x, y, color);
    const event = { type: 'place', text: `${roleName(role)}落子 (${x}, ${y})`, data: { x, y, color } };
    if (data.winningLine.length) {
      return { event, result: { outcome: 'win', winners: [role], reason: `${roleName(role)}连成 ${data.winningLine.length} 子，获胜！` } };
    }
    if (data.moveCount === SIZE * SIZE) return { event, result: { outcome: 'draw', winners: [], reason: '棋盘已满，双方和局。' } };
    return { event };
  },

  view({ data, role }) {
    return { ...data, size: SIZE, myColor: data.colors[role] };
  },

  format(view) {
    const symbol = (cell: Color | null) => cell === 'black' ? 'X' : cell === 'white' ? 'O' : '.';
    const lines = [`你的棋子: ${view.myColor === 'black' ? '黑子 X' : '白子 O'}；已落 ${view.moveCount} 子`,
      'y\\x ' + Array.from({ length: SIZE }, (_, index) => String(index + 1).padStart(2)).join(' ')];
    view.board.forEach((row, index) => lines.push(String(index + 1).padStart(3) + ' ' + row.map(cell => symbol(cell).padStart(2)).join(' ')));
    if (view.lastMove) lines.push(`最近落子: ${roleName(view.lastMove.role)} (${view.lastMove.x}, ${view.lastMove.y})`);
    return lines.join('\n');
  }
} satisfies GameDefinition<GomokuData, GomokuView>;
