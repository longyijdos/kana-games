import type { ActionPayload, ApiResponse, GameInfo, Snapshot } from '../src/protocol.js';

export type * from '../src/protocol.js';

// Served at /_kana/client.js. Each page owns its UI; this client only authenticates,
// sends actions and keeps the page in sync through long polling.
export function connect<View = unknown, Details = unknown>({ onSnapshot, onConnection, onError }: {
  onSnapshot(snapshot: Snapshot<View, Details>, reset: boolean): void;
  onConnection(connected: boolean): void;
  onError(error: Error): void;
}) {
  let playerToken = '';
  let seq = 0;
  let connected = false;

  function setConnected(value: boolean) {
    connected = value;
    onConnection(value);
  }

  function applySnapshot(snapshot: Snapshot<View, Details>, reset = false) {
    if (reset) seq = 0;
    if (snapshot.seq < seq) return;
    const events = snapshot.events.filter(event => event.seq > seq);
    seq = snapshot.seq;
    onSnapshot({ ...snapshot, events }, reset);
  }

  async function synchronize() {
    const authResponse = await fetch('/api/v1/player/auth', { method: 'POST' });
    if (!authResponse.ok) throw new Error('连接失败');
    playerToken = ((await authResponse.json()) as { playerToken: string }).playerToken;
    const response = await fetch('/api/v1/state', { headers: { Authorization: 'Bearer ' + playerToken } });
    const snapshot = await response.json() as ApiResponse<View, Details>;
    if (!response.ok || !snapshot.success) throw new Error(snapshot.error || '读取状态失败');
    applySnapshot(snapshot, true);
    setConnected(true);
  }

  async function subscribe() {
    while (true) {
      try {
        if (!connected) await synchronize();
        const response = await fetch('/api/v1/wait', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + playerToken },
          body: JSON.stringify({ after: seq, timeoutMs: 30000, waitFor: 'event' })
        });
        const snapshot = await response.json() as ApiResponse<View, Details>;
        if (!response.ok || !snapshot.success) throw new Error(snapshot.error || '订阅失败');
        applySnapshot(snapshot);
      } catch (err) {
        setConnected(false);
        onError(err as Error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async function send(payload: ActionPayload) {
    if (!connected) throw new Error('当前尚未连接');
    const response = await fetch('/api/v1/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + playerToken },
      body: JSON.stringify({ ...payload, after: seq })
    });
    const snapshot = await response.json() as ApiResponse<View, Details>;
    if (snapshot.state) applySnapshot(snapshot);
    if (!response.ok || !snapshot.success) {
      if (response.status === 403) setConnected(false);
      throw new Error(snapshot.error || '操作失败');
    }
    return snapshot;
  }

  async function info() {
    return await (await fetch('/api/v1/game')).json() as GameInfo;
  }

  subscribe();
  return { send, info };
}
