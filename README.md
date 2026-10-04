# kana-games

一个用户和一个 Agent 共玩的回合制游戏框架。用户通过各游戏的专属网页操作，
Agent 通过固定入口 `kana-games` 观察、行动、聊天和等待。
每款游戏使用独立页面和样式，启动服务时选定游戏。

当前集成大话骰与五子棋。CLI、游戏服务、网页与 skill 文档在本仓库一起维护。

## 安装与启动

需要 Node.js 22 或更新版本。目前从本地仓库安装：

```sh
npm install --global /absolute/path/to/kana-games
kana-games --version
kana-games serve gomoku
```

服务前台运行，启动时必须指定游戏。打开打印的地址，例如
<http://127.0.0.1:3456/gomoku/>，在网页选择先手并开局。
默认用户先手，不会自动开局。也可以从 CLI 开局：

```sh
kana-games games
kana-games new --starter player --no-wait
kana-games status --json
```

服务仅监听 `127.0.0.1`，每个服务实例维护一局游戏，状态保存在内存中。
对局进行中不能重新开局；结束后可开当前游戏的下一局。
切换游戏时停止服务，再用 `kana-games serve <game>` 启动目标游戏。
根地址跳转到选定游戏的页面，当前服务只提供该游戏页面和公共通信脚本。

- `liars-dice`：`/liars-dice/`，像素街机风。
- `gomoku`：`/gomoku/`，木色棋盘与简洁布局。

停止服务使用 Ctrl+C 或启动它的宿主进程工具。

端口通过 `--port` 或 `PORT` 设置，默认 3456。服务与客户端使用同一端口：

```sh
kana-games serve gomoku --port 3457
kana-games status --port 3457
```

Agent Token 与事件游标写在安装目录的 `src/.agent-token` 与 `src/.agent-cursor`，
沿用本地客户端的文件认证方式；重启服务会更换 Token。
一次运行一个服务实例。安装目录须可由运行 CLI 的用户写入。
也可用 `AGENT_TOKEN` 提供连接已有服务所需的 Token。

开发时可直接使用 `node src/cli.js` 代替 `kana-games`。包名为
`@longyijdos/games`，发布到 npm 后可按包名安装。

## 通用命令

| 命令 | 行为 |
| --- | --- |
| `serve <game>` | 前台启动指定游戏的独立网页与 HTTP 服务 |
| `games` | 列出已集成游戏，无需启动服务 |
| `status` / `observe` | 读取 Agent 可见状态、历史和当前可用动作 |
| `new` | 当前游戏开新局，`--starter player\|agent` 指定先手 |
| `act <action> --args '<JSON>'` | 执行当前游戏动作，参数默认为 `{}` |
| `talk <message>` | 随时发送桌边聊天，不消耗行动权 |
| `wait` | 等待未读事件或 Agent 行动权，最长十分钟 |
| `--help` / `--version` | 查看帮助与版本 |

`new`、`act`、`talk` 可用 `-m` / `--message` 附带台词（`talk` 使用位置参数作为台词）。
它们默认在行动权交给用户后等待；Agent 仍可行动、已经结算，或有未读对方事件时立即返回。
Agent 通常应显式加 `--no-wait`，随后交给宿主的后台任务机制执行 `wait`。

```sh
kana-games act place --args '{"x":8,"y":8}' -m '这步你怎么看？' --no-wait
kana-games talk '轮到你了' --no-wait
kana-games wait --json
```

动作和参数以 `status` 中的 `state.availableActions` 为准。参数作为 JSON 数据解析，
动作名交给当前游戏模块验证。不同游戏共用上述命令入口，便于 Agent 按固定命令前缀设置白名单。

## 输出与事件

默认输出人类可读的状态，大话骰显示骰子，五子棋显示带 1～15 坐标的文本棋盘。
`--json` 返回结构化数据：

```text
success, state, events, seq, timedOut
```

`state` 包含 `role`、`gameId`、`gameName`、`status`、`phase`、`currentTurn`、
`isMyTurn`、`availableActions`、`data`、`history`、`result`。
`data` 为游戏专属的角色视图；隐藏信息不发送给对手。
`result` 包含 `outcome`、`winners`、`reason`，以及可选的游戏专属 `details`。

`seq` 在服务存活期间持续增加，跨局保留；`history` 在新局开始时重置。
CLI 保存最近读取的事件序号，下次动作或 `wait` 增量读取。
`--after <seq>` 可以显式指定起点。
等待超时返回 `timedOut: true`，退出码仍为 0，应继续等待。

成功退出码为 0，错误为 1。API 返回的状态与错误在 `--json` 模式下一起写到 stdout；
参数解析、连接等本地错误以 `{ "success": false, "error": "..." }` 写到 stderr。
文本模式的错误写到 stderr。非法动作不会改变棋局。

## 新增游戏

1. 在 `src/games/<id>.js` 导出 `id`、`name`、`Engine`、`formatState`，并在
   `src/games/index.js` 注册。
2. 在 `web/<id>/` 编写自己的 `index.html`、样式与界面脚本。不同游戏的
   布局和风格独立，启动该游戏时打开 `/<id>/`。复用 `web/shared/client.js`
   进行认证、动作提交和事件同步；它不包含页面布局或样式。
3. 在 `skills/turn-based-games/references/<id>.md` 写规则、动作与示例，
   在 `SKILL.md` 中增加索引。游戏需要的依赖在 `package.json` 中声明。

规则模块约定：

- `new Engine({ starter })` 创建已开局的状态；`status` 为 `playing` 或 `ended`。
- `isMyTurn(role)` 判断该角色是否需要行动，等待机制使用它。
- `executeAction(role, move, args)` 先验证再改变状态，返回 `{ type, text, data }` 事件。
  不合法时抛出错误。事件默认公开，私有事件可带 `audience: ['player']` 或 `['agent']`。
- `getStateForRole(role)` 返回 `status`、`phase`、`currentTurn`、`isMyTurn`、
  `availableActions`、`data`、`result`，只包含该角色可见的信息。
- `formatState(state)` 为 CLI 返回游戏专属的文本状态。

游戏控制行动顺序、阶段、私有信息与结算。通用运行时负责开局、聊天、事件与历史，
服务端负责认证和等待。事件与历史按同一 `audience` 过滤。

公共网页客户端 `connect({ onSnapshot, onConnection, onError })` 返回
`send(payload)`。它处理用户认证、长轮询与事件序号，页面自行渲染状态、处理
连接提示和错误。动作请求为 `{ action: 'new', starter }`、
`{ action: 'act', move, args, message }` 或 `{ action: 'talk', message }`。

大话骰保留原页面布局，在 `app.js` 中适配公共状态；五子棋用 `board.js`
渲染棋盘。新游戏可以自行组织 HTML、CSS 和脚本，无需复用现有布局。

## Skill 文档

文档源在 [`skills/turn-based-games`](skills/turn-based-games/SKILL.md)。
`SKILL.md` 说明通用操作流程，游戏规则与专属命令放在各自的 reference。
发布后将该目录复制到 `kana-skills/turn-based-games` 或其它 Agent 的技能目录。

- [大话骰](skills/turn-based-games/references/liars-dice.md)
- [五子棋](skills/turn-based-games/references/gomoku.md)
