import { connect } from '/_kana/client.js';
import type { ActionPayload, GameState, HistoryEntry, Role } from '/_kana/client.js';
import type { GomokuView } from '../game.js';

const SIZE = 15;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const who = (role: Role) => role === 'player' ? '你' : 'Kana ';

let state: GameState<GomokuView> | null = null;
let connected = false;
let pending = '';
let starter: Role = 'player';
let historyKey = '';
let lastPlaced = '';

// Static board: grid lines, star points, coordinates and 225 intersections.
const svg = $('boardLines');
const NS = 'http://www.w3.org/2000/svg';
for (let i = 0; i < SIZE; i++) {
  for (const [x1, y1, x2, y2] of [[0, i, SIZE - 1, i], [i, 0, i, SIZE - 1]]) {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(x1)); line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2)); line.setAttribute('y2', String(y2));
    svg.appendChild(line);
  }
  for (const id of ['coordsX', 'coordsY']) {
    const label = document.createElement('span');
    label.textContent = String(i + 1);
    $(id).appendChild(label);
  }
}
for (const [x, y] of [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]]) {
  const star = document.createElementNS(NS, 'circle');
  star.setAttribute('cx', String(x)); star.setAttribute('cy', String(y)); star.setAttribute('r', '0.1');
  svg.appendChild(star);
}
const points: HTMLButtonElement[] = [];
for (let y = 1; y <= SIZE; y++) {
  for (let x = 1; x <= SIZE; x++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = `(${x}, ${y})`;
    button.appendChild(document.createElement('i')).className = 'stone';
    button.onclick = () => doAction({ action: 'act', move: 'place', args: { x, y } });
    points.push(button);
    $('points').appendChild(button);
  }
}

function describe(entry: HistoryEntry) {
  const data = entry.data as { x?: number; y?: number; starter?: Role };
  if (entry.type === 'start') return `新对局开始，${who(data.starter!)}先手执黑`;
  if (entry.type === 'place') return `${who(entry.sender)}落子 (${data.x}, ${data.y})`;
  if (entry.type === 'resign') return `${who(entry.sender)}认输`;
  return entry.text;
}

function renderHistory(history: HistoryEntry[]) {
  const key = JSON.stringify(history);
  if (key === historyKey) return;
  historyKey = key;
  const list = $('chatHistory');
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 45;
  list.replaceChildren();
  if (!history.length) list.appendChild(Object.assign(document.createElement('li'), { className: 'chat-empty', textContent: '棋盘已备好，落下第一子吧。' }));
  for (const entry of history) {
    if (entry.type !== 'talk') list.appendChild(Object.assign(document.createElement('li'), { className: 'chat-activity', textContent: describe(entry) }));
    if (!entry.message) continue;
    const item = Object.assign(document.createElement('li'), { className: 'chat-message ' + entry.sender });
    item.append(
      Object.assign(document.createElement('span'), { className: 'chat-sender', textContent: who(entry.sender) }),
      Object.assign(document.createElement('div'), { className: 'chat-bubble', textContent: entry.message })
    );
    list.appendChild(item);
  }
  if (atBottom || history.length <= 1) list.scrollTop = list.scrollHeight;
}

function render() {
  const status = state?.status || 'waiting';
  const view = state?.data;
  const playing = status === 'playing';
  const canAct = Boolean(connected && playing && state!.isMyTurn && !pending);
  const colors = view?.colors || { player: starter === 'player' ? 'black' : 'white', agent: starter === 'agent' ? 'black' : 'white' };

  $('playerStone').className = 'stone-icon ' + colors.player;
  $('agentStone').className = 'stone-icon ' + colors.agent;
  $('playerSeat').classList.toggle('active', playing && state!.currentTurn === 'player');
  $('agentSeat').classList.toggle('active', playing && state!.currentTurn === 'agent');
  for (const role of ['player', 'agent'] as const) {
    const last = state?.history.findLast(entry => entry.sender === role && entry.message);
    $(role + 'Speech').textContent = last?.message || '';
    $(role + 'Speech').title = last?.message || '';
  }

  const badge = $('turnBadge');
  const winners = state?.result?.winners || [];
  badge.className = 'turn-badge' + (playing && state!.isMyTurn ? ' your-turn' : '') +
    (status === 'ended' && winners.length ? winners.includes('player') ? ' win' : ' lose' : '');
  badge.textContent = playing ? (state!.isMyTurn ? '轮到你落子' : 'Kana 思考中…') :
    status === 'ended' ? (!winners.length ? '和棋' : winners.includes('player') ? '你赢了' : 'Kana 获胜') : '等待开局';

  const board = $('board');
  board.dataset.color = colors.player;
  const winning = new Set((view?.winningLine || []).map(({ x, y }) => `${x},${y}`));
  points.forEach((button, index) => {
    const x = index % SIZE + 1;
    const y = Math.floor(index / SIZE) + 1;
    const color = view?.board[y - 1][x - 1];
    const last = view?.lastMove?.x === x && view.lastMove.y === y;
    button.className = 'point ' + (color || 'empty') + (last ? ' last' : '') + (winning.has(`${x},${y}`) ? ' winning' : '');
    (button.firstChild as HTMLElement).className = 'stone' + (color ? ' ' + color : '');
    button.disabled = !canAct || Boolean(color);
    button.setAttribute('aria-label', `${x} 列 ${y} 行，${color === 'black' ? '黑子' : color === 'white' ? '白子' : '空位'}`);
  });
  const placedKey = view?.lastMove ? `${view.moveCount}` : '';
  if (placedKey && placedKey !== lastPlaced && view?.lastMove) {
    points[(view.lastMove.y - 1) * SIZE + view.lastMove.x - 1].classList.add('placed');
  }
  lastPlaced = placedKey;

  $('overlay').hidden = playing;
  $('overlay').classList.toggle('ended', status === 'ended');
  $('overlayTitle').textContent = status === 'ended' ? badge.textContent : '新的一局';
  $('overlayText').textContent = status === 'ended' ? state!.result!.reason.replace(/玩家/g, '你').replace(/Agent/g, 'Kana') : '先手执黑，连成五子获胜。';
  for (const option of document.querySelectorAll<HTMLButtonElement>('.starter-option')) {
    option.setAttribute('aria-pressed', String(option.dataset.starter === starter));
    option.disabled = !connected || Boolean(pending);
  }
  const start = $<HTMLButtonElement>('startButton');
  start.disabled = !connected || Boolean(pending);
  start.textContent = pending === 'new' ? '正在开局…' : status === 'ended' ? '再来一局' : '开始对局';

  $('moveInfo').textContent = view?.lastMove ? `第 ${view.moveCount} 手 · ${who(view.lastMove.role)} (${view.lastMove.x}, ${view.lastMove.y})` : '横轴 x → · 纵轴 y ↓';
  const resign = $<HTMLButtonElement>('resignButton');
  resign.hidden = !playing;
  resign.disabled = !canAct;
  resign.textContent = pending === 'resign' ? '正在认输…' : '认输';

  $<HTMLInputElement>('talkInput').disabled = !connected;
  $<HTMLButtonElement>('sendButton').disabled = !connected || Boolean(pending) || !$<HTMLInputElement>('talkInput').value.trim();
  renderHistory(state?.history || []);
}

async function doAction(payload: ActionPayload) {
  if (pending || !connected) return;
  const input = $<HTMLInputElement>('talkInput');
  const message = payload.message ?? input.value.trim();
  pending = payload.action === 'act' ? payload.move : payload.action;
  const feedback = $(payload.action === 'talk' ? 'chatFeedback' : 'actionFeedback');
  feedback.textContent = '';
  render();
  try {
    await client.send({ ...payload, message });
    if (message && input.value.trim() === message) input.value = '';
  } catch (err) { feedback.textContent = (err as Error).message; }
  finally { pending = ''; render(); }
}

const client = connect<GomokuView>({
  onSnapshot(snapshot) {
    state = snapshot.state;
    const start = state.history.find(entry => entry.type === 'start');
    if (start) starter = start.data.starter as Role;
    render();
  },
  onConnection(value) {
    connected = value;
    $('connection').textContent = value ? '已连接' : '连接中…';
    $('connection').classList.toggle('online', value);
    if (value) $('actionFeedback').textContent = '';
    render();
  },
  onError(err) { $('actionFeedback').textContent = err.message; }
});

for (const option of document.querySelectorAll<HTMLButtonElement>('.starter-option')) {
  option.onclick = () => { starter = option.dataset.starter as Role; render(); };
}
$('startButton').onclick = () => doAction({ action: 'new', starter });
$('resignButton').onclick = () => doAction({ action: 'act', move: 'resign' });
$('talkInput').oninput = render;
$('chatForm').onsubmit = event => {
  event.preventDefault();
  const message = $<HTMLInputElement>('talkInput').value.trim();
  if (message) doAction({ action: 'talk', message });
};
const rules = $<HTMLDialogElement>('rulesModal');
$('rulesToggle').onclick = async () => {
  const { rules: paragraphs } = await client.info();
  $('rulesContent').replaceChildren(...paragraphs.map(text => Object.assign(document.createElement('p'), { textContent: text })));
  rules.showModal();
};
$('rulesCloseBtn').onclick = () => rules.close();
rules.onclick = event => { if (event.target === rules) rules.close(); };
render();
