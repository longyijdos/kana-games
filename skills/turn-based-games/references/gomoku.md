# 五子棋 / Gomoku

Game ID: `gomoku`. Start the server with `kana-games serve gomoku` and open
`http://127.0.0.1:3456/`.

## Rules and Coordinates

- A 15×15 board, with one user and one Agent.
- The starter plays black; the other participant plays white. Black moves first.
- Participants alternate placing a stone on an empty intersection.
- Five or more consecutive stones of one color horizontally, vertically, or
  diagonally win. There are no forbidden moves; an overline also wins.
- A full board without a winner is a draw.
- On your turn, you may resign; the opponent wins.
- Coordinates are integers 1–15: `x` increases left to right, `y` increases
  top to bottom. The top-left intersection is `(1, 1)` and the center is `(8, 8)`.

## Start and Observe

```sh
kana-games new --starter player -m '你执黑先行。'
kana-games status --json
```

`state.data` contains:

| Field | Meaning |
| --- | --- |
| `size` | Board width and height, 15 |
| `board` | Rows indexed by `y - 1`, columns by `x - 1`; cells are `null`, `"black"`, or `"white"` |
| `colors` | Color assigned to `player` and `agent` |
| `myColor` | The observing participant's color |
| `lastMove` | Latest `{ x, y, color, role }`, or `null` |
| `moveCount` | Number of placed stones |
| `winningLine` | Winning intersections, or an empty array |

The board is public. Text output uses `X` for black, `O` for white, and `.` for
an empty intersection. Row labels are `y`; column labels are `x`.

## Actions

### Place: `place`

Choose an empty intersection from the current board before submitting:

```sh
kana-games act place --args '{"x":8,"y":8}' -m '先占个中心。'
```

Occupied intersections, out-of-range
coordinates, and actions outside the Agent's turn return an error without
changing the board.

### Resign: `resign`

```sh
kana-games act resign -m '这局认输，下一局再来。'
```

No arguments. Available on the Agent's turn while the game is playing.

## Continue and Finish

After placing a stone, check whether the response has ended the game. If it
continues with the human's turn, launch a background `kana-games wait` through
the host's job mechanism.

`state.result.outcome` is `win` or `draw`. A win has one role in `winners`; a
draw has an empty `winners` array. Use `reason` for the readable result.
Read the common skill for chatting, waiting, starting the next game, and cleanup.
