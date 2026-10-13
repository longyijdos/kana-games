import type { ActionArgs, ActionPayload, GameEvent, GameResult, GameState, HistoryEntry, EventEntry, Role } from './protocol.js';
import type { GameDefinition } from './game.js';

const roleName = (role: Role) => role === 'player' ? '玩家' : 'Agent';
const other = (role: Role): Role => role === 'player' ? 'agent' : 'player';
const visibleTo = (event: GameEvent, role: Role) => !event.audience || event.audience.includes(role);

export class EventLog {
  events: EventEntry[] = [];
  get seq() { return this.events.length; }
  append(event: HistoryEntry) {
    const entry = { ...event, seq: this.seq + 1 };
    this.events.push(entry);
    return entry;
  }
  since(after: number, role: Role) { return this.events.slice(after).filter(event => visibleTo(event, role)); }
}

interface Waiter {
  role: Role;
  eventsOnly: boolean;
  finish(timedOut: boolean): void;
}

export class WaitManager {
  waiters = new Set<Waiter>();
  wait(role: Role, timeoutMs: number, respond: (timedOut: boolean) => void, eventsOnly: boolean) {
    const waiter: Waiter = { role, eventsOnly, finish: timedOut => {
      cancel();
      respond(timedOut);
    } };
    const cancel = () => {
      clearTimeout(timer);
      this.waiters.delete(waiter);
    };
    const timer = setTimeout(() => waiter.finish(true), timeoutMs);
    this.waiters.add(waiter);
    return cancel;
  }
  publish(event: HistoryEntry) {
    for (const waiter of this.waiters) {
      if (visibleTo(event, waiter.role) && (waiter.eventsOnly || event.sender !== waiter.role)) waiter.finish(false);
    }
  }
}

function validateArgs(args: Record<string, unknown>, parameters: Record<string, { min?: number; max?: number; enum?: number[] }>) {
  for (const key of Object.keys(args)) {
    if (!Object.hasOwn(parameters, key)) throw new Error(`未知参数: ${key}`);
  }
  for (const [key, rule] of Object.entries(parameters)) {
    const value = args[key];
    if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`参数 ${key} 必须是整数`);
    if ((rule.min !== undefined && value < rule.min) || (rule.max !== undefined && value > rule.max) ||
        (rule.enum && !rule.enum.includes(value))) {
      throw new Error(`参数 ${key} 超出范围: ${JSON.stringify(rule)}`);
    }
  }
  return args as ActionArgs;
}

export class GameSession {
  game: GameDefinition;
  data: unknown = null;
  status: 'waiting' | 'playing' | 'ended' = 'waiting';
  turn: Role | null = null;
  result: GameResult | null = null;
  history: HistoryEntry[] = [];

  constructor(game: GameDefinition) { this.game = game; }
  isMyTurn(role: Role) { return this.status === 'playing' && this.turn === role; }
  context(role: Role) { return { data: this.data, role, opponent: other(role) }; }

  executeAction(role: Role, payload: ActionPayload): HistoryEntry {
    const message = (payload.message || '').trim();
    let event: GameEvent;
    if (payload.action === 'new') {
      if (this.status === 'playing') throw new Error('对局进行中，不能重新开局');
      const starter = payload.starter || 'player';
      if (starter !== 'player' && starter !== 'agent') throw new Error('starter 必须是 player 或 agent');
      this.data = this.game.setup({ starter });
      this.status = 'playing';
      this.turn = starter;
      this.result = null;
      this.history = [];
      event = { type: 'start', data: { starter }, text: `${this.game.name}对局开启！先手方: ${roleName(starter)}` };
    } else if (payload.action === 'talk') {
      if (!message) throw new Error('台词内容不能为空');
      event = { type: 'talk', text: `${roleName(role)}说: ${message}`, data: {} };
    } else if (payload.action === 'act') {
      if (this.status !== 'playing') throw new Error(this.status === 'waiting' ? '尚未开局，请先使用 new' : '对局已结束，可使用 new 开下一局');
      if (!this.isMyTurn(role)) throw new Error('现在不是你的回合');
      const action = this.game.actions(this.context(role)).find(action => action.name === payload.move);
      if (!action) throw new Error(`当前不能执行动作: ${payload.move}`);
      const args = payload.args || {};
      if (typeof args !== 'object' || Array.isArray(args)) throw new Error('args 必须是 JSON 对象');
      const outcome = this.game.act(this.context(role), action.name, validateArgs(args, action.parameters));
      event = outcome.event;
      if (outcome.result) {
        this.status = 'ended';
        this.turn = null;
        this.result = outcome.result;
      } else {
        this.turn = outcome.next || other(role);
      }
    } else {
      throw new Error(`未知动作类型: ${(payload as { action: unknown }).action}`);
    }
    const entry = { ...event, sender: role, message };
    this.history.push(entry);
    return entry;
  }

  getStateForRole(role: Role): GameState {
    const started = this.status !== 'waiting';
    const view = started ? this.game.view({ ...this.context(role), ended: this.status === 'ended', turn: this.turn }) : null;
    return {
      role, gameId: this.game.id, gameName: this.game.name,
      status: this.status, currentTurn: this.turn, isMyTurn: this.isMyTurn(role),
      availableActions: this.isMyTurn(role) ? this.game.actions(this.context(role)) : [],
      data: view, summary: started ? this.game.format(view) : '',
      result: this.result,
      history: this.history.filter(event => visibleTo(event, role))
    };
  }
}
