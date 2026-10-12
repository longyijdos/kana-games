import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { GameSession, EventLog, WaitManager } from './runtime.js';
import type { LoadedGame } from './games.js';
import type { ActionPayload, GameInfo, Role, Snapshot } from './protocol.js';

const MAX_WAIT_MS = 10 * 60 * 1000;
const CLIENT_FILE = path.join(import.meta.dirname, '..', 'web', 'client.js');
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2'
};

/** Agent token and event cursor for the server on this port. */
export const stateFile = (port: number) => path.join(os.homedir(), '.kana-games', `${port}.json`);

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = '';
  for await (const chunk of req) body += chunk;
  const payload: unknown = body ? JSON.parse(body) : {};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('请求体必须是 JSON 对象');
  return payload as Record<string, unknown>;
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': MIME_TYPES['.json'] });
  res.end(JSON.stringify(data));
}

function serveFile(res: ServerResponse, file: string) {
  fs.readFile(file, (err, content) => {
    if (err) return sendJson(res, 404, { success: false, error: '页面不存在' });
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(content);
  });
}

export function createGameServer({ game, webDir }: LoadedGame, {
  agentToken = crypto.randomBytes(24).toString('hex'),
  playerToken = crypto.randomBytes(24).toString('hex')
} = {}) {
  const session = new GameSession(game);
  const log = new EventLog();
  const waits = new WaitManager();
  const info: GameInfo = { id: game.id, name: game.name, rules: game.rules };
  const snapshot = (role: Role, after: number, timedOut = false): Snapshot => ({
    success: true, state: session.getStateForRole(role),
    events: log.since(after, role), seq: log.seq, timedOut
  });

  return http.createServer(async (req, res) => {
    const pathname = new URL(req.url!, 'http://localhost').pathname;
    if (req.method === 'GET' && !pathname.startsWith('/api/')) {
      if (pathname === '/_kana/client.js') return serveFile(res, CLIENT_FILE);
      const file = path.resolve(webDir, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
      if (!file.startsWith(webDir + path.sep)) return sendJson(res, 404, { success: false, error: '页面不存在' });
      return serveFile(res, file);
    }
    if (pathname === '/api/v1/game' && req.method === 'GET') return sendJson(res, 200, { success: true, ...info });
    if (pathname === '/api/v1/player/auth' && req.method === 'POST') return sendJson(res, 200, { success: true, playerToken });

    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const role: Role | null = token === agentToken ? 'agent' : token === playerToken ? 'player' : null;
    if (pathname === '/api/v1/state' && req.method === 'GET') {
      return role ? sendJson(res, 200, snapshot(role, log.seq)) : sendJson(res, 403, { success: false, error: 'Token 无效' });
    }
    if (req.method !== 'POST' || (pathname !== '/api/v1/action' && pathname !== '/api/v1/wait')) {
      return sendJson(res, 404, { success: false, error: '接口不存在' });
    }
    if (!role) return sendJson(res, 403, { success: false, error: 'Token 无效' });

    let payload: Record<string, unknown>;
    try { payload = await readJson(req); } catch (err) { return sendJson(res, 400, { success: false, error: (err as Error).message }); }
    const after = payload.after ?? log.seq;
    if (!Number.isInteger(after) || (after as number) < 0 || (after as number) > log.seq) {
      return sendJson(res, 400, { success: false, error: 'after 必须是 0 至当前 seq 之间的整数' });
    }
    const from = after as number;

    if (pathname === '/api/v1/wait') {
      // Players wake on any event; agents also wake when it is already their turn.
      const eventsOnly = payload.waitFor === 'event';
      if (log.since(from, role).length || (!eventsOnly && session.isMyTurn(role))) return sendJson(res, 200, snapshot(role, from));
      const timeoutMs = Math.min(Number(payload.timeoutMs) || MAX_WAIT_MS, MAX_WAIT_MS);
      const cancel = waits.wait(role, timeoutMs, timedOut => {
        res.off('close', cancel);
        sendJson(res, 200, snapshot(role, from, timedOut));
      }, eventsOnly);
      res.once('close', cancel);
      return;
    }

    try {
      const event = log.append(session.executeAction(role, payload as unknown as ActionPayload));
      waits.publish(event);
      sendJson(res, 200, snapshot(role, from));
    } catch (err) {
      sendJson(res, 400, { ...snapshot(role, from), success: false, error: (err as Error).message });
    }
  });
}

export function startServer(loaded: LoadedGame, { port, json }: { port: number; json: boolean }) {
  const agentToken = crypto.randomBytes(24).toString('hex');
  const server = createGameServer(loaded, { agentToken });
  server.listen(port, '127.0.0.1', () => {
    fs.mkdirSync(path.dirname(stateFile(port)), { recursive: true });
    fs.writeFileSync(stateFile(port), JSON.stringify({ token: agentToken, seq: 0 }), { mode: 0o600 });
    const url = `http://127.0.0.1:${port}/`;
    console.log(json ? JSON.stringify({ success: true, gameId: loaded.game.id, url }) : `${loaded.game.name}已启动: ${url}`);
  });
  return server;
}
