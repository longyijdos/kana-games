#!/usr/bin/env node
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const games = require('./games');
const { startServer, TOKEN_FILE } = require('./server');
const { version } = require('../package.json');

const CURSOR_FILE = path.join(__dirname, '.agent-cursor');
const argv = process.argv.slice(2);
const command = argv.shift() || 'status';
const options = { json: argv.includes('--json') };
const words = [];

function usage() {
  console.log(`kana-games ${version} — 一个用户与一个 Agent 的回合制游戏\n
用法: kana-games <命令> [参数] [选项]
  serve <game>                           启动指定游戏的网页与服务（前台运行）
  games                                  列出已集成游戏
  status / observe                       读取 Agent 可见状态与可用动作
  new [--starter player|agent]            当前游戏开新局，默认用户先手
  act <action> [--args '<JSON>']          执行当前游戏动作
  talk <message>                         发送桌边聊天
  wait                                   等待未读事件或 Agent 行动权
  --help / --version                     帮助与版本

选项: --json、--no-wait、--port <端口>、--after <事件序号>、-m <台词>
动作默认自动等待；Agent 仍有行动权或对局已结束时立即返回。
游戏: ${Object.keys(games).join('、')}`);
}

function fail(err) {
  console.error(options.json ? JSON.stringify({ success: false, error: err.message }) : err.message);
  process.exitCode = 1;
}

function readCursor(agentToken, port) {
  if (options.after !== undefined) return Number(options.after);
  if (!fs.existsSync(CURSOR_FILE)) return 0;
  const cursor = JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8'));
  return cursor.token === agentToken && cursor.port === port ? cursor.seq : 0;
}

function renderResponse(response) {
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }
  const { state, events, seq, timedOut } = response;
  console.log(`【事件序号】${seq}`);
  console.log(`【游戏】${state.gameName} (${state.gameId})`);
  for (const event of events) console.log(`[${event.seq}] ${event.text}` +
    (event.message && event.type !== 'chat_talk' ? `「${event.message}」` : ''));
  if (command === 'status' || command === 'observe') {
    for (const entry of state.history) console.log(entry.text +
      (entry.message && entry.type !== 'chat_talk' ? `「${entry.message}」` : ''));
  }
  if (timedOut) console.log('⏳ 等待超时，请继续 wait。');
  if (state.status === 'waiting') {
    console.log('等待开局：使用 new，或 wait 等待用户开局。');
  } else {
    console.log(`【阶段】${state.phase}`);
    console.log(games[state.gameId].formatState(state));
    if (state.status === 'ended') {
      console.log(`【结算】${state.result.reason}\n可使用 new 开下一局。`);
    } else {
      console.log(state.isMyTurn ? '👉 轮到你行动。' : '⏳ 等待用户行动。');
      for (const action of state.availableActions) console.log(`【可用动作】${JSON.stringify(action)}`);
    }
  }
}

function requestApi(method, endpoint, payload, agentToken, port) {
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? null : JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1', port, path: endpoint, method,
      headers: {
        Authorization: `Bearer ${agentToken}`,
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {})
      }
    }, res => {
      let responseBody = '';
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, response: JSON.parse(responseBody) }); }
        catch (err) { reject(new Error(`响应解析失败: ${err.message}`)); }
      });
    });
    req.on('error', err => reject(new Error(`127.0.0.1:${port}: ${err.message}`)));
    req.end(body);
  });
}

async function main() {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') { words.push(...argv.slice(i + 1)); break; }
    if (['--json', '--no-wait', '--help'].includes(arg)) {
      options[arg.slice(2)] = true;
    } else if (['--message', '-m', '--starter', '--after', '--args', '--port'].includes(arg)) {
      if (argv[i + 1] === undefined) throw new Error(`${arg} 缺少参数`);
      options[arg === '-m' ? 'message' : arg.slice(2)] = argv[++i];
    } else if (arg.startsWith('--')) {
      throw new Error(`未知选项: ${arg}`);
    } else { words.push(arg); }
  }
  if (['help', '--help', '-h'].includes(command) || options.help) return usage();
  if (command === '--version' || command === '-v') return console.log(version);
  if (command === 'games') {
    const list = Object.values(games).map(({ id, name }) => ({ id, name }));
    return console.log(options.json ? JSON.stringify({ success: true, games: list }, null, 2) : list.map(game => `${game.id}\t${game.name}`).join('\n'));
  }
  const port = Number(options.port || process.env.PORT || 3456);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port 必须是 1 至 65535 的整数');
  if (command === 'serve') {
    if (words.length !== 1 || !Object.hasOwn(games, words[0])) throw new Error('serve 需要一个游戏名称，使用 games 查看');
    const server = startServer({ gameId: words[0], port, json: options.json });
    server.once('error', fail);
    return;
  }
  if (!['status', 'observe', 'new', 'act', 'talk', 'wait'].includes(command)) throw new Error(`未知命令: ${command}`);
  let payload;
  if (!['status', 'observe', 'wait'].includes(command)) {
    payload = { action: command, message: options.message || '', wait: options['no-wait'] ? 'none' : 'auto' };
    if (command === 'new') {
      if (words.length) throw new Error('new 不接受游戏名称；请在 serve 时指定游戏');
      payload.starter = options.starter || 'player';
    } else if (command === 'act') {
      if (!words[0]) throw new Error('act 需要动作名称，使用 status 查看');
      payload.move = words[0];
      payload.args = options.args === undefined ? {} : JSON.parse(options.args);
      if (!payload.args || typeof payload.args !== 'object' || Array.isArray(payload.args)) throw new Error('--args 必须是 JSON 对象');
    } else {
      payload.message = words.join(' ').trim();
      if (!payload.message) throw new Error('talk 需要台词内容');
    }
  }
  const agentToken = (process.env.AGENT_TOKEN || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8') : '')).trim();
  if (!agentToken) throw new Error('未找到 Agent Token，请先运行 kana-games serve');
  let method = 'GET';
  let endpoint = '/api/v1/state';
  if (!['status', 'observe'].includes(command)) {
    const after = readCursor(agentToken, port);
    if (!Number.isInteger(after) || after < 0) throw new Error('after 必须是非负整数');
    method = 'POST';
    endpoint = command === 'wait' ? '/api/v1/wait' : '/api/v1/action';
    payload = command === 'wait' ? { after } : { ...payload, after };
  }
  const { status, response } = await requestApi(method, endpoint, payload, agentToken, port);
  if (response.state) {
    renderResponse(response);
    fs.writeFileSync(CURSOR_FILE, JSON.stringify({ token: agentToken, port, seq: response.seq }), { mode: 0o600 });
  } else if (options.json) { console.log(JSON.stringify(response, null, 2)); }
  if (status >= 400 || !response.success) {
    if (!options.json) console.error(`[API 错误 ${status}] ${response.error}`);
    process.exitCode = 1;
  }
}

main().catch(fail);
