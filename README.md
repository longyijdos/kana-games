# kana-games

一个用户和一个 Agent 共玩回合制游戏的小框架。用户在网页里操作，Agent 通过固定的
`kana-games` 命令观察、行动、聊天和等待。

- **自带游戏**：大话骰（像素街机风）、五子棋（木纹棋盘）、中国象棋（含悔棋、求和与长将判负）。
- **自己做游戏**：一个目录、一个规则文件、一个网页，`kana-games serve ./my-game` 即可开玩。
  可以让 Agent 按 `skills/kana-games-create` 帮你设计。

## 安装与启动

需要 Node.js 22.18 或更新版本。

```sh
npm install --global kana-games
kana-games serve gomoku
```

打开打印的地址 <http://127.0.0.1:3456/>，在网页选择先手并开局，或让 Agent 用
`kana-games new` 开局。服务前台运行、仅监听 `127.0.0.1`，一个服务一局游戏，
状态在内存中。对局进行中不能重新开局；换游戏时停止服务再 `serve` 另一个。

端口用 `--port` 或 `PORT` 设置，默认 3456，服务与客户端使用同一端口。
Agent Token 与事件游标保存在 `~/.kana-games/<端口>.json`，重启服务会更换 Token。

随包附带两个 Agent skill：`kana-games-play`（陪用户玩）和 `kana-games-create`（帮用户做游戏），
以及陪玩子 Agent `kana-games-player`：主 Agent 开好服务后把对局交给它，自己继续和用户聊别的。
一条命令装进 Agent 的全局目录：

```sh
kana-games install claude            # ${CLAUDE_CONFIG_DIR:-~/.claude} 下的 skills/ 与 agents/
kana-games install codex kana        # 可一次装多个；Kana 需在 /skills 中启用 skill
kana-games install claude --skills-only
kana-games install ./some/dir        # 其它 Agent：只装 skill
```

子 Agent 只装给 Claude Code、Codex 和 Kana；`--skills-only` 只装 skill。
已有同名文件时跳过，升级 kana-games 后用 `--force` 覆盖。
子 Agent 的内容维护在 `agents/kana-games-player.md`，安装时转换成各家的格式。

## 命令

| 命令 | 行为 |
| --- | --- |
| `serve <game\|./dir>` | 前台启动内置游戏或外部游戏目录 |
| `games` | 列出内置游戏 |
| `rules` | 查看当前游戏规则 |
| `install <claude\|codex\|kana\|目录>...` | 安装 skill 与陪玩子 Agent；`--skills-only` 只装 skill，`--force` 覆盖已有 |
| `status` / `observe` | Agent 可见的状态、历史和可用动作 |
| `new [--starter player\|agent]` | 开新局，默认用户先手 |
| `act <action> --args '<JSON>'` | 执行游戏动作，参数默认为 `{}` |
| `talk <message>` | 桌边聊天，不消耗行动权 |
| `wait [--timeout <秒>]` | 等待未读事件或 Agent 行动权，默认最长十分钟 |

`new`、`act` 可用 `-m` 附带台词。动作命令立即返回；Agent 把行动权交给用户后，
用宿主的后台任务机制运行 `wait`。

```sh
kana-games act place --args '{"x":8,"y":8}' -m '这步你怎么看？'
kana-games wait --json
```

默认输出可读文本，`--json` 返回 `success, state, events, seq, timedOut`。
`state` 包含 `status`、`currentTurn`、`isMyTurn`、`availableActions`、
`data`（游戏给该角色的视图）、`summary`（文本视图）、`result`、`history`。
隐藏信息不会发给对手。成功退出码为 0，错误为 1。

## 做一个自己的游戏

```
my-game/
  game.ts        # 规则：setup / actions / act / view / format
  web/index.html # 页面，挂在服务根路径
  web/app.js     # import { connect } from '/_kana/client.js'
```

框架负责回合、开局结算、参数校验、聊天记录和 Agent CLI；游戏只写规则和页面。
完整约定和示例见 [skills/kana-games-create/SKILL.md](skills/kana-games-create/SKILL.md)，
内置游戏 `games/gomoku`、`games/liars-dice`、`games/xiangqi` 也是按同样约定写的范例。

`game.ts` 由 Node 直接运行（自动去掉类型），类型从 `kana-games` 导入：

```ts
import type { GameDefinition } from 'kana-games';
export default { id: 'my-game', name: '我的游戏', /* ... */ } satisfies GameDefinition<Data, View>;
```

## 开发

```sh
npm ci
npm test            # 构建并运行测试
npm start -- gomoku # 构建并启动
```

`src/` 是框架（CLI、服务、运行时、类型），`web/client.ts` 是页面使用的浏览器端客户端，
`games/` 是内置游戏。`npm run build` 用 `tsc` 编译全部 TypeScript 到 `dist/`，并复制
页面静态文件；不使用打包器。`dist/` 不提交，`npm publish` 时自动构建。
