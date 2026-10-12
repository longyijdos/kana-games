import type { AvailableAction, GameDefinition, Role } from '../../src/index.js';

export interface Bid {
  count: number;
  point: number;
  bidder: Role;
}

export interface DiceData {
  dice: Record<Role, number[]>;
  currentBid: Bid | null;
  onesAreWild: boolean;
}

export interface DiceView {
  myDice: number[];
  /** Revealed only after the round is resolved. */
  opponentDice?: number[];
  currentBid: Bid | null;
  onesAreWild: boolean;
  /** Lowest legal bid count for each point; points that cannot be raised are omitted. */
  minimumCountByPoint: Record<number, number>;
}

export interface DiceDetails {
  opener: Role;
  bidder: Role;
  targetPoint: number;
  bidCount: number;
  actualCount: number;
  onesAreWild: boolean;
  allDice: Record<Role, number[]>;
}

const MAX_COUNT = 10;
const roleName = (role: Role) => role === 'player' ? '玩家' : 'Agent';
const diceIcons = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const roll = () => Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1).sort((a, b) => a - b);

function minimumCounts(bid: Bid | null) {
  const counts: Record<number, number> = {};
  for (let point = 1; point <= 6; point++) {
    const count = bid ? bid.count + (point <= bid.point ? 1 : 0) : 2;
    if (count <= MAX_COUNT) counts[point] = count;
  }
  return counts;
}

export default {
  id: 'liars-dice',
  name: '大话骰',
  rules: [
    '双方各摇 5 颗骰子，只能看到自己的骰子，场上共 10 颗。',
    '叫点是猜测「双方合计某点数有几个」，最少 2 个起叫。之后要么叫更多数量，要么数量相同但点数更大。',
    '1 点默认是万能的，可以当作任意点数计入。一旦有人叫了 1 点，本局 1 点不再通配。',
    '轮到自己且已有人叫点时可以开盅：实际数量不少于叫点则叫点方获胜，否则开盅方获胜。'
  ],

  setup() {
    return { dice: { player: roll(), agent: roll() }, currentBid: null, onesAreWild: true };
  },

  actions({ data }): AvailableAction[] {
    const actions: AvailableAction[] = [];
    const points = Object.keys(minimumCounts(data.currentBid)).map(Number);
    if (points.length) {
      actions.push({
        name: 'call', description: '叫点；数量不得低于 view 中 minimumCountByPoint 对应点数的值',
        parameters: { count: { type: 'integer', min: 2, max: MAX_COUNT }, point: { type: 'integer', enum: points } }
      });
    }
    if (data.currentBid) actions.push({ name: 'open', description: '开盅，挑战当前叫点', parameters: {} });
    return actions;
  },

  act({ data, role }, move, { count, point }) {
    if (move === 'call') {
      const minimum = minimumCounts(data.currentBid)[point];
      if (count < minimum) throw new Error(`叫 ${point} 点至少要 ${minimum} 个`);
      if (point === 1) data.onesAreWild = false;
      data.currentBid = { count, point, bidder: role };
      return {
        event: { type: 'call', data: { count, point }, text: `${roleName(role)} 叫了 ${count} 个 ${point}` + (point === 1 ? '（1点失去通配）' : '') }
      };
    }
    const { count: bidCount, point: targetPoint, bidder } = data.currentBid!;
    const wild = data.onesAreWild && targetPoint !== 1;
    const actualCount = [...data.dice.player, ...data.dice.agent]
      .filter(value => value === targetPoint || (wild && value === 1)).length;
    const winner = actualCount >= bidCount ? bidder : role;
    return {
      event: { type: 'open', data: { winner }, text: `${roleName(role)} 喊了开！【${roleName(winner)}获胜】` },
      result: {
        outcome: 'win', winners: [winner],
        reason: `场上实际有 ${actualCount} 个 ${targetPoint}（叫了 ${bidCount} 个），` +
          `${roleName(role)} ${actualCount >= bidCount ? '开错' : '抓虚成功'}，${roleName(winner)} 获胜！`,
        details: { opener: role, bidder, targetPoint, bidCount, actualCount, onesAreWild: wild, allDice: data.dice }
      }
    };
  },

  view({ data, role, opponent, ended }) {
    return {
      myDice: data.dice[role],
      ...(ended ? { opponentDice: data.dice[opponent] } : {}),
      currentBid: data.currentBid, onesAreWild: data.onesAreWild,
      minimumCountByPoint: minimumCounts(data.currentBid)
    };
  },

  format(view) {
    const show = (dice: number[]) => dice.map(point => `${diceIcons[point]} (${point})`).join(' ');
    const bid = view.currentBid;
    return [
      `你的骰子: ${show(view.myDice)}`,
      ...(view.opponentDice ? [`对手骰子: ${show(view.opponentDice)}`] : []),
      `万能1点: ${view.onesAreWild ? '有效' : '已失效'}`,
      bid ? `当前叫点: ${bid.count} 个 ${bid.point}（${roleName(bid.bidder)}叫出）` : '当前无人叫点。'
    ].join('\n');
  }
} satisfies GameDefinition<DiceData, DiceView, DiceDetails>;
