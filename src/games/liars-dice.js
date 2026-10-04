const roleName = role => role === 'player' ? '玩家' : 'Agent';
const diceIcons = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

class Engine {
  constructor({ starter }) {
    const roll = () => Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1)
      .sort((a, b) => a - b);
    this.dice = { player: roll(), agent: roll() };
    this.status = 'playing';
    this.phase = 'bidding';
    this.currentTurn = starter;
    this.currentBid = null;
    this.onesAreWild = true;
    this.result = null;
  }

  isMyTurn(role) {
    return this.status === 'playing' && this.currentTurn === role;
  }

  minimumCount(point) {
    return this.currentBid ? this.currentBid.count + (point <= this.currentBid.point ? 1 : 0) : 2;
  }

  executeAction(role, move, args) {
    if (this.status !== 'playing') throw new Error('当前对局已结束');
    if (!this.isMyTurn(role)) throw new Error(`当前不是 ${role} 的行动回合`);
    if (move === 'call') {
      const { count, point } = args;
      if (!Number.isInteger(count) || !Number.isInteger(point) ||
          count < 2 || count > 10 || point < 1 || point > 6 || count < this.minimumCount(point)) {
        throw new Error('叫点不合法：2 至 10 个、点数 1 至 6；数量需更多，或数量相同点数更大');
      }
      if (point === 1) this.onesAreWild = false;
      this.currentBid = { count, point, bidder: role };
      this.currentTurn = role === 'player' ? 'agent' : 'player';
      return {
        type: 'action_call', data: { count, point },
        text: `${roleName(role)} 叫了 ${count} 个 ${point}` + (point === 1 ? '（1点失去通配）' : '')
      };
    }
    if (move !== 'open') throw new Error(`未知大话骰动作: ${move}`);
    if (!this.currentBid) throw new Error('尚未有人叫点，无法喊开');
    const { count: bidCount, point: targetPoint, bidder } = this.currentBid;
    const wild = this.onesAreWild && targetPoint !== 1;
    const actualCount = [...this.dice.player, ...this.dice.agent]
      .filter(point => point === targetPoint || (wild && point === 1)).length;
    const winner = actualCount >= bidCount ? bidder : role;
    this.result = {
      outcome: 'win', winners: [winner],
      reason: `场上实际有 ${actualCount} 个 ${targetPoint}（叫了 ${bidCount} 个），` +
        `${roleName(role)} ${actualCount >= bidCount ? '开错' : '抓虚成功'}，${roleName(winner)} 获胜！`,
      details: { opener: role, bidder, targetPoint, bidCount, actualCount, onesAreWild: wild, allDice: this.dice }
    };
    this.status = 'ended';
    this.phase = 'resolved';
    this.currentTurn = null;
    return {
      type: 'action_open', data: { result: this.result },
      text: `${roleName(role)} 喊了开！【${roleName(winner)}获胜】`
    };
  }

  availableActions(role) {
    if (!this.isMyTurn(role)) return [];
    const minimumCountByPoint = Object.fromEntries([1, 2, 3, 4, 5, 6]
      .filter(point => this.minimumCount(point) <= 10)
      .map(point => [point, this.minimumCount(point)]));
    const actions = [];
    if (Object.keys(minimumCountByPoint).length) {
      actions.push({
        name: 'call', description: '叫点，数量至少满足对应点数的最低数量',
        parameters: {
          count: { type: 'integer', min: 2, max: 10 },
          point: { type: 'integer', enum: Object.keys(minimumCountByPoint).map(Number) }
        },
        minimumCountByPoint
      });
    }
    if (this.currentBid) actions.push({ name: 'open', description: '开盅，挑战当前叫点', parameters: {} });
    return actions;
  }

  getStateForRole(role) {
    const opponent = role === 'player' ? 'agent' : 'player';
    return {
      status: this.status, phase: this.phase, currentTurn: this.currentTurn,
      isMyTurn: this.isMyTurn(role), result: this.result,
      availableActions: this.availableActions(role),
      data: {
        myDice: this.dice[role], opponentDiceCount: this.dice[opponent].length,
        ...(this.status === 'ended' ? { opponentDice: this.dice[opponent] } : {}),
        currentBid: this.currentBid, onesAreWild: this.onesAreWild
      }
    };
  }
}

function formatState({ data, status }) {
  const lines = [`你的骰子: ${data.myDice.map(point => `${diceIcons[point]} (${point})`).join(' ')}`];
  if (status === 'ended') lines.push(`对手骰子: ${data.opponentDice.map(point => `${diceIcons[point]} (${point})`).join(' ')}`);
  lines.push(`万能1点: ${data.onesAreWild ? '有效' : '已失效'}`);
  const bid = data.currentBid;
  lines.push(bid ? `当前叫点: ${bid.count} 个 ${bid.point}（${roleName(bid.bidder)}叫出）` : '当前无人叫点。');
  return lines.join('\n');
}

module.exports = { id: 'liars-dice', name: '大话骰', Engine, formatState };
