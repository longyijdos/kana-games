const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const games = require('./games');
const { GameSession, EventLog, WaitManager } = require('./runtime');

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const TOKEN_FILE = path.join(__dirname, '.agent-token');
const WEB_DIR = path.join(__dirname, '..', 'web');
const MIME_TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  const payload = body ? JSON.parse(body) : {};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('请求体必须是 JSON 对象');
  return payload;
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function createGameServer({
  gameId,
  agentToken = crypto.randomBytes(24).toString('hex'),
  playerToken = crypto.randomBytes(24).toString('hex')
} = {}) {
  if (!Object.hasOwn(games, gameId)) throw new Error(`serve 需要游戏名称: ${Object.keys(games).join('、')}`);
  const session = new GameSession(gameId);
  const log = new EventLog();
  const waits = new WaitManager();
  const snapshot = (role, after, timedOut = false) => ({
    success: true, state: session.getStateForRole(role),
    events: log.since(after, role), seq: log.seq, timedOut
  });
  const park = (role, after, timeoutMs, res, eventsOnly = false) => {
    const cancel = waits.wait(role, timeoutMs, timedOut => {
      res.off('close', cancel);
      sendJson(res, 200, snapshot(role, after, timedOut));
    }, eventsOnly);
    res.once('close', cancel);
  };

  return http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && !pathname.startsWith('/api/')) {
      const gamePath = `/${gameId}/`;
      if (pathname === '/' || pathname === `/${gameId}`) {
        res.writeHead(302, { Location: gamePath });
        res.end();
        return;
      }
      if (!pathname.startsWith(gamePath) && !pathname.startsWith('/shared/')) {
        return sendJson(res, 404, { success: false, error: '页面不存在' });
      }
      const file = path.resolve(WEB_DIR, pathname.slice(1) + (pathname.endsWith('/') ? 'index.html' : ''));
      if (!file.startsWith(WEB_DIR + path.sep)) return sendJson(res, 404, { success: false, error: '页面不存在' });
      fs.readFile(file, (err, content) => {
        if (err) return sendJson(res, 404, { success: false, error: '页面不存在' });
        res.writeHead(200, { 'Content-Type': (MIME_TYPES[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
        res.end(content);
      });
      return;
    }
    if (pathname === '/api/v1/player/auth' && req.method === 'POST') {
      return sendJson(res, 200, { success: true, playerToken });
    }
    if (!['/api/v1/state', '/api/v1/action', '/api/v1/wait'].includes(pathname)) {
      return sendJson(res, 404, { success: false, error: '接口不存在' });
    }
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const role = token === agentToken ? 'agent' : token === playerToken ? 'player' : null;
    if (!role) return sendJson(res, 403, { success: false, error: 'Token 无效或缺失' });
    if (pathname === '/api/v1/state' && req.method === 'GET') return sendJson(res, 200, snapshot(role, log.seq));
    if (pathname === '/api/v1/state' || req.method !== 'POST') {
      return sendJson(res, 405, { success: false, error: '请求方法不支持' });
    }
    let after = log.seq;
    try {
      const payload = await readJson(req);
      after = payload.after === undefined && pathname === '/api/v1/action' ? log.seq : payload.after;
      if (!Number.isInteger(after) || after < 0 || after > log.seq) throw new Error('after 必须是 0 至当前 seq 之间的整数');
      const timeoutMs = payload.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : payload.timeoutMs;
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) {
        throw new Error('timeoutMs 必须是 1 至 2147483647 之间的整数');
      }
      if (pathname === '/api/v1/wait') {
        const waitFor = payload.waitFor === undefined ? 'event-or-turn' : payload.waitFor;
        if (!['event', 'event-or-turn'].includes(waitFor)) throw new Error('waitFor 必须是 event 或 event-or-turn');
        const eventsOnly = waitFor === 'event';
        if (log.since(after, role).length || (!eventsOnly && session.isMyTurn(role))) {
          return sendJson(res, 200, snapshot(role, after));
        }
        park(role, after, timeoutMs, res, eventsOnly);
        return;
      }
      const wait = payload.wait === undefined ? 'none' : payload.wait;
      if (!['none', 'auto'].includes(wait)) throw new Error('wait 必须是 none 或 auto');
      const hadUnreadEvents = log.hasUnreadOpponentEvents(role, after);
      const event = log.append(session.executeAction(role, payload));
      waits.publish(event);
      if (wait === 'none' || hadUnreadEvents || session.isMyTurn(role) || session.status === 'ended') {
        return sendJson(res, 200, snapshot(role, after));
      }
      park(role, after, timeoutMs, res);
    } catch (err) {
      const errorAfter = Number.isInteger(after) && after >= 0 && after <= log.seq ? after : log.seq;
      sendJson(res, 400, { ...snapshot(role, errorAfter), success: false, error: err.message });
    }
  });
}

function startServer({ gameId, port = 3456, json = false } = {}) {
  const agentToken = crypto.randomBytes(24).toString('hex');
  const server = createGameServer({ gameId, agentToken });
  server.listen(port, '127.0.0.1', () => {
    fs.writeFileSync(TOKEN_FILE, agentToken, { mode: 0o600 });
    const url = `http://127.0.0.1:${port}/${gameId}/`;
    console.log(json ? JSON.stringify({ success: true, gameId, url }) : `${games[gameId].name}已启动: ${url}`);
  });
  return server;
}

module.exports = { createGameServer, startServer, TOKEN_FILE };
