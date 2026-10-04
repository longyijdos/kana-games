import type { ActionPayload, GameState, Role } from '../../src/protocol.js';
import type { GomokuData } from '../../src/games/gomoku.js';

type Elements = Record<'gameArea' | 'movePanel' | 'chatHistory' | 'turnBadge' | 'agentNote' | 'playerNote' | 'agentSpeech' | 'playerSpeech' | 'chatFeedback' | 'actionFeedback' | 'connection' | 'rulesContent', HTMLElement>
  & Record<'startButton' | 'sendButton' | 'rulesToggle' | 'rulesCloseBtn' | 'rulesConfirmBtn', HTMLButtonElement>
  & { starterSelect: HTMLSelectElement; talkInput: HTMLInputElement; chatForm: HTMLFormElement; rulesModal: HTMLDialogElement };

import { connect } from '../shared/client.js';
import * as game from './board.js';

const $ = <Id extends keyof Elements>(id: Id) => document.getElementById(id) as Elements[Id];
let state: Pick<GameState<GomokuData>, 'status' | 'data' | 'history'> & Partial<GameState<GomokuData>> = { status: 'waiting', data: null, history: [] };
let connected = false;
let pendingAction = '';
let historyKey = '';
const board = game.mount({
  stage: $('gameArea'), controls: $('movePanel'),
  act: (move, args = {}) => doAction({ action: 'act', move, args })
});

function renderHistory(reset: boolean) {
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
    empty.textContent = '棋盘已备好，落下第一子吧。';
    list.appendChild(empty);
  }
  for (const entry of state.history) {
    if (entry.type !== 'chat_talk') {
      const activity = document.createElement('li');
      activity.className = 'chat-activity';
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
  const canAct = Boolean(connected && playing && state.isMyTurn && !pendingAction);
  $('starterSelect').disabled = !connected || playing || Boolean(pendingAction);
  $('startButton').disabled = !connected || playing || Boolean(pendingAction);
  $('startButton').textContent = pendingAction === 'new' ? '正在开局…' : state.status === 'ended' ? '再来一局' : '开始对局';
  $('sendButton').disabled = !connected || Boolean(pendingAction) || !$('talkInput').value.trim();
  $('talkInput').disabled = !connected;
  $('movePanel').hidden = !playing;
  const badge = $('turnBadge');
  badge.className = 'turn-badge';
  if (playing) {
    badge.textContent = state.isMyTurn ? '轮到你落子' : '等待 Kana 落子';
    badge.classList.add(state.isMyTurn ? 'your-turn' : 'agent-turn');
  } else if (state.status === 'ended') {
    const draw = !state.result!.winners.length;
    const win = state.result!.winners.includes('player');
    badge.textContent = draw ? '这局和棋' : win ? '你赢了' : 'Kana 获胜';
    if (!draw) badge.classList.add(win ? 'win' : 'lose');
  } else { badge.textContent = '等待开局'; }
  const notes = board.render(state, { connected, pendingAction, canAct, starter: $('starterSelect').value as Role, reset });
  $('agentNote').textContent = notes.agent;
  $('playerNote').textContent = notes.player;
  renderHistory(reset);
  for (const role of ['agent', 'player']) {
    const last = [...state.history].reverse().find(entry => entry.sender === role && entry.message);
    $(role === 'agent' ? 'agentSpeech' : 'playerSpeech').textContent = last?.message || '';
  }
}

async function doAction(payload: ActionPayload) {
  if (pendingAction || !connected) return;
  const message = payload.message === undefined ? $('talkInput').value.trim() : payload.message;
  pendingAction = payload.action === 'act' ? payload.move : payload.action;
  const feedback = payload.action === 'talk' ? $('chatFeedback') : $('actionFeedback');
  feedback.textContent = '';
  render();
  try {
    await client.send({ ...payload, message });
    if (message && $('talkInput').value.trim() === message) $('talkInput').value = '';
  } catch (err) { feedback.textContent = (err as Error).message; }
  finally { pendingAction = ''; render(); }
}

const client = connect<GomokuData>({
  onSnapshot(snapshot, reset) {
    state = snapshot.state;
    const start = state.history.find(entry => entry.type === 'game_start');
    if (start) $('starterSelect').value = start.data.starter as Role;
    render(reset || snapshot.events.some(event => event.type === 'game_start'));
  },
  onConnection(value) {
    connected = value;
    $('connection').textContent = value ? '已连接' : '连接中…';
    $('connection').className = 'connection ' + (value ? 'online' : 'offline');
    if (value) $('actionFeedback').textContent = '';
    render();
  },
  onError(err) { $('actionFeedback').textContent = (err as Error).message; }
});

$('starterSelect').onchange = () => render();
$('startButton').onclick = () => doAction({ action: 'new', starter: $('starterSelect').value as Role });
$('talkInput').oninput = () => render();
$('chatForm').onsubmit = event => {
  event.preventDefault();
  const message = $('talkInput').value.trim();
  if (message) doAction({ action: 'talk', message });
};
$('rulesToggle').onclick = () => {
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
