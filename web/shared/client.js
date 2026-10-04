// Each page owns its UI. This client only authenticates, sends actions and syncs events.
export function connect({ onSnapshot, onConnection, onError }) {
  let playerToken = '';
  let seq = 0;
  let connected = false;

  function setConnected(value) {
    connected = value;
    onConnection(value);
  }

  function applySnapshot(snapshot, reset = false) {
    if (reset) seq = 0;
    if (snapshot.seq < seq) return;
    const events = snapshot.events.filter(event => event.seq > seq);
    seq = snapshot.seq;
    onSnapshot({ ...snapshot, events }, reset);
  }

  async function synchronize() {
    const authResponse = await fetch('/api/v1/player/auth', { method: 'POST' });
    if (!authResponse.ok) throw new Error('连接失败');
    playerToken = (await authResponse.json()).playerToken;
    const response = await fetch('/api/v1/state', { headers: { Authorization: 'Bearer ' + playerToken } });
    const snapshot = await response.json();
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
        const snapshot = await response.json();
        if (!response.ok || !snapshot.success) throw new Error(snapshot.error || '订阅失败');
        applySnapshot(snapshot);
      } catch (err) {
        setConnected(false);
        onError(err);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async function send(payload) {
    if (!connected) throw new Error('当前尚未连接');
    const response = await fetch('/api/v1/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + playerToken },
      body: JSON.stringify({ ...payload, after: seq, wait: 'none' })
    });
    const snapshot = await response.json();
    if (snapshot.state) applySnapshot(snapshot);
    if (!response.ok || !snapshot.success) {
      if (response.status === 403) setConnected(false);
      throw new Error(snapshot.error || '操作失败');
    }
    return snapshot;
  }

  subscribe();
  return { send };
}
