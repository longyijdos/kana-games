import type { ActionArgs, AvailableAction, GameEvent, GameResult, Role } from './protocol.js';

export interface GameContext<Data> {
  /** Game data returned by setup. act may mutate it in place. */
  data: Data;
  /** The acting or observing role. */
  role: Role;
  opponent: Role;
}

export interface ActOutcome<Details = unknown> {
  event: GameEvent;
  /** Ends the game when set. */
  result?: GameResult<Details>;
  /** Who acts next; defaults to the opponent. Ignored once the game ends. */
  next?: Role;
}

/**
 * A turn-based game for one player and one agent. The framework tracks the turn,
 * status and result, rejects actions out of turn, and validates args against
 * the parameters declared in actions() before calling act().
 */
export interface GameDefinition<Data = any, View = unknown, Details = unknown> {
  id: string;
  name: string;
  /** Short rule paragraphs shown by `kana-games rules` and available to pages. */
  rules: string[];
  setup(options: { starter: Role }): Data;
  /** Actions available to role on its turn. */
  actions(context: GameContext<Data>): AvailableAction[];
  /** Apply a validated action. Throw an Error to reject it without changes. */
  act(context: GameContext<Data>, move: string, args: ActionArgs): ActOutcome<Details>;
  /** What role may see. Hide the opponent's secrets here. */
  view(context: GameContext<Data> & { ended: boolean }): View;
  /** Plain-text rendering of a view for the CLI. */
  format(view: View): string;
}
