import type { ActionArgs, GameState, Role } from '../../src/protocol.js';
import type { GomokuData } from '../../src/games/gomoku.js';

export const name = '五子棋';
export const rules = [
  '棋盘为 15×15，先手执黑，后手执白。你和 Kana 交替在空交叉点落子。',
  '横、竖或任意斜向连续五颗及以上同色棋子获胜。本游戏无禁手，长连也算获胜。',
  '棋盘填满且无人获胜时和局。轮到自己时可以认输。',
  '坐标 x、y 都为 1～15。x 从左向右增加，y 从上向下增加，左上角是 (1, 1)。',
  '点击空交叉点直接落子。最后一手有红框，获胜连线有绿框。'
];
const SIZE = 15;

export function mount({ stage, controls, act }: {
  stage: HTMLElement;
  controls: HTMLElement;
  act(move: string, args?: ActionArgs): Promise<void>;
}) {
  stage.innerHTML = `<div class="gomoku-table">
    <div id="boardStatus" class="board-status"></div>
    <div class="board-wrap"><div id="gomokuBoard" class="gomoku-board" aria-label="15乘15五子棋棋盘"></div></div>
    <p id="boardNote" class="board-note"></p>
  </div>`;
  controls.innerHTML = `<div class="gomoku-controls"><span>点击空交叉点落子</span>
    <button id="resignButton" class="pixel-btn danger" type="button">认输</button></div>`;
  const board = stage.querySelector<HTMLElement>('#gomokuBoard')!;
  const cells: { x: number; y: number; button: HTMLButtonElement }[] = [];
  const corner = document.createElement('span');
  board.appendChild(corner);
  for (let x = 1; x <= SIZE; x++) {
    const label = document.createElement('span');
    label.className = 'board-coordinate';
    label.textContent = String(x);
    board.appendChild(label);
  }
  for (let y = 1; y <= SIZE; y++) {
    const label = document.createElement('span');
    label.className = 'board-coordinate';
    label.textContent = String(y);
    board.appendChild(label);
    for (let x = 1; x <= SIZE; x++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.x = String(x);
      button.dataset.y = String(y);
      button.onclick = () => act('place', { x, y });
      cells.push({ x, y, button });
      board.appendChild(button);
    }
  }
  const resign = controls.querySelector<HTMLButtonElement>('#resignButton')!;
  resign.onclick = () => act('resign');
  return {
    render(state: Pick<GameState<GomokuData>, 'status' | 'data'> & Partial<GameState<GomokuData>>, context: {
      connected: boolean;
      pendingAction: string;
      canAct: boolean;
      starter: Role;
      reset: boolean;
    }) {
      const data = state.data;
      const colors = data?.colors || {
        player: context.starter === 'player' ? 'black' : 'white',
        agent: context.starter === 'agent' ? 'black' : 'white'
      };
      board.classList.toggle('can-play', context.canAct);
      board.dataset.color = colors.player;
      const winning = new Set((data?.winningLine || []).map(({ x, y }) => `${x},${y}`));
      for (const { x, y, button } of cells) {
        const color = data?.board[y - 1][x - 1];
        const last = data?.lastMove?.x === x && data.lastMove.y === y;
        const star = [4, 8, 12].includes(x) && [4, 8, 12].includes(y);
        button.className = 'board-cell ' + (color || 'empty') + (last ? ' last' : '') +
          (winning.has(`${x},${y}`) ? ' winning' : '') + (star ? ' star' : '');
        button.disabled = !context.canAct || Boolean(color);
        const label = `${x} 列 ${y} 行，${color === 'black' ? '黑子' : color === 'white' ? '白子' : '空位'}`;
        button.setAttribute('aria-label', label);
        button.title = `(${x}, ${y})`;
      }
      resign.disabled = !context.canAct;
      resign.textContent = context.pendingAction === 'resign' ? '正在认输…' : '认输';
      stage.querySelector<HTMLElement>('#boardStatus')!.textContent = state.result?.reason ||
        (state.status === 'playing' ? `第 ${(data?.moveCount || 0) + 1} 手 · ${state.isMyTurn ? '请你落子' : '等待 Kana 落子'}` : '黑子先行 · 连成五子获胜');
      stage.querySelector<HTMLElement>('#boardNote')!.textContent = data?.lastMove ?
        `最后一手：${data.lastMove.role === 'player' ? '你' : 'Kana'} (${data.lastMove.x}, ${data.lastMove.y})` : '横轴 x → · 纵轴 y ↓ · 坐标 1～15';
      return { agent: colors.agent === 'black' ? '执黑 · 先手' : '执白 · 后手', player: colors.player === 'black' ? '执黑 · 先手' : '执白 · 后手' };
    }
  };
}
