import type { ActionArgs, GameEvent, GameResult, GameState, Role, RoleView } from '../protocol.js';
import type { EngineOptions, GameDefinition, GameEngine } from './types.js';

export type Color = 'black' | 'white';
export interface Position { x: number; y: number }
export interface LastMove extends Position { color: Color; role: Role }
export interface GomokuData {
  size: number;
  board: (Color | null)[][];
  colors: Record<Role, Color>;
  myColor: Color;
  lastMove: LastMove | null;
  moveCount: number;
  winningLine: Position[];
}

const SIZE = 15;
const roleName = (role: Role) => role === 'player' ? '玩家' : 'Agent';

export class Engine implements GameEngine<GomokuData> {
  status: 'playing' | 'ended';
  phase: string;
  currentTurn: Role | null;
  colors: Record<Role, Color>;
  board: (Color | null)[][];
  moveCount: number;
  lastMove: LastMove | null;
  winningLine: Position[];
  result: GameResult | null;

  constructor({ starter }: EngineOptions) {
    this.status = 'playing';
    this.phase = 'placement';
    this.currentTurn = starter;
    this.colors = {
      player: starter === 'player' ? 'black' : 'white',
      agent: starter === 'agent' ? 'black' : 'white'
    };
    this.board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    this.moveCount = 0;
    this.lastMove = null;
    this.winningLine = [];
    this.result = null;
  }

  isMyTurn(role: Role) {
    return this.status === 'playing' && this.currentTurn === role;
  }

  executeAction(role: Role, move: string, args: ActionArgs): GameEvent {
    if (this.status !== 'playing') throw new Error('当前对局已结束');
    if (!this.isMyTurn(role)) throw new Error(`当前不是 ${role} 的行动回合`);
    const opponent = role === 'player' ? 'agent' : 'player';
    if (move === 'resign') {
      this.finish({ outcome: 'win', winners: [opponent], reason: `${roleName(role)}认输，${roleName(opponent)}获胜！` });
      return { type: 'action_resign', text: this.result!.reason, data: { result: this.result } };
    }
    if (move !== 'place') throw new Error(`未知五子棋动作: ${move}`);
    const { x, y } = args;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isInteger(x) || !Number.isInteger(y) || x < 1 || x > SIZE || y < 1 || y > SIZE) {
      throw new Error('落子坐标 x、y 必须是 1 至 15 的整数');
    }
    if (this.board[y - 1][x - 1]) throw new Error(`(${x}, ${y}) 已有棋子`);
    const color = this.colors[role];
    this.board[y - 1][x - 1] = color;
    this.moveCount++;
    this.lastMove = { x, y, color, role };
    this.winningLine = this.findWinningLine(x, y, color);
    if (this.winningLine.length) {
      this.finish({ outcome: 'win', winners: [role], reason: `${roleName(role)}连成 ${this.winningLine.length} 子，获胜！` });
    } else if (this.moveCount === SIZE * SIZE) {
      this.finish({ outcome: 'draw', winners: [], reason: '棋盘已满，双方和局。' });
    } else {
      this.currentTurn = opponent;
    }
    return {
      type: 'action_place', text: `${roleName(role)}落子 (${x}, ${y})`,
      data: { x, y, color, ...(this.result ? { result: this.result } : {}) }
    };
  }

  findWinningLine(x: number, y: number, color: Color): Position[] {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const line = [{ x, y }];
      for (const direction of [-1, 1]) {
        let cx = x + dx * direction;
        let cy = y + dy * direction;
        while (cx >= 1 && cx <= SIZE && cy >= 1 && cy <= SIZE && this.board[cy - 1][cx - 1] === color) {
          line.push({ x: cx, y: cy });
          cx += dx * direction;
          cy += dy * direction;
        }
      }
      if (line.length >= 5) return line;
    }
    return [];
  }

  finish(result: GameResult) {
    this.result = result;
    this.status = 'ended';
    this.phase = 'finished';
    this.currentTurn = null;
  }

  getStateForRole(role: Role): RoleView<GomokuData> {
    return {
      status: this.status, phase: this.phase, currentTurn: this.currentTurn,
      isMyTurn: this.isMyTurn(role), result: this.result,
      availableActions: this.isMyTurn(role) ? [
        {
          name: 'place', description: '在空交叉点落子；x 是从左向右的列，y 是从上向下的行',
          parameters: { x: { type: 'integer', min: 1, max: SIZE }, y: { type: 'integer', min: 1, max: SIZE } }
        },
        { name: 'resign', description: '认输', parameters: {} }
      ] : [],
      data: {
        size: SIZE, board: this.board, colors: this.colors, myColor: this.colors[role],
        lastMove: this.lastMove, moveCount: this.moveCount, winningLine: this.winningLine
      }
    };
  }
}

export function formatState(state: GameState<GomokuData>) {
  const data = state.data!;
  const symbol = (cell: Color | null) => cell === 'black' ? 'X' : cell === 'white' ? 'O' : '.';
  const lines = [`你的棋子: ${data.myColor === 'black' ? '黑子 X' : '白子 O'}；已落 ${data.moveCount} 子`,
    'y\\x ' + Array.from({ length: SIZE }, (_, index) => String(index + 1).padStart(2)).join(' ')];
  data.board.forEach((row, index) => lines.push(String(index + 1).padStart(3) + ' ' + row.map(cell => symbol(cell).padStart(2)).join(' ')));
  if (data.lastMove) lines.push(`最近落子: ${roleName(data.lastMove.role)} (${data.lastMove.x}, ${data.lastMove.y})`);
  return lines.join('\n');
}

const game: GameDefinition<GomokuData> = { id: 'gomoku', name: '五子棋', Engine, formatState };
export default game;
