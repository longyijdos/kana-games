# 中国象棋 / Xiangqi

Game ID: `xiangqi`. Start the server with `kana-games serve xiangqi` and open
`http://127.0.0.1:3456/`. `kana-games rules` prints the full rules.

## Board and Coordinates

- 9 files × 10 ranks. `x` is 1–9 left to right, `y` is 1–10 top to bottom,
  always from red's side: black starts on `y` 1–5, red on `y` 6–10.
- The starter plays red and moves first.
- Pieces are FEN-style letters, uppercase red and lowercase black:
  `K` general, `A` advisor, `B` elephant, `N` horse, `R` chariot,
  `C` cannon, `P` soldier. The text board uses distinct glyphs
  (red 帥仕相傌俥炮兵, black 將士象馬車砲卒).
- Notation follows Chinese convention: red files are 一–九 from red's right
  (`x` 9 → 一), black files are １–９ from black's right (`x` 1 → １).
  `炮二平五` moves red's cannon from `x` 8 to `x` 5.

## State

`state.data` contains:

| Field | Meaning |
| --- | --- |
| `board` | Rows indexed by `y - 1`, columns by `x - 1`; cells are a piece letter or `null` |
| `sides`, `mySide` | `red` or `black` for each role and for you |
| `turn` | The role to act next, or `null` after the game ends |
| `lastMove` | `{ fx, fy, tx, ty, piece, captured, notation, role }`, or `null` |
| `captured` | Pieces each side has captured |
| `inCheck` | Whether the side to move is in check |
| `pending` | An open `{ type: 'draw' \| 'undo', by }` request, or `null` |
| `legalMoves` | On your turn, every legal move as `{ fx, fy, tx, ty, notation }` |

Choose moves from `legalMoves`; it already excludes moves that leave your
general in check or face the generals on an open file.

## Actions

```sh
kana-games act move --args '{"fx":8,"fy":8,"tx":5,"ty":8}' -m '当头炮！'
kana-games act resign
kana-games act offer_draw -m '这盘握手言和？'
kana-games act request_undo -m '刚才那步手滑了'
```

- `offer_draw` and `request_undo` (take back both sides' last moves) hand the
  turn to the opponent, whose only actions become `accept_*` or `decline_*`.
  Each side may make one such request per turn.
- When the user asks, answer with `accept_draw` / `decline_draw` or
  `accept_undo` / `decline_undo`, and say why in a line of table talk.

## Endings

Checkmate or stalemate (no legal move) loses. The third repetition of a
position is a draw, unless one side gave check on every move of the cycle;
that side loses for perpetual check. `state.result.reason` describes the end.
