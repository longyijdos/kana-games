import { connect } from '/_kana/client.js';
import type { ActionPayload, GameState, HistoryEntry, Role } from '/_kana/client.js';
import type { DiceDetails, DiceView } from '../game.js';
import { initAudio, sfxBeep, sfxDiceShake, sfxOpenImpact, sfxWin, sfxLose, toggleAudio } from './audio.js';

type DiceState = GameState<DiceView, DiceDetails>;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const PIPS: Record<number, number[]> = { 1: [4], 2: [0,8], 3: [0,4,8], 4: [0,2,6,8], 5: [0,2,4,6,8], 6: [0,2,3,5,6,8] };
let state: DiceState | null = null;
let connected = false;
let pendingAction = '';
let starter: Role = 'player';
let draft = { count: 2, point: 2 };
let draftTouched = false;
let historyKey = '';

function createDie(point: number, highlighted = false) {
  const el = document.createElement('div');
  el.className = 'pixel-die' + (highlighted ? ' highlight' : '');
  el.setAttribute('aria-label', point + ' 点');
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('span');
    if (PIPS[point].includes(i)) {
      const pip = document.createElement('i');
      pip.className = 'pip' + (point === 1 ? ' red' : '');
      cell.appendChild(pip);
    }
    el.appendChild(cell);
  }
  return el;
}

function renderRack(id: 'playerRack' | 'opponentRack', dice: number[] | undefined, placeholder: string, highlightPoint?: number | null, wild?: boolean) {
  const rack = $(id);
  rack.replaceChildren();
  if (dice && dice.length) {
    for (const point of dice) rack.appendChild(createDie(point, point === highlightPoint || (wild && point === 1)));
    rack.setAttribute('aria-label', (id === 'playerRack' ? '你的骰子：' : 'Kana 的骰子：') + dice.join('、'));
  } else {
    for (let i = 0; i < 5; i++) {
      const el = document.createElement('div');
      el.className = 'pixel-die hidden-die pixel';
      el.textContent = placeholder;
      rack.appendChild(el);
    }
    rack.setAttribute('aria-label', id === 'opponentRack' ? 'Kana 的骰子尚未公开' : '等待摇骰');
  }
}

for (let point = 1; point <= 6; point++) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'point-option';
  button.dataset.point = String(point);
  button.setAttribute('aria-label', '选择 ' + point + ' 点');
  button.setAttribute('aria-pressed', point === draft.point ? 'true' : 'false');
  button.appendChild(createDie(point));
  const label = document.createElement('span');
  label.textContent = point + ' 点';
  button.appendChild(label);
  button.onclick = () => {
    draftTouched = true;
    draft.point = point;
    draft.count = Math.max(draft.count, minimumCount(point));
    renderDraft();
  };
  $('pointPicker').appendChild(button);
}

/** Lowest legal count for point, or Infinity when it can no longer be raised. */
function minimumCount(point: number) {
  return state?.data?.minimumCountByPoint[point] ?? (state?.data ? Infinity : 2);
}

function fitDraft(reset: boolean, bidChanged: boolean) {
  if (reset) {
    draft = { count: 2, point: 2 };
    draftTouched = false;
  }
  const bid = state?.data?.currentBid;
  if (!reset && bidChanged && !draftTouched && bid) {
    draft = bid.point < 6 ? { count: bid.count, point: bid.point + 1 } : { count: bid.count + 1, point: 6 };
  }
  if (minimumCount(draft.point) <= 10) {
    draft.count = Math.max(minimumCount(draft.point), Math.min(10, draft.count));
  } else {
    const point = [1,2,3,4,5,6].find(point => minimumCount(point) <= 10);
    if (point) draft = { count: minimumCount(point), point };
  }
}

function renderDraft() {
  const playing = state?.status === 'playing';
  const view = state?.data;
  const canChoose = connected && playing && !pendingAction;
  const legal = playing && draft.count >= minimumCount(draft.point) && draft.count <= 10;
  const canAct = connected && playing && state!.isMyTurn && !pendingAction;
  $('draftCount').textContent = String(draft.count);
  $<HTMLButtonElement>('minusButton').disabled = !canChoose || draft.count <= minimumCount(draft.point);
  $<HTMLButtonElement>('plusButton').disabled = !canChoose || draft.count >= 10;
  for (const button of Array.from($('pointPicker').children) as HTMLButtonElement[]) {
    const point = Number(button.dataset.point);
    button.disabled = !canChoose || minimumCount(point) > 10;
    button.setAttribute('aria-pressed', point === draft.point ? 'true' : 'false');
  }
  const callButton = $<HTMLButtonElement>('callButton');
  const openButton = $<HTMLButtonElement>('openButton');
  $('bidControls').hidden = playing && !legal;
  callButton.hidden = playing && !legal;
  callButton.disabled = !canAct || !legal;
  callButton.textContent = pendingAction === 'call' ? '正在叫点…' : `叫 ${draft.count} 个 ${draft.point}`;
  openButton.disabled = !canAct || !view?.currentBid;
  openButton.textContent = pendingAction === 'open' ? '正在开盅…' : '开盅！';
  $('actionButtons').classList.toggle('only-open', playing && !legal);
  const onesWarning = draft.point === 1 && view?.onesAreWild;
  $('draftHint').classList.toggle('warning', Boolean(playing && (!legal || onesWarning)));
  $('draftHint').textContent = !playing ? '' : !legal ? '数量已达上限（10颗），必须开盅！' :
    onesWarning ? '⚠️ 叫 1 点后，全场 1 点将立即失去通配属性！' :
    view?.currentBid ? `继续叫该点数至少要 ${minimumCount(draft.point)} 个` : '起步最少报 2 个';
}

function refreshControls() {
  const playing = state?.status === 'playing';
  const startButton = $<HTMLButtonElement>('startButton');
  startButton.disabled = !connected || Boolean(pendingAction);
  for (const button of document.querySelectorAll<HTMLButtonElement>('.starter-option')) {
    button.disabled = !connected || Boolean(pendingAction) || playing;
    button.setAttribute('aria-pressed', String(button.dataset.starter === starter));
  }
  startButton.textContent = pendingAction === 'new' ? '正在摇骰…' : state?.status === 'ended' ? '🔄 再来一局' : '🎲 摇骰开局';
  const sendButton = $<HTMLButtonElement>('sendButton');
  sendButton.disabled = !connected || Boolean(pendingAction) || !$<HTMLInputElement>('talkInput').value.trim();
  sendButton.textContent = pendingAction === 'talk' ? '发送中…' : '发送';
  $<HTMLInputElement>('talkInput').disabled = !connected;
  renderDraft();
}

function setConnected(value: boolean) {
  connected = value;
  $('connection').textContent = value ? '骰桌在线' : '连接中…';
  $('connection').className = 'connection ' + (value ? 'online' : 'offline');
  refreshControls();
}

function describe(entry: HistoryEntry) {
  const who = entry.sender === 'player' ? '你' : 'Kana';
  const data = entry.data as { count?: number; point?: number; starter?: Role };
  if (entry.type === 'start') return `大话骰开局！${data.starter === 'player' ? '你' : 'Kana'} 先手`;
  if (entry.type === 'call') return `${who} 叫了 ${data.count} 个 ${data.point} 点`;
  if (entry.type === 'open') return `${who} 喊了开盅！`;
  return entry.text;
}

function renderHistory(history: HistoryEntry[], reset: boolean) {
  const key = JSON.stringify(history);
  if (key === historyKey && !reset) return;
  historyKey = key;
  const list = $('chatHistory');
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 45;
  const scrollTop = list.scrollTop;
  list.replaceChildren();
  if (!history.length) {
    const empty = document.createElement('li');
    empty.className = 'chat-empty';
    empty.textContent = '对局就绪，出招前放句狠话打乱对手节奏吧！';
    list.appendChild(empty);
  }
  for (const entry of history) {
    if (entry.type !== 'talk') {
      const activity = document.createElement('li');
      activity.className = 'chat-activity' + (entry.type === 'start' ? ' system' : '');
      activity.textContent = describe(entry);
      list.appendChild(activity);
    }
    if (entry.message) {
      const message = document.createElement('li');
      message.className = 'chat-message ' + entry.sender;
      const label = document.createElement('span');
      label.className = 'chat-sender';
      label.textContent = entry.sender === 'player' ? '你' : 'Kana';
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      bubble.textContent = entry.message;
      message.append(label, bubble);
      list.appendChild(message);
    }
  }
  list.scrollTop = reset || atBottom ? list.scrollHeight : scrollTop;
}

function renderSpeech(history: HistoryEntry[], role: Role, id: 'agentSpeech' | 'playerSpeech') {
  const last = history.findLast(entry => entry.sender === role && entry.message);
  $(id).textContent = last ? last.message : '';
  $(id).title = last ? last.message : '';
  $(id).className = 'seat-speech' + (last ? ' spoken' + (role === 'player' ? ' player' : '') : '');
}

function renderState(previous: DiceState | null, resetDraft: boolean) {
  const current = state!;
  const view = current.data;
  const playing = current.status === 'playing';
  const ended = current.status === 'ended';
  const bid = view?.currentBid || null;
  const bidChanged = JSON.stringify(previous?.data?.currentBid || null) !== JSON.stringify(bid);
  fitDraft(resetDraft, bidChanged);
  const point = bid && bid.point;
  const wild = Boolean(point && point !== 1 && view!.onesAreWild);
  renderRack('playerRack', view?.myDice, '−', point, wild);
  renderRack('opponentRack', view?.opponentDice, '?', point, wild);
  renderSpeech(current.history, 'agent', 'agentSpeech');
  renderSpeech(current.history, 'player', 'playerSpeech');
  renderHistory(current.history, resetDraft);
  $('movePanel').hidden = !playing;
  $('startControls').hidden = playing;
  $('resultDetails').hidden = !ended;
  $('wildPill').textContent = !view || view.onesAreWild ? '1 点万能' : '1 点不通配';
  const winner = current.result?.winners[0];
  $('agentStatus').textContent = ended ? '已封盅结算' : playing ? current.isMyTurn ? '👉 等你出招' : '🤔 思考中…' : '就绪';
  $('playerStatus').textContent = ended ? '已封盅结算' : playing ? current.isMyTurn ? '👉 轮到你出招' : '⏳ 等待回应…' : '就绪';
  const badge = $('turnBadge');
  badge.className = 'turn-badge';
  badge.textContent = playing ? current.isMyTurn ? '👉 轮到你出招！' : '⏳ Kana 思考中…' : ended ? winner === 'player' ? '🎉 你赢下了这局！' : '😈 Kana 赢下此局！' : '等待开局';
  if (playing) badge.classList.add(current.isMyTurn ? 'your-turn' : 'agent-turn');
  if (ended) badge.classList.add(winner === 'player' ? 'win' : 'lose');
  $('bidLabel').textContent = bid ? (bid.bidder === 'player' ? '你的叫点' : 'Kana 的叫点') : playing ? '等待先手起叫' : '双方各扣 5 颗';
  const value = $('bidValue');
  value.replaceChildren();
  if (bid) {
    const number = document.createElement('span');
    number.className = 'bid-number pixel';
    number.textContent = String(bid.count);
    const unit = document.createElement('span');
    unit.textContent = '个';
    value.append(number, unit, createDie(bid.point));
    value.setAttribute('aria-label', `${bid.count} 个 ${bid.point} 点`);
  } else {
    const title = document.createElement('span');
    title.className = 'stage-title';
    title.textContent = !playing ? '骰盅就绪' : current.isMyTurn ? '由你先手叫点' : '等待 Kana 先手起叫…';
    value.appendChild(title);
    value.removeAttribute('aria-label');
  }
  if (ended) {
    const r = current.result!.details!;
    const line = document.createElement('div');
    line.textContent = `全场实际共有 ${r.actualCount} 个 ${r.targetPoint} 点（先前叫了 ${r.bidCount} 个${r.onesAreWild ? '，含万能 1 点' : ''}）`;
    const reason = document.createElement('div');
    reason.className = 'result-reason';
    const playerOpened = r.opener === 'player';
    reason.textContent = r.actualCount < r.bidCount
      ? playerOpened ? '🎯 抓得漂亮！对方果然在吹牛虚报！' : '😈 被 Kana 抓个正着！吹牛露馅了吧~'
      : playerOpened ? '💥 哎呀开错了！场上点数完全足够！' : '👏 Kana 算漏了！你叫的点数完全成立！';
    $('resultDetails').replaceChildren(line, reason);
  }
  $('moveNote').textContent = current.isMyTurn ? '' : '（未轮到你，可预设点数）';
  refreshControls();
}

const client = connect<DiceView, DiceDetails>({
  onSnapshot(snapshot, reset) {
    const previous = state;
    const started = snapshot.events.some(event => event.type === 'start');
    state = snapshot.state;
    const start = state.history.find(entry => entry.type === 'start');
    if (start) starter = start.data.starter as Role;
    renderState(previous, reset || started || (!previous && state.status === 'playing'));
    for (const event of snapshot.events) {
      if (event.type === 'start') {
        $('playerRack').classList.remove('rolling');
        void $('playerRack').offsetWidth;
        $('playerRack').classList.add('rolling');
        sfxDiceShake();
      } else if (event.type === 'talk') {
        sfxBeep(450, .08);
      } else if (event.type === 'call') {
        $('bidValue').classList.remove('just-bid');
        void $('bidValue').offsetWidth;
        $('bidValue').classList.add('just-bid');
        sfxBeep(680, .09);
      } else if (event.type === 'open') {
        sfxOpenImpact();
        const won = event.data.winner === 'player';
        setTimeout(() => won ? sfxWin() : sfxLose(), 180);
      }
    }
  },
  onConnection(value) {
    setConnected(value);
    if (value) $('actionFeedback').textContent = '';
  },
  onError(err) { $('actionFeedback').textContent = err.message; }
});

async function doAction(payload: ActionPayload) {
  if (pendingAction || !connected) return;
  initAudio();
  pendingAction = payload.action === 'act' ? payload.move : payload.action;
  const feedback = $(payload.action === 'talk' ? 'chatFeedback' : 'actionFeedback');
  feedback.textContent = '';
  refreshControls();
  try {
    await client.send(payload);
    if (payload.action === 'act' && payload.move === 'call') draftTouched = false;
    const input = $<HTMLInputElement>('talkInput');
    if (payload.message && input.value.trim() === payload.message) input.value = '';
  } catch (err) { feedback.textContent = (err as Error).message; }
  finally { pendingAction = ''; refreshControls(); }
}

const talk = () => $<HTMLInputElement>('talkInput').value.trim();
$('minusButton').onclick = () => { draftTouched = true; draft.count--; renderDraft(); };
$('plusButton').onclick = () => { draftTouched = true; draft.count++; renderDraft(); };
for (const button of document.querySelectorAll<HTMLButtonElement>('.starter-option')) {
  button.onclick = () => { starter = button.dataset.starter as Role; refreshControls(); };
}
$('startButton').onclick = () => doAction({ action: 'new', starter });
$('callButton').onclick = () => doAction({ action: 'act', move: 'call', args: { ...draft }, message: talk() });
$('openButton').onclick = () => doAction({ action: 'act', move: 'open', message: talk() });
$('talkInput').oninput = refreshControls;
$('chatForm').onsubmit = event => {
  event.preventDefault();
  if (talk()) doAction({ action: 'talk', message: talk() });
};
$('audioToggle').onclick = () => {
  initAudio();
  const audioEnabled = toggleAudio();
  $('audioToggle').textContent = audioEnabled ? '🔊 音效开' : '🔈 音效关';
  $('audioToggle').setAttribute('aria-pressed', String(audioEnabled));
  sfxBeep(600, .05);
};
const rulesModal = $<HTMLDialogElement>('rulesModal');
$('rulesToggle').onclick = () => rulesModal.showModal();
$('rulesCloseBtn').onclick = () => rulesModal.close();
$('rulesConfirmBtn').onclick = () => rulesModal.close();
rulesModal.onclick = event => { if (event.target === rulesModal) rulesModal.close(); };
renderRack('playerRack', [], '−');
renderRack('opponentRack', [], '?');
renderHistory([], true);
refreshControls();
