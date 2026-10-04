---
name: turn-based-games
description: Play turn-based games with one human and one Agent using the kana-games CLI and a local web UI. Use when the user wants to play an integrated board, dice, or card game, or continue an existing match.
---

# Turn-Based Games

Use `kana-games` for all game interaction. The user plays in the browser; the
Agent acts through the CLI. The server validates actions and maintains the game.

## Dependencies

Requires Node.js 22 or newer and the `kana-games` executable from
`@longyijdos/games`. From a local source checkout, install with:

```sh
npm install --global /absolute/path/to/kana-games
kana-games --version
```

The npm package name can be used for registry installation after publication.
Do not assume the source checkout lives inside this skill directory.

## Game References

Read the selected game's reference before playing. Keep rules and game-specific
actions in these documents:

- [大话骰 / Liar's Dice](references/liars-dice.md)
- [五子棋 / Gomoku](references/gomoku.md)

## Start and Observe

Use `kana-games status --json` to inspect an existing service. If no service is
running, start `kana-games serve <game>` with the host's background process
facility. Read the selected reference for the game ID. Tell the user to open
the URL printed by the server: `http://127.0.0.1:3456/<game>/`.

Use `--port <port>` consistently on server and client for a custom port.
The service is local, holds one game in memory, and does not automatically start
a match. The game is fixed at server startup and has its own page and style.
The user can choose the starter in that page, or the Agent can use
`kana-games new --starter player --no-wait`.
The starter defaults to `player`; use `agent` when the Agent should act first.
A running game must finish before a new round can start. To switch games,
stop the server and start it again with the new game ID.

```sh
kana-games games
kana-games status --json
```

Read `state.isMyTurn`, `state.availableActions`, `state.data`, and the visible
history. Never use server internals to inspect the opponent's hidden state.
Available game actions are empty when it is not the Agent's turn.

## Act and Talk

Submit the game's action through the common command:

```sh
kana-games act <action> --args '<JSON object>' -m 'Your message' --no-wait
kana-games talk 'Your message' --no-wait
```

Omit `--args` when the action has no parameters. Use the game's reference and
current `availableActions` to choose arguments.

Communicate in-game using `-m` or `talk`: the human may stay in the browser and
not see terminal chat. Talking does not consume the game turn.
Successful commands print the latest state and advance the CLI's event cursor.
Invalid actions return an error without changing the game; use the returned
state to correct the move.

## Wait and Continue

After handing action to the human, run `kana-games wait` using the host's
background job facility with completion notification **before finishing the
Agent's chat turn**. A detached shell process alone does not arrange host
notification; use the host's job mechanism. If it has no completion notification,
keep the Agent turn active while waiting.

```sh
kana-games wait --json
```

When the job completes, consume its output:

- If `state.isMyTurn` is true, choose and submit a game action.
- If only a chat message arrived and the human still has the turn, respond with
  `talk` if useful, then start another background `wait`.
- If `timedOut` is true, continue waiting. A timeout does not end the match.
- If `state.status` is `ended`, acknowledge the result in-game. Start a new match
  only when the user wants to continue; use `wait` if the user will start it.

`new`, `act`, and `talk` default to automatic waiting. Prefer `--no-wait` plus
the explicit background `wait` pattern so foreground tool timeouts do not
interrupt interaction. `wait` returns unread events or Agent action availability
and has a ten-minute timeout.

## Output and Cleanup

Use `--json` for structured responses. Fields include `success`, `state`,
`events`, `seq`, and `timedOut`. Text output includes a game-specific readable
state. API errors include the latest role-visible state; local errors go to
stderr. Errors exit with code 1; successful waits, including timeouts, exit 0.

The CLI saves its event cursor. Use `--after <seq>` only when deliberately
reading from a specific event sequence.

When the user finishes playing, stop the waiting job and the server process you
started using the host's process tools. The server runs in the foreground;
there is no daemon lifecycle to manage.
