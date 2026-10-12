export type Role = 'player' | 'agent';
export type GameStatus = 'waiting' | 'playing' | 'ended';
export type ActionArgs = Record<string, number>;

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
}

export interface GameEvent {
  type: string;
  text: string;
  data: Record<string, unknown>;
  /** Roles that may see this event; omitted means both. */
  audience?: Role[];
}

export interface HistoryEntry extends GameEvent {
  sender: Role;
  message: string;
}

export interface EventEntry extends HistoryEntry {
  seq: number;
}

export interface GameState<View = unknown, Details = unknown> {
  role: Role;
  gameId: string;
  gameName: string;
  status: GameStatus;
  currentTurn: Role | null;
  isMyTurn: boolean;
  availableActions: AvailableAction[];
  data: View | null;
  summary: string;
  result: GameResult<Details> | null;
  history: HistoryEntry[];
}

export interface Snapshot<View = unknown, Details = unknown> {
  success: boolean;
  state: GameState<View, Details>;
  events: EventEntry[];
  seq: number;
  timedOut: boolean;
  error?: string;
}

export type ApiResponse<View = unknown, Details = unknown> = Snapshot<View, Details> | {
  success: false;
  error: string;
  state?: never;
};

export interface GameInfo {
  id: string;
  name: string;
  rules: string[];
}

export type ActionPayload = (
  | { action: 'new'; starter?: Role }
  | { action: 'act'; move: string; args?: ActionArgs }
  | { action: 'talk' }
) & { message?: string };
