import { connect } from '/_kana/client.js';
import type { ActionPayload, GameState, HistoryEntry, Role } from '/_kana/client.js';
import type { LegalMove, Side, XiangqiView } from '../game.js';

const NAMES: Record<string, string> = {
  K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵',
  k: '将', a: '士', b: '象', n: '马', r: '车', c: '炮', p: '卒'
};
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const who = (role: Role) => role === 'player' ? '你' : 'Kana ';
const sideOf = (piece: string): Side => piece === piece.toUpperCase() ? 'red' : 'black';

let state: GameState<XiangqiView> | null = null;
let connected = false;
let pending = '';
let starter: Role = 'player';
let historyKey = '';
let selected: { x: number; y: number } | null = null;
let lastAnimated = '';

// Static board: lines, river and palaces in a 9 x 10 grid of intersections (0-based in SVG).
const svg = $('boardLines');
const NS = 'http://www.w3.org/2000/svg';
const line = (x1: number, y1: number, x2: number, y2: number) => {
  const element = document.createElementNS(NS, 'line');
  element.setAttribute('x1', String(x1)); element.setAttribute('y1', String(y1));
  element.setAttribute('x2', String(x2)); element.setAttribute('y2', String(y2));
  svg.appendChild(element);
};
for (let y = 0; y < 10; y++) line(0, y, 8, y);
for (let x = 0; x < 9; x++) {
  if (x === 0 || x === 8) line(x, 0, x, 9);
  else { line(x, 0, x, 4); line(x, 5, x, 9); }
}
for (const top of [0, 7]) { line(3, top, 5, top + 2); line(5, top, 3, top + 2); }
const frame = document.createElementNS(NS, 'rect');
for (const [key, value] of Object.entries({ x: '-0.12', y: '-0.12', width: '8.24', height: '9.24' })) frame.setAttribute(key, value);
svg.appendChild(frame);
for (const [x, text] of [[2, '楚  河'], [6, '漢  界']] as const) {
  const label = document.createElementNS(NS, 'text');
  label.setAttribute('x', String(x)); label.setAttribute('y', '4.5');
  label.textContent = text;
  svg.appendChild(label);
}

// 90 intersections in display order; each knows the board square it shows.
const points: { button: HTMLButtonElement; piece: HTMLElement }[] = [];
for (let row = 0; row < 10; row++) {
  for (let col = 0; col < 9; col++) {
    const button = document.createElement('button');
    button.type = 'button';
    const piece = document.createElement('i');
    button.appendChild(piece);
    button.onclick = () => clickPoint(Number(button.dataset.x), Number(button.dataset.y));
    points.push({ button, piece });
    $('points').appendChild(button);
  }
}

function clickPoint(x: number, y: number) {
  const view = state?.data;
  if (!view || pending) return;
  const target = view.legalMoves.find(m => selected && m.fx === selected.x && m.fy === selected.y && m.tx === x && m.ty === y);
  if (target) {
    selected = null;
    doAction({ action: 'act', move: 'move', args: { fx: target.fx, fy: target.fy, tx: target.tx, ty: target.ty } });
    return;
  }
  const own = view.legalMoves.some(m => m.fx === x && m.fy === y);
  selected = own && !(selected?.x === x && selected.y === y) ? { x, y } : null;
  render();
}

function describe(entry: HistoryEntry) {
  const data = entry.data as { starter?: Role; notation?: string; captured?: string | null; check?: boolean };
  const name = who(entry.sender);
  switch (entry.type) {
    case 'start': return `新对局开始，${who(data.starter!)}执红先行`;
    case 'move': return `${name}${data.notation}` + (data.captured ? `，吃${NAMES[data.captured]}` : '') + (data.check ? '，将军！' : '');
    case 'resign': return `${name}认输`;
    case 'offer_draw': return `${name}求和`;
    case 'request_undo': return `${name}请求悔棋`;
    case 'accept_draw': return `${name}同意和棋`;
    case 'decline_draw': return `${name}拒绝了求和`;
    case 'accept_undo': return `${name}同意悔棋，撤回双方各一步`;
    case 'decline_undo': return `${name}拒绝了悔棋`;
    default: return entry.text;
  }
}

function renderHistory(history: HistoryEntry[]) {
  const key = JSON.stringify(history);
  if (key === historyKey) return;
  historyKey = key;
  const list = $('chatHistory');
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 45;
  list.replaceChildren();
  if (!history.length) list.appendChild(Object.assign(document.createElement('li'), { className: 'chat-empty', textContent: '棋子已摆好，红先黑后。' }));
  for (const entry of history) {
    if (entry.type !== 'talk') {
      const notable = Boolean((entry.data as { check?: boolean }).check) || entry.type !== 'move';
      list.appendChild(Object.assign(document.createElement('li'), { className: 'chat-activity' + (notable && entry.type !== 'start' ? ' notable' : ''), textContent: describe(entry) }));
    }
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
  const myTurn = Boolean(connected && playing && state!.isMyTurn && !pending);
  const sides = view?.sides || { player: starter === 'player' ? 'red' : 'black', agent: starter === 'agent' ? 'red' : 'black' };
  const flipped = sides.player === 'black';
  if (!myTurn || !view?.legalMoves.some(m => m.fx === selected?.x && m.fy === selected?.y)) selected = null;

  for (const role of ['player', 'agent'] as const) {
    const icon = $(role + 'Side');
    icon.className = 'side-icon ' + sides[role];
    icon.textContent = sides[role] === 'red' ? '帅' : '将';
    $(role + 'Seat').classList.toggle('active', playing && state!.currentTurn === role);
    const last = state?.history.findLast(entry => entry.sender === role && entry.message);
    $(role + 'Speech').textContent = last?.message || '';
    $(role + 'Speech').title = last?.message || '';
    const captured = view?.captured[sides[role]] || [];
    $(role + 'Captured').textContent = captured.length ? '吃 ' + captured.map(piece => NAMES[piece]).join('') : '';
  }

  const badge = $('turnBadge');
  const winners = state?.result?.winners || [];
  const checked = playing && view?.inCheck;
  badge.className = 'turn-badge' + (checked ? ' check' : playing && state!.isMyTurn ? ' your-turn' : '') +
    (status === 'ended' && winners.length ? winners.includes('player') ? ' win' : ' lose' : '');
  badge.textContent = playing
    ? (view?.pending ? (view.pending.by === 'player' ? '等待 Kana 回应…' : '请回应 Kana') : (state!.isMyTurn ? (checked ? '被将军！轮到你' : '轮到你走') : (checked ? '将军！Kana 思考中…' : 'Kana 思考中…')))
    : status === 'ended' ? (!winners.length ? '和棋' : winners.includes('player') ? '你赢了' : 'Kana 获胜') : '等待开局';

  // Labels follow the flip so (1, 1) is always the top-left square from red's side.
  $('coordsX').replaceChildren(...Array.from({ length: 9 }, (_, i) => Object.assign(document.createElement('span'), { textContent: String(flipped ? 9 - i : i + 1) })));
  $('coordsY').replaceChildren(...Array.from({ length: 10 }, (_, i) => Object.assign(document.createElement('span'), { textContent: String(flipped ? 10 - i : i + 1) })));

  const targets = new Map<string, LegalMove>();
  for (const move of view?.legalMoves || []) if (selected && move.fx === selected.x && move.fy === selected.y) targets.set(`${move.tx},${move.ty}`, move);
  const movable = new Set((view?.legalMoves || []).map(m => `${m.fx},${m.fy}`));
  const last = view?.lastMove;
  const checkedGeneral = checked && state!.currentTurn ? (sides[state!.currentTurn] === 'red' ? 'K' : 'k') : '';
  const animateKey = last ? `${view!.moveCount}:${last.tx},${last.ty}` : '';
  points.forEach(({ button, piece }, index) => {
    const col = index % 9, row = Math.floor(index / 9);
    const x = flipped ? 9 - col : col + 1;
    const y = flipped ? 10 - row : row + 1;
    const cell = view?.board[y - 1][x - 1] || null;
    const key = `${x},${y}`;
    button.dataset.x = String(x);
    button.dataset.y = String(y);
    const classes = ['point'];
    if (cell && sideOf(cell) === sides.player) classes.push('mine');
    if (selected?.x === x && selected.y === y) classes.push('selected');
    if (targets.has(key)) classes.push('target', cell ? 'capture' : 'empty');
    if (last && last.fx === x && last.fy === y) classes.push('from');
    if (last && last.tx === x && last.ty === y) classes.push('to');
    if (cell && cell === checkedGeneral) classes.push('check');
    if (animateKey && animateKey !== lastAnimated && last!.tx === x && last!.ty === y) classes.push('moved');
    button.className = classes.join(' ');
    piece.className = cell ? 'piece ' + sideOf(cell) : '';
    piece.textContent = cell ? NAMES[cell] : '';
    button.disabled = !myTurn || !(movable.has(key) || targets.has(key));
    button.setAttribute('aria-label', `${x} 列 ${y} 行，` + (cell ? (sideOf(cell) === 'red' ? '红' : '黑') + NAMES[cell] : '空'));
  });
  lastAnimated = animateKey;

  $('overlay').hidden = playing;
  $('overlay').classList.toggle('ended', status === 'ended');
  $('overlayTitle').textContent = status === 'ended' ? badge.textContent : '新的一局';
  $('overlayText').textContent = status === 'ended' ? state!.result!.reason.replace(/玩家/g, '你').replace(/Agent/g, 'Kana') : '先手执红，红方先走。';
  for (const option of document.querySelectorAll<HTMLButtonElement>('.starter-option')) {
    option.setAttribute('aria-pressed', String(option.dataset.starter === starter));
    option.disabled = !connected || Boolean(pending);
  }
  const start = $<HTMLButtonElement>('startButton');
  start.disabled = !connected || Boolean(pending);
  start.textContent = pending === 'new' ? '正在开局…' : status === 'ended' ? '再来一局' : '开始对局';

  const available = new Set((state?.isMyTurn ? state.availableActions : []).map(action => action.name));
  $('moveInfo').textContent = last ? `第 ${view!.moveCount} 步 · ${who(last.role)}${last.notation}` : '点自己的棋子，再点落点';
  const incoming = playing && view?.pending && view.pending.by === 'agent';
  $('pendingBar').hidden = !incoming;
  if (incoming) $('pendingText').textContent = `Kana ${view!.pending!.type === 'draw' ? '求和' : '请求悔棋'}`;
  for (const id of ['acceptButton', 'declineButton']) $<HTMLButtonElement>(id).disabled = !connected || Boolean(pending);
  $('gameButtons').hidden = !playing || Boolean(incoming);
  $<HTMLButtonElement>('undoButton').disabled = !myTurn || !available.has('request_undo');
  $<HTMLButtonElement>('drawButton').disabled = !myTurn || !available.has('offer_draw');
  $<HTMLButtonElement>('resignButton').disabled = !myTurn || !available.has('resign');

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

const client = connect<XiangqiView>({
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
const respond = (answer: 'accept' | 'decline') => {
  const type = state?.data?.pending?.type;
  if (type) doAction({ action: 'act', move: `${answer}_${type}` });
};
$('startButton').onclick = () => doAction({ action: 'new', starter });
$('acceptButton').onclick = () => respond('accept');
$('declineButton').onclick = () => respond('decline');
$('undoButton').onclick = () => doAction({ action: 'act', move: 'request_undo' });
$('drawButton').onclick = () => doAction({ action: 'act', move: 'offer_draw' });
$('resignButton').onclick = () => { if (confirm('确定认输吗？')) doAction({ action: 'act', move: 'resign' }); };
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
