export type Role = 'player' | 'agent';
export type GameStatus = 'waiting' | 'playing' | 'ended';
export type ActionArgs = Record<string, unknown>;

export interface GameResult<Details = unknown> {
  outcome: 'win' | 'draw';
  winners: Role[];
  reason: string;
  details?: Details;
}

export interface ActionParameter {
  type: 'integer';
  min?: number;
  max?: number;
  enum?: number[];
}

export interface AvailableAction {
  name: string;
  description: string;
  parameters: Record<string, ActionParameter>;
  minimumCountByPoint?: Record<number, number>;
}

export interface GameEvent {
  type: string;
  text: string;
  data: Record<string, unknown>;
  audience?: Role[];
}

export interface HistoryEntry extends GameEvent {
  sender: Role;
  message: string;
}

export interface EventEntry extends HistoryEntry {
  seq: number;
}

export interface RoleView<Data = unknown, Details = unknown> {
  status: GameStatus;
  phase: string | null;
  currentTurn: Role | null;
  isMyTurn: boolean;
  result: GameResult<Details> | null;
  availableActions: AvailableAction[];
  data: Data | null;
}

export interface GameState<Data = unknown, Details = unknown> extends RoleView<Data, Details> {
  role: Role;
  gameId: string;
  gameName: string;
  history: HistoryEntry[];
}

export interface Snapshot<Data = unknown, Details = unknown> {
  success: boolean;
  state: GameState<Data, Details>;
  events: EventEntry[];
  seq: number;
  timedOut: boolean;
  error?: string;
}

export type ApiResponse<Data = unknown, Details = unknown> = Snapshot<Data, Details> | {
  success: false;
  error: string;
  state?: never;
};

export type ActionPayload = (
  | { action: 'new'; starter?: Role }
  | { action: 'act'; move: string; args?: ActionArgs }
  | { action: 'talk' }
) & { message?: string };

export interface WaitPayload {
  after: number;
  timeoutMs?: number;
  waitFor?: 'event' | 'event-or-turn';
}

export type ActionRequest = ActionPayload & {
  after?: number;
  timeoutMs?: number;
  wait?: 'none' | 'auto';
};
