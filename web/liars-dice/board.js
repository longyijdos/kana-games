export const name = '大话骰';
export const rules = [
  '双方各有 5 颗骰子，共 10 颗。只能看到自己的骰子，开盅后才公开双方骰子。',
  '叫点包含数量与点数，例如「3 个 4」。数量为 2～10，点数为 1～6。',
  '后续叫点必须增加数量，或在相同数量下增加点数。',
  '1 点默认万能。任何一方叫过 1 点后，本局 1 点永久失去通配属性。',
  '轮到你且已经有人叫点时，可以开盅。实际数量够则叫点方获胜，不够则开盅方获胜。'
];
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function createDie(point, highlighted = false) {
  const die = document.createElement('div');
  die.className = 'pixel-die' + (highlighted ? ' highlight' : '');
  die.setAttribute('aria-label', point + ' 点');
  for (let index = 0; index < 9; index++) {
    const cell = document.createElement('span');
    if (PIPS[point].includes(index)) {
      const pip = document.createElement('i');
      pip.className = 'pip' + (point === 1 ? ' red' : '');
      cell.appendChild(pip);
    }
    die.appendChild(cell);
  }
  return die;
}

export function mount({ stage, controls, act }) {
  stage.innerHTML = `<div class="dice-table">
    <div id="opponentRack" class="dice-rack" aria-label="Kana 的骰子尚未公开"></div>
    <div class="table-center">
      <div id="bidLabel" class="bid-label"></div>
      <div id="bidValue" class="bid-value"></div>
      <span id="wildPill" class="wild-pill"></span>
      <div id="resultDetails" class="result-details" hidden></div>
    </div>
    <div id="playerRack" class="dice-rack" aria-label="你的骰子"></div>
  </div>`;
  controls.innerHTML = `<div class="move-heading"><strong>你的出招</strong><span id="moveNote"></span></div>
    <div id="bidControls" class="bid-controls">
      <div><span class="control-label">数量</span><div class="stepper">
        <button id="minusButton" type="button" aria-label="减少数量">−</button>
        <output id="draftCount" class="pixel"></output>
        <button id="plusButton" type="button" aria-label="增加数量">+</button>
      </div></div>
      <div><span class="control-label">点数</span><div id="pointPicker" class="point-picker"></div></div>
    </div>
    <p id="draftHint" class="draft-hint"></p>
    <div id="actionButtons" class="action-buttons">
      <button id="callButton" class="pixel-btn primary" type="button"></button>
      <button id="openButton" class="pixel-btn danger" type="button">开盅！</button>
    </div>`;
  const $ = id => stage.querySelector('#' + id) || controls.querySelector('#' + id);
  let state;
  let context;
  let draft = { count: 2, point: 2 };
  let draftTouched = false;
  let bidKey = '';
  const minimumCount = point => {
    const bid = state?.data?.currentBid;
    return bid ? bid.count + (point <= bid.point ? 1 : 0) : 2;
  };

  function renderRack(id, dice, placeholder, highlightPoint, wild) {
    const rack = $(id);
    rack.replaceChildren();
    if (dice?.length) {
      for (const point of dice) rack.appendChild(createDie(point, point === highlightPoint || wild && point === 1));
      rack.setAttribute('aria-label', (id === 'playerRack' ? '你的骰子：' : 'Kana 的骰子：') + dice.join('、'));
    } else {
      for (let index = 0; index < 5; index++) {
        const die = document.createElement('div');
        die.className = 'pixel-die hidden-die pixel';
        die.textContent = placeholder;
        rack.appendChild(die);
      }
      rack.setAttribute('aria-label', id === 'opponentRack' ? 'Kana 的骰子尚未公开' : '等待摇骰');
    }
  }

  function renderControls() {
    const playing = state.status === 'playing';
    const canChoose = context.connected && playing && !context.pendingAction;
    const legal = minimumCount(draft.point) <= 10;
    $('draftCount').textContent = draft.count;
    $('minusButton').disabled = !canChoose || draft.count <= minimumCount(draft.point);
    $('plusButton').disabled = !canChoose || draft.count >= 10;
    for (const button of $('pointPicker').children) {
      const point = Number(button.dataset.point);
      button.disabled = !canChoose || minimumCount(point) > 10;
      button.setAttribute('aria-pressed', String(point === draft.point));
    }
    $('bidControls').hidden = !legal;
    $('callButton').hidden = !legal;
    $('callButton').disabled = !context.canAct || !legal;
    $('callButton').textContent = context.pendingAction === 'call' ? '正在叫点…' : `叫 ${draft.count} 个 ${draft.point}`;
    $('openButton').disabled = !context.canAct || !state.data?.currentBid;
    $('openButton').textContent = context.pendingAction === 'open' ? '正在开盅…' : '开盅！';
    $('actionButtons').classList.toggle('only-open', !legal);
    $('moveNote').textContent = state.isMyTurn ? '' : '未轮到你，可预设点数';
    $('draftHint').classList.toggle('warning', !legal || draft.point === 1 && state.data?.onesAreWild);
    $('draftHint').textContent = !playing ? '' : !legal ? '已无合法叫点，只能开盅！' :
      draft.point === 1 && state.data.onesAreWild ? '叫 1 点后，本局 1 点将失去通配属性！' :
      `继续叫该点数至少要 ${minimumCount(draft.point)} 个`;
  }

  for (let point = 1; point <= 6; point++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'point-option';
    button.dataset.point = point;
    button.setAttribute('aria-label', '选择 ' + point + ' 点');
    button.appendChild(createDie(point));
    const label = document.createElement('span');
    label.textContent = point + ' 点';
    button.appendChild(label);
    button.onclick = () => {
      draftTouched = true;
      draft.point = point;
      draft.count = Math.max(draft.count, minimumCount(point));
      renderControls();
    };
    $('pointPicker').appendChild(button);
  }
  $('minusButton').onclick = () => { draftTouched = true; draft.count--; renderControls(); };
  $('plusButton').onclick = () => { draftTouched = true; draft.count++; renderControls(); };
  $('callButton').onclick = () => act('call', { ...draft });
  $('openButton').onclick = () => act('open');

  return {
    render(next, ui) {
      state = next;
      context = ui;
      const data = state.data || {};
      const bid = data.currentBid;
      const nextBidKey = JSON.stringify(bid);
      if (ui.reset) { draft = { count: 2, point: 2 }; draftTouched = false; }
      else if (nextBidKey !== bidKey && bid) {
        if (bid.bidder === 'player') draftTouched = false;
        if (!draftTouched) draft = bid.point < 6 ? { count: bid.count, point: bid.point + 1 } : { count: bid.count + 1, point: 6 };
      }
      bidKey = nextBidKey;
      if (minimumCount(draft.point) > 10) {
        const point = [1, 2, 3, 4, 5, 6].find(point => minimumCount(point) <= 10);
        if (point) draft = { count: minimumCount(point), point };
      } else { draft.count = Math.max(minimumCount(draft.point), Math.min(10, draft.count)); }
      const wild = Boolean(bid && bid.point !== 1 && data.onesAreWild);
      renderRack('playerRack', data.myDice, '−', bid?.point, wild);
      renderRack('opponentRack', data.opponentDice, '?', bid?.point, wild);
      $('bidLabel').textContent = bid ? bid.bidder === 'player' ? '你的叫点' : 'Kana 的叫点' : '双方各扣 5 颗';
      $('bidValue').replaceChildren();
      if (bid) {
        const number = document.createElement('span');
        number.className = 'bid-number pixel';
        number.textContent = bid.count;
        const unit = document.createElement('span');
        unit.textContent = '个';
        $('bidValue').append(number, unit, createDie(bid.point));
        $('bidValue').setAttribute('aria-label', `${bid.count} 个 ${bid.point} 点`);
      } else {
        const title = document.createElement('span');
        title.className = 'stage-title';
        title.textContent = state.status === 'playing' ? state.isMyTurn ? '由你先手叫点' : '等待 Kana 起叫…' : '骰盅就绪';
        $('bidValue').appendChild(title);
        $('bidValue').removeAttribute('aria-label');
      }
      $('wildPill').textContent = data.onesAreWild === false ? '1 点不通配' : '1 点万能';
      $('resultDetails').hidden = state.status !== 'ended';
      $('resultDetails').textContent = state.result?.reason || '';
      renderControls();
      return { agent: '5 颗骰子 · 开盅前保密', player: '5 颗骰子 · 只有你能看到' };
    },
    onEvent(event, state, audio) {
      if (event.type === 'game_start') {
        $('playerRack').classList.remove('rolling');
        void $('playerRack').offsetWidth;
        $('playerRack').classList.add('rolling');
        audio.sfxDiceShake();
      } else if (event.type === 'action_call') {
        $('bidValue').classList.remove('just-bid');
        void $('bidValue').offsetWidth;
        $('bidValue').classList.add('just-bid');
        audio.sfxBeep(680, .09);
      } else if (event.type === 'action_open') { audio.sfxOpenImpact(); }
    }
  };
}
