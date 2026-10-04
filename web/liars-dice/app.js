import { connect } from '../shared/client.js';
import { initAudio, sfxBeep, sfxDiceShake, sfxOpenImpact, sfxWin, sfxLose, toggleAudio } from './audio.js';

  const $ = id => document.getElementById(id);
  const PIPS = { 1: [4], 2: [0,8], 3: [0,4,8], 4: [0,2,6,8], 5: [0,2,4,6,8], 6: [0,2,3,5,6,8] };
  let gameState = null;
  let connected = false;
  let pendingAction = '';
  let starter = 'player';
  let draft = { count: 2, point: 2 };
  let draftTouched = false;
  let historyKey = '';

  function createDie(point, highlighted = false) {
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

  function renderRack(id, dice, placeholder, highlightPoint, wild) {
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
    button.dataset.point = point;
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

  function minimumCount(point) {
    const bid = gameState && gameState.currentBid;
    return bid ? bid.count + (point <= bid.point ? 1 : 0) : 2;
  }

  function fitDraft(reset, bidChanged) {
    if (reset) {
      draft = { count: 2, point: 2 };
      draftTouched = false;
    }
    if (!reset && bidChanged && !draftTouched && gameState.currentBid) {
      const bid = gameState.currentBid;
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
    const playing = gameState && gameState.status === 'playing';
    const canChoose = connected && playing && !pendingAction;
    const legal = playing && minimumCount(draft.point) <= 10 && draft.count >= minimumCount(draft.point) && draft.count <= 10;
    const canAct = connected && playing && gameState.isMyTurn && !pendingAction;
    $('draftCount').textContent = draft.count;
    $('minusButton').disabled = !canChoose || draft.count <= minimumCount(draft.point);
    $('plusButton').disabled = !canChoose || draft.count >= 10;
    for (const button of $('pointPicker').children) {
      const point = Number(button.dataset.point);
      button.disabled = !canChoose || minimumCount(point) > 10;
      button.setAttribute('aria-pressed', point === draft.point ? 'true' : 'false');
    }
    $('bidControls').hidden = playing && !legal;
    $('callButton').hidden = playing && !legal;
    $('callButton').disabled = !canAct || !legal;
    $('callButton').textContent = pendingAction === 'call' ? '正在叫点…' : `叫 ${draft.count} 个 ${draft.point}`;
    $('openButton').disabled = !canAct || !gameState.currentBid;
    $('openButton').textContent = pendingAction === 'open' ? '正在开盅…' : '开盅！';
    $('actionButtons').classList.toggle('only-open', playing && !legal);
    $('draftHint').classList.toggle('warning', Boolean(playing && (!legal || (draft.point === 1 && gameState.onesAreWild))));
    $('draftHint').textContent = !playing ? '' : !legal ? '数量已达上限（10颗），必须开盅！' :
      draft.point === 1 && gameState.onesAreWild ? '⚠️ 叫 1 点后，全场 1 点将立即失去通配属性！' :
      gameState.currentBid ? `继续叫该点数至少要 ${minimumCount(draft.point)} 个` : '起步最少报 2 个';
  }

  function refreshControls() {
    $('startButton').disabled = !connected || Boolean(pendingAction);
    const playing = gameState && gameState.status === 'playing';
    for (const button of document.querySelectorAll('.starter-option')) {
      button.disabled = !connected || Boolean(pendingAction) || playing;
      button.setAttribute('aria-pressed', String(button.dataset.starter === starter));
    }
    $('startButton').textContent = pendingAction === 'new' ? '正在摇骰…' : gameState && gameState.status === 'ended' ? '🔄 再来一局' : '🎲 摇骰开局';
    $('sendButton').disabled = !connected || Boolean(pendingAction) || !$('talkInput').value.trim();
    $('sendButton').textContent = pendingAction === 'talk' ? '发送中…' : '发送';
    $('talkInput').disabled = !connected;
    renderDraft();
  }

  function setConnected(value) {
    connected = value;
    $('connection').textContent = value ? '骰桌在线' : '连接中…';
    $('connection').className = 'connection ' + (value ? 'online' : 'offline');
    refreshControls();
  }

  function renderHistory(state, reset) {
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
      empty.textContent = '对局就绪，出招前放句狠话打乱对手节奏吧！';
      list.appendChild(empty);
    }
    for (const entry of state.history) {
      const who = entry.sender === 'player' ? '你' : 'Kana';
      if (entry.type !== 'talk') {
        const activity = document.createElement('li');
        activity.className = 'chat-activity' + (entry.type === 'system' ? ' system' : '');
        activity.textContent = entry.type === 'call' ? `${who} 叫了 ${entry.count} 个 ${entry.point} 点` :
          entry.type === 'open' ? `${who} 喊了开盅！` : entry.text;
        list.appendChild(activity);
      }
      if (entry.message) {
        const message = document.createElement('li');
        message.className = 'chat-message ' + entry.sender;
        const label = document.createElement('span');
        label.className = 'chat-sender';
        label.textContent = who;
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        bubble.textContent = entry.message;
        message.append(label, bubble);
        list.appendChild(message);
      }
    }
    list.scrollTop = reset || atBottom ? list.scrollHeight : scrollTop;
  }

  function renderSpeech(state, role, id) {
    const last = [...state.history].reverse().find(entry => entry.sender === role && entry.message);
    $(id).textContent = last ? last.message : '';
    $(id).title = last ? last.message : '';
    $(id).className = 'seat-speech' + (last ? ' spoken' + (role === 'player' ? ' player' : '') : '');
  }

  function renderState(previous, resetDraft) {
    const state = gameState;
    const playing = state.status === 'playing';
    const ended = state.status === 'ended';
    const bidChanged = JSON.stringify(previous && previous.currentBid) !== JSON.stringify(state.currentBid);
    fitDraft(resetDraft, bidChanged);
    const point = state.currentBid && state.currentBid.point;
    const wild = Boolean(point && point !== 1 && state.onesAreWild);
    renderRack('playerRack', state.myDice, '−', point, wild);
    renderRack('opponentRack', state.opponentDice, '?', point, wild);
    renderSpeech(state, 'agent', 'agentSpeech');
    renderSpeech(state, 'player', 'playerSpeech');
    renderHistory(state, resetDraft);
    $('movePanel').hidden = !playing;
    $('startControls').hidden = playing;
    $('resultDetails').hidden = !ended;
    $('wildPill').textContent = state.onesAreWild ? '1 点万能' : '1 点不通配';
    $('agentStatus').textContent = ended ? '已封盅结算' : playing ? state.isMyTurn ? '👉 等你出招' : '🤔 思考中…' : '就绪';
    $('playerStatus').textContent = ended ? '已封盅结算' : playing ? state.isMyTurn ? '👉 轮到你出招' : '⏳ 等待回应…' : '就绪';
    const badge = $('turnBadge');
    badge.className = 'turn-badge';
    badge.textContent = playing ? state.isMyTurn ? '👉 轮到你出招！' : '⏳ Kana 思考中…' : ended ? state.result.winner === 'player' ? '🎉 你赢下了这局！' : '😈 Kana 赢下此局！' : '等待开局';
    if (playing) badge.classList.add(state.isMyTurn ? 'your-turn' : 'agent-turn');
    if (ended) badge.classList.add(state.result.winner === 'player' ? 'win' : 'lose');
    $('bidLabel').textContent = state.currentBid ? (state.currentBid.bidder === 'player' ? '你的叫点' : 'Kana 的叫点') : playing ? '等待先手起叫' : '双方各扣 5 颗';
    const value = $('bidValue');
    value.replaceChildren();
    if (state.currentBid) {
      const number = document.createElement('span');
      number.className = 'bid-number pixel';
      number.textContent = state.currentBid.count;
      const unit = document.createElement('span');
      unit.textContent = '个';
      value.append(number, unit, createDie(point));
      value.setAttribute('aria-label', `${state.currentBid.count} 个 ${point} 点`);
    } else {
      const title = document.createElement('span');
      title.className = 'stage-title';
      title.textContent = playing ? '由你先手叫点' : '骰盅就绪';
      if (playing && !state.isMyTurn) title.textContent = '等待 Kana 先手起叫…';
      value.appendChild(title);
      value.removeAttribute('aria-label');
    }
    if (ended) {
      const r = state.result;
      $('resultDetails').replaceChildren();
      const line = document.createElement('div');
      line.textContent = `全场实际共有 ${r.actualCount} 个 ${r.targetPoint} 点（先前叫了 ${r.bidCount} 个${r.onesAreWild ? '，含万能 1 点' : ''}）`;
      const reason = document.createElement('div');
      reason.style.marginTop = '4px';
      reason.style.fontWeight = 'bold';
      const isPlayerOpener = r.opener === 'player';
      const isSuccess = r.actualCount < r.bidCount;
      if (isSuccess) {
        reason.textContent = isPlayerOpener ? '🎯 抓得漂亮！对方果然在吹牛虚报！' : '😈 被 Kana 抓个正着！吹牛露馅了吧~';
      } else {
        reason.textContent = isPlayerOpener ? '💥 哎呀开错了！场上点数完全足够！' : '👏 Kana 算漏了！你叫的点数完全成立！';
      }
      $('resultDetails').append(line, reason);
    }
    $('moveNote').textContent = state.isMyTurn ? '' : '（未轮到你，可预设点数）';
    refreshControls();
  }


// Adapt the common role view to the original dice renderer.
function diceView(view) {
  const data = view.data || { myDice: [], currentBid: null, onesAreWild: true };
  const types = { game_start: 'system', chat_talk: 'talk', action_call: 'call', action_open: 'open' };
  return {
    ...view, ...data,
    history: view.history.map(entry => ({
      ...entry, ...entry.data,
      sender: entry.type === 'game_start' && !entry.message ? 'system' : entry.sender,
      type: types[entry.type] || entry.type
    })),
    result: view.result ? { ...view.result.details, winner: view.result.winners[0], reason: view.result.reason } : null
  };
}

const client = connect({
  onSnapshot(snapshot, reset) {
    const previous = gameState;
    const started = snapshot.events.some(event => event.type === 'game_start');
    if (reset || started) {
      const start = snapshot.state.history.find(entry => entry.type === 'game_start');
      if (start) starter = start.data.starter;
    }
    gameState = diceView(snapshot.state);
    renderState(previous, reset || started || (!previous && gameState.status === 'playing'));
    for (const event of snapshot.events) {
      if (event.type === 'game_start') {
        if (gameState.status === 'playing') {
          $('playerRack').classList.remove('rolling');
          void $('playerRack').offsetWidth;
          $('playerRack').classList.add('rolling');
        }
        sfxDiceShake();
      } else if (event.type === 'chat_talk') {
        sfxBeep(450, .08);
      } else if (event.type === 'action_call') {
        $('bidValue').classList.remove('just-bid');
        void $('bidValue').offsetWidth;
        $('bidValue').classList.add('just-bid');
        sfxBeep(680, .09);
      } else if (event.type === 'action_open') {
        sfxOpenImpact();
        const won = event.data.result.winners.includes('player');
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

async function doAction(payload) {
  if (pendingAction || !connected) return;
  initAudio();
  pendingAction = payload.action === 'act' ? payload.move : payload.action;
  const feedback = payload.action === 'talk' ? $('chatFeedback') : $('actionFeedback');
  feedback.textContent = '';
  refreshControls();
  try {
    await client.send(payload);
    if (payload.move === 'call') draftTouched = false;
    if (payload.message && $('talkInput').value.trim() === payload.message) $('talkInput').value = '';
  } catch (err) { feedback.textContent = err.message; }
  finally { pendingAction = ''; refreshControls(); }
}

  $('minusButton').onclick = () => { draftTouched = true; draft.count--; renderDraft(); };
  $('plusButton').onclick = () => { draftTouched = true; draft.count++; renderDraft(); };
  for (const button of document.querySelectorAll('.starter-option')) {
    button.onclick = () => { starter = button.dataset.starter; refreshControls(); };
  }
  $('startButton').onclick = () => doAction({ action: 'new', starter });
  $('callButton').onclick = () => doAction({ action: 'act', move: 'call', args: { ...draft }, message: $('talkInput').value.trim() });
  $('openButton').onclick = () => doAction({ action: 'act', move: 'open', message: $('talkInput').value.trim() });
  $('talkInput').oninput = refreshControls;
  $('chatForm').onsubmit = event => {
    event.preventDefault();
    const message = $('talkInput').value.trim();
    if (message) doAction({ action: 'talk', message });
  };
  $('audioToggle').onclick = () => {
    initAudio();
    const audioEnabled = toggleAudio();
    $('audioToggle').textContent = audioEnabled ? '🔊 音效开' : '🔈 音效关';
    $('audioToggle').setAttribute('aria-pressed', String(audioEnabled));
    sfxBeep(600, .05);
  };
  const rulesModal = $('rulesModal');
  $('rulesToggle').onclick = () => rulesModal.showModal();
  $('rulesCloseBtn').onclick = () => rulesModal.close();
  $('rulesConfirmBtn').onclick = () => rulesModal.close();
  rulesModal.onclick = event => { if (event.target === rulesModal) rulesModal.close(); };
  renderRack('playerRack', [], '−');
  renderRack('opponentRack', [], '?');
  renderHistory({ history: [] }, true);
  refreshControls();
