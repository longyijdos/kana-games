import { connect } from '../shared/client.js';
import * as game from './board.js';
import * as audio from './audio.js';

const $ = id => document.getElementById(id);
let state = { status: 'waiting', data: null, history: [] };
let connected = false;
let pendingAction = '';
let historyKey = '';
const board = game.mount({
  stage: $('gameArea'), controls: $('movePanel'),
  act: (move, args = {}) => doAction({ action: 'act', move, args })
});

function renderHistory(reset) {
  const key = JSON.stringify(state.history);
  if (key === historyKey && !reset) return;
  historyKey = key;
  const list = $('chatHistory');
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 45;
  const scrollTop = list.scrollTop;
  list.replaceChildren();
  if (!state.history.length) {
    const empty = document.createElement('li');
    empty.className = 'chat-empty';
    empty.textContent = '骰盅就绪，来一局大话骰。\n出招前也可以先聊两句！';
    list.appendChild(empty);
  }
  for (const entry of state.history) {
    if (entry.type !== 'chat_talk') {
      const activity = document.createElement('li');
      activity.className = 'chat-activity' + (entry.type === 'game_start' ? ' system' : '');
      activity.textContent = entry.text;
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

function render(reset = false) {
  const playing = state.status === 'playing';
  const ended = state.status === 'ended';
  const canAct = Boolean(connected && playing && state.isMyTurn && !pendingAction);
  $('starterSelect').disabled = !connected || playing || Boolean(pendingAction);
  $('startButton').disabled = !connected || playing || Boolean(pendingAction);
  $('startButton').textContent = pendingAction === 'new' ? '正在摇骰…' : ended ? '再来一局' : '摇骰开局';
  $('sendButton').disabled = !connected || Boolean(pendingAction) || !$('talkInput').value.trim();
  $('talkInput').disabled = !connected;
  $('movePanel').hidden = !playing;
  $('agentStatus').textContent = playing ? state.isMyTurn ? '等你出招' : '思考中…' : ended ? '已结算' : '就绪';
  $('playerStatus').textContent = playing ? state.isMyTurn ? '轮到你出招' : '等待回应…' : ended ? '已结算' : '就绪';
  const badge = $('turnBadge');
  badge.className = 'turn-badge';
  if (playing) {
    badge.textContent = state.isMyTurn ? '👉 轮到你出招！' : '⏳ Kana 思考中…';
    badge.classList.add(state.isMyTurn ? 'your-turn' : 'agent-turn');
  } else if (ended) {
    const win = state.result.winners.includes('player');
    badge.textContent = win ? '🎉 你赢下了这局！' : '😈 Kana 赢下此局！';
    badge.classList.add(win ? 'win' : 'lose');
  } else { badge.textContent = '等待开局'; }
  const notes = board.render(state, { connected, pendingAction, canAct, starter: $('starterSelect').value, reset });
  $('agentNote').textContent = notes.agent;
  $('playerNote').textContent = notes.player;
  renderHistory(reset);
  for (const role of ['agent', 'player']) {
    const last = [...state.history].reverse().find(entry => entry.sender === role && entry.message);
    const speech = $(role + 'Speech');
    speech.textContent = last?.message || '';
    speech.title = last?.message || '';
    speech.className = 'seat-speech' + (last ? ' spoken ' + role : '');
  }
}

async function doAction(payload) {
  if (pendingAction || !connected) return;
  audio.initAudio();
  const message = payload.message === undefined ? $('talkInput').value.trim() : payload.message;
  pendingAction = payload.action === 'act' ? payload.move : payload.action;
  const feedback = payload.action === 'talk' ? $('chatFeedback') : $('actionFeedback');
  feedback.textContent = '';
  render();
  try {
    await client.send({ ...payload, message });
    if (message && $('talkInput').value.trim() === message) $('talkInput').value = '';
  } catch (err) { feedback.textContent = err.message; }
  finally { pendingAction = ''; render(); }
}

const client = connect({
  onSnapshot(snapshot, reset) {
    state = snapshot.state;
    const start = state.history.find(entry => entry.type === 'game_start');
    if (start) $('starterSelect').value = start.data.starter;
    render(reset || snapshot.events.some(event => event.type === 'game_start'));
    for (const event of snapshot.events) {
      if (event.type === 'chat_talk') audio.sfxBeep(450, .08);
      board.onEvent(event, state, audio);
      if (event.data.result) setTimeout(() => event.data.result.winners.includes('player') ? audio.sfxWin() : audio.sfxLose(), 180);
    }
  },
  onConnection(value) {
    connected = value;
    $('connection').textContent = value ? '骰桌在线' : '连接中…';
    $('connection').className = 'connection ' + (value ? 'online' : 'offline');
    if (value) $('actionFeedback').textContent = '';
    render();
  },
  onError(err) { $('actionFeedback').textContent = err.message; }
});

$('starterSelect').onchange = () => render();
$('startButton').onclick = () => doAction({ action: 'new', starter: $('starterSelect').value });
$('talkInput').oninput = () => render();
$('chatForm').onsubmit = event => {
  event.preventDefault();
  const message = $('talkInput').value.trim();
  if (message) doAction({ action: 'talk', message });
};
$('audioToggle').onclick = () => {
  audio.initAudio();
  const enabled = audio.toggleAudio();
  $('audioToggle').textContent = enabled ? '🔊 音效开' : '🔇 音效关';
  $('audioToggle').setAttribute('aria-pressed', String(enabled));
  audio.sfxBeep(600, .05);
};
$('rulesToggle').onclick = () => {
  $('rulesTitle').textContent = game.name + ' · 玩法说明';
  $('rulesContent').replaceChildren(...game.rules.map(text => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    return paragraph;
  }));
  $('rulesModal').showModal();
};
$('rulesCloseBtn').onclick = $('rulesConfirmBtn').onclick = () => $('rulesModal').close();
$('rulesModal').onclick = event => { if (event.target === $('rulesModal')) $('rulesModal').close(); };
render();
