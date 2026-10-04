# 大话骰 / Liar's Dice

Game ID: `liars-dice`. Start the server with `kana-games serve liars-dice` and open
`http://127.0.0.1:3456/liars-dice/`. The game is selected at server startup.

## Rules

- One user and one Agent each roll five dice. Ten dice are in play.
- Each participant sees only their own dice until the round is resolved.
- A bid contains a quantity (2–10) and pip value (1–6).
- Subsequent bids must increase the quantity, or increase the pip value with
  the same quantity. Increasing quantity permits any pip value.
- Ones are wild by default, counting toward the pip value being bid.
  Once either participant bids on ones, ones permanently stop being wild for
  the rest of that round.
- On your turn, if a bid exists, you may open the cups to challenge it.
  If the actual count is at least the bid, the bidder wins; otherwise the
  opener wins. Both sets of dice are then revealed.

## Start

```sh
kana-games new --starter player -m '来一局大话骰！' --no-wait
kana-games status --json
```

`state.data` contains `myDice`, `opponentDiceCount`, `currentBid`, and
`onesAreWild`. After resolution, it also contains `opponentDice`.
`state.result.details` describes the challenged bid, actual count, and revealed
dice. The result's `winners` array identifies the winner.

## Actions

### Bid: `call`

```sh
kana-games act call --args '{"count":3,"point":4}' -m '三个四，你敢开吗？' --no-wait
```

Both arguments are integers. Read `availableActions` for permitted pip values
and `minimumCountByPoint` for the minimum quantity of each pip value.
When no legal higher bid exists, only `open` is available.

### Challenge: `open`

```sh
kana-games act open -m '开！' --no-wait
```

No arguments. Available only when a bid exists and it is the Agent's turn.

## Continue

After bidding, launch `kana-games wait` through the host's background job
mechanism. Chat may wake the Agent without changing action availability.
After opening, use `state.result.reason` for the result and in-game commentary.
Read the common skill for waiting and cleanup.
