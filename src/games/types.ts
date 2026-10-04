import type { ActionArgs, GameEvent, GameState, Role, RoleView } from '../protocol.js';

export interface EngineOptions {
  starter: Role;
}

export interface GameEngine<Data = unknown, Details = unknown> {
  status: 'playing' | 'ended';
  isMyTurn(role: Role): boolean;
  executeAction(role: Role, move: string, args: ActionArgs): GameEvent;
  getStateForRole(role: Role): RoleView<Data, Details>;
}

export interface GameDefinition<Data = unknown, Details = unknown> {
  id: string;
  name: string;
  Engine: new (options: EngineOptions) => GameEngine<Data, Details>;
  formatState(state: GameState<Data, Details>): string;
}
