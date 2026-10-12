#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import { builtinGames, loadGame } from './games.js';
import { startServer, stateFile } from './server.js';
import { SKILL_TARGETS, installSkills } from './skills.js';
import type { ApiResponse, GameInfo, Snapshot } from './protocol.js';

const { version } = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

const VALUE_OPTIONS: Record<string, string> = { '-m': 'message', '--message': 'message', '--starter': 'starter', '--after': 'after', '--args': 'args', '--port': 'port' };
const argv = process.argv.slice(2);
const command = argv.shift() || 'status';
const options: Record<string, string | true> = {};
const words: string[] = [];
const json = argv.includes('--json');

function usage() {
  console.log(`kana-games ${version} — 一个用户与一个 Agent 的回合制游戏\n
用法: kana-games <命令> [参数] [选项]
  serve <game|./dir>                     启动内置游戏或外部游戏目录（前台运行）
  games                                  列出内置游戏
  rules                                  查看当前游戏规则
  skills <${Object.keys(SKILL_TARGETS).join('|')}|目录> [--force]   为 Agent 安装 skill，--force 覆盖已有
  status / observe                       读取 Agent 可见状态与可用动作
  new [--starter player|agent]            开新局，默认用户先手
  act <action> [--args '<JSON>']          执行游戏动作
  talk <message>                         发送桌边聊天
  wait                                   等待未读事件或 Agent 行动权，最长十分钟
  --help / --version                     帮助与版本

选项: --json、--port <端口>、--after <事件序号>、-m <台词>
内置游戏: ${builtinGames().join('、')}`);
}

function request<T>(port: number, method: string, endpoint: string, token?: string, payload?: unknown) {
  return new Promise<{ status: number; body: T }>((resolve, reject) => {
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1', port, path: endpoint, method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }
    }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode!, body: JSON.parse(text) as T }); }
        catch { reject(new Error(`无法解析 127.0.0.1:${port} 的响应`)); }
      });
    });
    req.on('error', err => reject(new Error(`无法连接 127.0.0.1:${port}，请先运行 kana-games serve (${err.message})`)));
    req.end(body);
  });
}

function render(response: Snapshot) {
  if (json) return console.log(JSON.stringify(response, null, 2));
  const { state, events, timedOut } = response;
  const line = (entry: { text: string; message: string; type: string }) =>
    entry.text + (entry.message && entry.type !== 'talk' ? `「${entry.message}」` : '');
  console.log(`【游戏】${state.gameName}  【事件序号】${response.seq}`);
  const shown = command === 'status' || command === 'observe' ? state.history : events;
  for (const entry of shown) console.log(line(entry));
  if (timedOut) console.log('⏳ 等待超时，请继续 wait。');
  if (state.status === 'waiting') return console.log('等待开局：使用 new，或 wait 等待用户开局。');
  console.log(state.summary);
  if (state.status === 'ended') return console.log(`【结算】${state.result!.reason}\n可使用 new 开下一局。`);
  console.log(state.isMyTurn ? '👉 轮到你行动。' : '⏳ 等待用户行动。');
  for (const action of state.availableActions) console.log(`【可用动作】${JSON.stringify(action)}`);
}

async function main() {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') { words.push(...argv.slice(i + 1)); break; }
    if (arg === '--json' || arg === '--help' || arg === '--force') options[arg.slice(2)] = true;
    else if (VALUE_OPTIONS[arg]) {
      if (argv[i + 1] === undefined) throw new Error(`${arg} 缺少参数`);
      options[VALUE_OPTIONS[arg]] = argv[++i];
    } else if (arg.startsWith('--')) throw new Error(`未知选项: ${arg}`);
    else words.push(arg);
  }
  if (['help', '--help', '-h'].includes(command) || options.help) return usage();
  if (command === '--version' || command === '-v') return console.log(version);
  if (command === 'games') {
    const list = await Promise.all(builtinGames().map(async id => ({ id, name: (await loadGame(id)).game.name })));
    return console.log(json ? JSON.stringify({ success: true, games: list }, null, 2) : list.map(game => `${game.id}\t${game.name}`).join('\n'));
  }
  if (command === 'skills') {
    if (words.length !== 1) throw new Error(`用法: kana-games skills <${Object.keys(SKILL_TARGETS).join('|')}|目录> [--force]`);
    const { dir, results } = installSkills(words[0], Boolean(options.force));
    if (json) return console.log(JSON.stringify({ success: true, dir, skills: results }, null, 2));
    const labels = { installed: '已安装', replaced: '已覆盖', skipped: '已存在，跳过（--force 覆盖）' };
    console.log(`Skill 目录: ${dir}\n` + results.map(({ name, status }) => `  ${name}  ${labels[status]}`).join('\n'));
    if (words[0] === 'kana') console.log('Kana 的全局 skill 需在 /skills 中启用后才会自动发现，也可以用 @turn-based-games 直接调用。');
    return;
  }
  const port = Number(options.port || process.env.PORT || 3456);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port 必须是 1 至 65535 的整数');
  if (command === 'serve') {
    if (words.length !== 1) throw new Error('用法: kana-games serve <内置游戏名|游戏目录>');
    startServer(await loadGame(words[0]), { port, json }).once('error', fail);
    return;
  }
  if (command === 'rules') {
    const { body } = await request<GameInfo>(port, 'GET', '/api/v1/game');
    return console.log(json ? JSON.stringify(body, null, 2) : `【${body.name}】\n` + body.rules.map(rule => `- ${rule}`).join('\n'));
  }
  if (!['status', 'observe', 'new', 'act', 'talk', 'wait'].includes(command)) throw new Error(`未知命令: ${command}`);

  if (!fs.existsSync(stateFile(port))) throw new Error(`端口 ${port} 上没有运行中的服务，请先运行 kana-games serve`);
  const saved = JSON.parse(fs.readFileSync(stateFile(port), 'utf8')) as { token: string; seq: number };
  const after = options.after === undefined ? saved.seq : Number(options.after);
  let call: [string, string, Record<string, unknown>?];
  if (command === 'status' || command === 'observe') call = ['GET', '/api/v1/state'];
  else if (command === 'wait') call = ['POST', '/api/v1/wait', { after }];
  else {
    const payload: Record<string, unknown> = { action: command, message: options.message || '', after };
    if (command === 'new') payload.starter = options.starter || 'player';
    if (command === 'act') {
      if (!words[0]) throw new Error('act 需要动作名称，使用 status 查看');
      payload.move = words[0];
      payload.args = options.args === undefined ? {} : JSON.parse(options.args as string);
    }
    if (command === 'talk') payload.message = words.join(' ');
    call = ['POST', '/api/v1/action', payload];
  }
  const { status, body } = await request<ApiResponse>(port, call[0], call[1], saved.token, call[2]);
  if (body.state) {
    render(body);
    fs.writeFileSync(stateFile(port), JSON.stringify({ token: saved.token, seq: body.seq }), { mode: 0o600 });
  } else if (json) console.log(JSON.stringify(body, null, 2));
  if (status >= 400 || !body.success) {
    if (!json) console.error(status === 403 ? 'Token 无效：服务可能已重启，请检查端口' : `[错误] ${body.error}`);
    process.exitCode = 1;
  }
}

function fail(err: Error) {
  console.error(json ? JSON.stringify({ success: false, error: err.message }) : err.message);
  process.exitCode = 1;
}

main().catch(fail);
