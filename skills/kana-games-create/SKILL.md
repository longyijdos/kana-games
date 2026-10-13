---
name: kana-games-create
description: Design and build a new turn-based game for kana-games (one human in the browser, one Agent on the CLI). Use when the user wants to create, prototype, or modify their own game for kana-games.
---

# Create a kana-games Game

A game is a directory with a rules module and a web page. The framework
(`kana-games`) runs the server, tracks turns, validates action arguments,
keeps chat and history, and gives the Agent a CLI. You write only the rules
and the page.

```
my-game/
  game.ts          # or game.js — default export: the game definition
  web/
    index.html     # served at http://127.0.0.1:<port>/
    app.js         # plain browser JavaScript (no build step)
    styles.css     # any other static files in web/ are served as-is
```

Run it with `kana-games serve ./my-game` (a path starting with `.` or `/`).
Requires Node.js 22.18+ so `game.ts` runs without compiling.

## 1. Rules module

Export one object. Keep all game state in the object returned by `setup`;
`act` mutates it in place.

```ts
import type { AvailableAction, GameDefinition, Role } from 'kana-games';

interface Data { total: number; lastAdd: number | null }
interface View { total: number; target: number }

const TARGET = 30;

export default {
  id: 'race-to-30',
  name: '抢三十',
  rules: [
    '从 0 开始，双方轮流加 1、2 或 3。',
    '谁让总数恰好到达 30 谁获胜。'
  ],

  setup({ starter }) {
    return { total: 0, lastAdd: null };
  },

  // Only called for the role whose turn it is.
  actions({ data }): AvailableAction[] {
    return [{
      name: 'add', description: '给总数加 1～3',
      parameters: { n: { type: 'integer', min: 1, max: Math.min(3, TARGET - data.total) } }
    }];
  },

  // args are already validated against the declared parameters.
  act({ data, role, opponent }, move, { n }) {
    data.total += n;
    data.lastAdd = n;
    const event = { type: 'add', text: `${role} 加 ${n}，总数 ${data.total}`, data: { n, total: data.total } };
    if (data.total === TARGET) {
      return { event, result: { outcome: 'win', winners: [role], reason: `${role} 抢到了 30！` } };
    }
    return { event };   // turn passes to the opponent
  },

  view({ data, role, opponent, ended }) {
    return { total: data.total, target: TARGET };
  },

  format(view) {
    return `当前总数: ${view.total} / ${view.target}`;
  }
} satisfies GameDefinition<Data, View>;
```

### Contract

| Function | Called | Returns |
| --- | --- | --- |
| `setup({ starter })` | on every new game | initial `data` |
| `actions({ data, role, opponent })` | for the role whose turn it is | actions with `name`, `description`, `parameters` |
| `act({ data, role, opponent }, move, args)` | when that role submits an action | `{ event, result?, next? }` |
| `view({ data, role, opponent, ended, turn })` | for each role on every snapshot | what that role may see; `turn` is the role to act next |
| `format(view)` | for the CLI text output | a plain-text string |

- **Roles.** `Role` is `'player'` (the human in the browser) or `'agent'`.
  `starter` is the role that moves first; give it the first-player piece
  (black, X, …) and include each role's piece in `view`.
- **Turns.** After `act`, the turn goes to `opponent` unless you return
  `next: role` (for extra moves). Returning `result` ends the game.
- **Results.** `{ outcome: 'win' | 'draw', winners: Role[], reason: string, details?: any }`.
  A draw has `winners: []`.
- **Parameters.** Only `{ type: 'integer', min?, max?, enum? }`. Every declared
  parameter is required, extra keys are rejected, and values are checked
  before `act` runs. Encode choices (cells, cards, directions) as integers.
- **Illegal moves.** For rules the schema cannot express (occupied cell,
  bid too low), `throw new Error('reason')` before mutating `data`. The
  framework returns the message and nothing changes.
- **Hidden information.** Never put the opponent's secrets in `view` while
  the game is running; `ended` is true once a result exists, so you can
  reveal them then. Events reach both roles unless you set
  `event.audience: ['player']` or `['agent']`.
- **Events.** `type` is your own short name (`'place'`, `'draw'`, …); `start`
  and `talk` are reserved by the framework. Put structured facts in
  `event.data` so the page can describe them in its own words.
- **Randomness** goes in `setup`/`act` (e.g. `Math.random()`); the server is
  the only place that sees `data`.
- **TypeScript without a build.** Node strips types, so use only erasable
  syntax: `import type`, interfaces, annotations, `satisfies`. No `enum`,
  `namespace`, or constructor parameter properties. Do not import runtime
  values from `kana-games`; the type import is erased and needs no install.
  Plain `game.js` with the same object also works.

## 2. Web page

The page is yours: any layout, style, or library loaded from a URL. It talks
to the server through the framework client:

```html
<script type="module" src="./app.js"></script>
```

```js
import { connect } from '/_kana/client.js';

const game = connect({
  // Called with every new snapshot. snapshot.state is the player's view:
  // { status, isMyTurn, currentTurn, availableActions, data, result, history, ... }
  // snapshot.events are the events new since the previous snapshot.
  onSnapshot(snapshot, reset) { render(snapshot.state); },
  onConnection(connected) { /* show online/offline, enable buttons */ },
  onError(error) { /* show error.message */ }
});

// Every call resolves with a snapshot, or throws Error(message) when rejected.
await game.send({ action: 'new', starter: 'player' });          // or 'agent'
await game.send({ action: 'act', move: 'add', args: { n: 2 }, message: '加二！' });
await game.send({ action: 'talk', message: '你猜我下一步？' });
const { name, rules } = await game.info();
```

- `state.status` is `waiting` → `playing` → `ended`; a new game can start
  from `waiting` or `ended`. Show a start control (with starter choice) then.
- `state.data` is your `view(...)` for the player, or `null` before the first game.
- `state.history` is this game's entries: `{ type, text, data, sender, message }`.
  `sender` is `player` or `agent`; `message` is the optional chat line sent
  with the action. Render it as a chat log next to the game. The first entry
  is the framework's `start` (`data.starter`); chat-only entries have type `talk`.
  Prefer describing your own events from `data` ("你落子…") over `text`, which
  is written for the Agent and says 玩家/Agent.
- A rejected `send` throws an `Error` whose message explains why (not your
  turn, a parameter out of range, or the message your `act` threw). Show it.
- Disable game controls unless `connected && state.isMyTurn`.
- **Fit one screen.** Make `body` `height: 100dvh; overflow: hidden` with a
  grid layout; let the chat list scroll internally (`min-height: 0; overflow-y: auto`)
  and size the board from the remaining space. The page should not scroll on
  a laptop screen.

## 3. Try it

```sh
kana-games serve ./my-game --port 3460          # in the background
kana-games rules --port 3460
kana-games new --starter agent --port 3460
kana-games act add --args '{"n":3}' -m '先加三' --port 3460
kana-games status --port 3460
```

Open `http://127.0.0.1:3460/` and play the other side in the browser.
Without a browser, act as the player over HTTP:

```sh
TOKEN=$(curl -s -XPOST localhost:3460/api/v1/player/auth | node -pe 'JSON.parse(require("fs").readFileSync(0)).playerToken')
curl -s -XPOST localhost:3460/api/v1/action -H "Authorization: Bearer $TOKEN" \
  -d '{"action":"act","move":"add","args":{"n":1},"message":"到你了"}'
```
 Test
an illegal move, a finished game, and starting the next game. `serve` reports
a missing or malformed `game.ts` export at startup.

After the game works, play it with the user through the `kana-games-play`
skill.
