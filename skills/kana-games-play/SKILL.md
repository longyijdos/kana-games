---
name: kana-games-play
description: Play turn-based games with one human and one Agent using the kana-games CLI and a local web UI. Use when the user wants to play a built-in or custom board, dice, or card game, or continue an existing match.
---

# Turn-Based Games

Use `kana-games` for all game interaction. The user plays in the browser; the
Agent acts through the CLI. The server validates actions and maintains the game.

## Dependencies

Requires Node.js 22.18 or newer and the `kana-games` executable:

```sh
npm install --global kana-games
kana-games --version
```

`kana-games install <claude|codex|kana|dir>...` installs this skill,
`kana-games-create`, and (for Claude Code, Codex and Kana) the
`kana-games-player` companion subagent. Add `--skills-only` to skip the
subagent and `--force` to update after upgrading kana-games.

## Games

Built-in games have a reference with rules and strategy notes:

- [大话骰 / Liar's Dice](references/liars-dice.md) — `liars-dice`
- [五子棋 / Gomoku](references/gomoku.md) — `gomoku`

Custom games are directories (see the `kana-games-create` skill). For
any game, `kana-games rules` prints the rules from the running server; read
them before the first move of an unfamiliar game.

## Start and Observe

Use `kana-games status --json` to inspect an existing service. If none is
running, start one with the host's background process facility:

```sh
kana-games serve gomoku          # built-in game
kana-games serve ./my-game       # custom game directory
```

Tell the user to open the printed URL, `http://127.0.0.1:3456/`. Use
`--port <port>` consistently on server and client for another port.
The service is local, holds one game in memory, and does not automatically
start a match. The user can choose the starter in the page, or the Agent can
run `kana-games new --starter player` (`agent` to move first).
A running game must finish before a new one starts. To switch games, stop the
server and serve the other game.

Read `state.isMyTurn`, `state.availableActions`, `state.data`, and the visible
history. Never use server internals to inspect the opponent's hidden state.
Available actions are empty when it is not the Agent's turn.

## Companion Subagent (preferred)

If the host has a `kana-games-player` subagent (installed by
`kana-games install claude|codex|kana`), hand the match to it so this
conversation stays free:

1. Start `kana-games serve <game> --port <port>` as a background job you own.
2. Tell the user the URL and that Kana is waiting at the table.
3. Spawn `kana-games-player` in the background with a task such as
   "Play the gomoku match on port 3456 with the user." Add anything it should
   know (the user's language, whether to start the game itself).
4. Do not run `wait`, `act`, or `talk` on that port while it plays; it owns the
   CLI's event cursor.
5. When it finishes, relay its short report if useful and stop the server.

The subagent only plays; it never starts or stops servers. Without such a
subagent, play directly as described below.

## Act and Talk

```sh
kana-games act <action> --args '<JSON object>' -m 'Your message'
kana-games talk 'Your message'
```

Omit `--args` when the action has no parameters. `availableActions` lists
each parameter as an integer with `min`/`max` or an `enum`.

Communicate in-game using `-m` or `talk`: the human stays in the browser and
does not see terminal chat. Talking does not consume the turn.
Commands return immediately with the latest state and advance the CLI's event
cursor. Invalid actions return an error without changing the game; use the
returned state to correct the move.

## Wait and Continue

After handing the turn to the human, run `kana-games wait` using the host's
background job facility with completion notification **before finishing the
Agent's chat turn**. A detached shell process alone does not arrange
notification. If the host has no completion notification, keep the Agent turn
active while waiting.

```sh
kana-games wait --json
```

When the job completes, consume its output:

- If `state.isMyTurn` is true, choose and submit an action.
- If only a chat message arrived and the human still has the turn, respond with
  `talk` if useful, then start another background `wait`.
- If `timedOut` is true, continue waiting. A timeout does not end the match.
- If `state.status` is `ended`, acknowledge the result in-game. Start a new match
  only when the user wants to continue; use `wait` if the user will start it.

`wait` returns unread events or the Agent's turn, with a ten-minute timeout;
`--timeout <seconds>` shortens it when the host limits command duration.

## Output and Cleanup

Use `--json` for structured responses: `success`, `state`, `events`, `seq`,
`timedOut`. `state.summary` is the game's readable text view. API errors
include the latest state; errors exit with code 1, successful waits (including
timeouts) exit 0.

The CLI keeps the server token and event cursor in `~/.kana-games/<port>.json`.
Use `--after <seq>` only to re-read from a specific event.

When the user finishes playing, stop the waiting job and the server process
using the host's process tools. The server runs in the foreground.
