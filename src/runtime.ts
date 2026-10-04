import games from './games/index.js';
import type { GameEvent, GameState, HistoryEntry, EventEntry, Role, RoleView } from './protocol.js';
import type { GameEngine } from './games/types.js';
const roleName = (role: Role) => role === 'player' ? '玩家' : 'Agent';
const visibleTo = (event: GameEvent, role: Role) => !event.audience || event.audience.includes(role);

export class EventLog {
  events: EventEntry[];
  constructor() { this.events = []; }
  get seq() { return this.events.length; }
  append(event: HistoryEntry) {
    const entry = { ...event, seq: this.seq + 1 };
    this.events.push(entry);
    return entry;
  }
  since(after: number, role: Role) { return this.events.slice(after).filter(event => visibleTo(event, role)); }
  hasUnreadOpponentEvents(role: Role, after: number) {
    return this.since(after, role).some(event => event.sender !== role);
  }
}

interface Waiter {
  role: Role;
  eventsOnly: boolean;
  finish(timedOut: boolean): void;
}

export class WaitManager {
  waiters: Set<Waiter>;
  constructor() { this.waiters = new Set(); }
  wait(role: Role, timeoutMs: number, respond: (timedOut: boolean) => void, eventsOnly = false) {
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

export class GameSession {
  gameId: string;
  engine: GameEngine | null;
  history: HistoryEntry[];

  constructor(gameId: string) {
    this.gameId = gameId;
    this.engine = null;
    this.history = [];
  }
  get status() { return this.engine ? this.engine.status : 'waiting'; }
  isMyTurn(role: Role) { return Boolean(this.engine && this.engine.isMyTurn(role)); }

  executeAction(role: Role, payload: Record<string, unknown>) {
    if (payload.message !== undefined && typeof payload.message !== 'string') throw new Error('message 必须是字符串');
    const message = ((payload.message as string | undefined) || '').trim();
    let event: GameEvent;
    if (payload.action === 'new') {
      if (this.status === 'playing') throw new Error('对局进行中，不能重新开局');
      if (payload.game !== undefined) throw new Error('游戏在 serve 时指定，new 不接受 game 参数');
      const starter = payload.starter === undefined ? 'player' : payload.starter;
      if (starter !== 'player' && starter !== 'agent') throw new Error('starter 必须是 player 或 agent');
      const engine = new games[this.gameId].Engine({ starter });
      this.engine = engine;
      this.history = [];
      event = {
        type: 'game_start', data: { game: this.gameId, starter },
        text: `${games[this.gameId].name}对局开启！先手方: ${roleName(starter)}`
      };
    } else if (payload.action === 'talk') {
      if (!message) throw new Error('台词内容不能为空');
      event = { type: 'chat_talk', text: `${roleName(role)}说: ${message}`, data: {} };
    } else if (payload.action === 'act') {
      if (!this.engine) throw new Error('当前游戏尚未开局，请先使用 new');
      if (typeof payload.move !== 'string' || !payload.move) throw new Error('act 需要 move 动作名称');
      const args = payload.args === undefined ? {} : payload.args;
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('args 必须是 JSON 对象');
      event = this.engine.executeAction(role, payload.move, args as Record<string, unknown>);
    } else {
      throw new Error(`未知通用动作: ${payload.action}`);
    }
    const entry = { ...event, sender: role, message };
    this.history.push(entry);
    return entry;
  }

  getStateForRole(role: Role): GameState {
    const view: RoleView = this.engine ? this.engine.getStateForRole(role) : {
      status: 'waiting', phase: null, currentTurn: null, isMyTurn: false,
      data: null, availableActions: [], result: null
    };
    return {
      ...view, role, gameId: this.gameId,
      gameName: games[this.gameId].name,
      history: this.history.filter(event => visibleTo(event, role))
    };
  }
}

