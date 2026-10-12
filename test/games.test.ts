import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { GameSession } from '../src/runtime.js';
import { createGameServer } from '../src/server.js';
import { loadGame } from '../src/games.js';
import gomoku from '../games/gomoku/game.js';
import dice from '../games/liars-dice/game.js';
import type { DiceView } from '../games/liars-dice/game.js';

const place = (x: number, y: number) => ({ action: 'act' as const, move: 'place', args: { x, y } });

test('session enforces start, turn order and declared parameters', () => {
  const session = new GameSession(gomoku);
  assert.throws(() => session.executeAction('player', place(1, 1)), /尚未开局/);
  session.executeAction('player', { action: 'new', starter: 'agent' });
  assert.throws(() => session.executeAction('player', place(1, 1)), /不是你的回合/);
  assert.throws(() => session.executeAction('agent', { action: 'act', move: 'fly' }), /不能执行动作/);
  assert.throws(() => session.executeAction('agent', place(0, 1)), /超出范围/);
  assert.throws(() => session.executeAction('agent', place(1.5, 1)), /整数/);
  assert.throws(() => session.executeAction('agent', { action: 'act', move: 'place', args: { x: 1, y: 1, z: 1 } }), /未知参数/);
  session.executeAction('agent', place(8, 8));
  assert.equal(session.turn, 'player');
  assert.throws(() => session.executeAction('player', { action: 'new' }), /进行中/);
});

test('gomoku: occupied points are rejected and five in a row wins', () => {
  const session = new GameSession(gomoku);
  session.executeAction('player', { action: 'new' });
  for (let x = 1; x <= 4; x++) {
    session.executeAction('player', place(x, 1));
    if (x === 1) assert.throws(() => session.executeAction('agent', place(1, 1)), /已有棋子/);
    session.executeAction('agent', place(x, 2));
  }
  session.executeAction('player', place(5, 1));
  const state = session.getStateForRole('agent');
  assert.equal(state.status, 'ended');
  assert.deepEqual(state.result!.winners, ['player']);
  assert.deepEqual(state.availableActions, []);
  assert.match(state.summary, /X {2}X {2}X {2}X {2}X/);
});

test('liars dice: hides opponent dice, enforces raises, resolves on open', () => {
  const session = new GameSession(dice);
  session.executeAction('player', { action: 'new' });
  const before = session.getStateForRole('player').data as DiceView;
  assert.equal(before.opponentDice, undefined);
  assert.deepEqual(session.getStateForRole('player').availableActions.map(action => action.name), ['call']);
  session.executeAction('player', { action: 'act', move: 'call', args: { count: 3, point: 4 } });
  assert.throws(() => session.executeAction('agent', { action: 'act', move: 'call', args: { count: 3, point: 3 } }), /至少要 4 个/);
  assert.equal((session.getStateForRole('agent').data as DiceView).minimumCountByPoint[5], 3);
  session.executeAction('agent', { action: 'act', move: 'open' });
  const after = session.getStateForRole('player');
  assert.equal(after.status, 'ended');
  assert.equal((after.data as DiceView).opponentDice!.length, 5);
  assert.equal(after.result!.winners.length, 1);
});

test('server: agent wait wakes when the player acts', async () => {
  const server = createGameServer(await loadGame('gomoku'), { agentToken: 'agent' });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, token: string, body: unknown) => fetch(base + path, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body)
  }).then(res => res.json());
  try {
    const { playerToken } = await post('/api/v1/player/auth', '', {});
    await post('/api/v1/action', playerToken, { action: 'new' });
    const waiting = post('/api/v1/wait', 'agent', { after: 1 });
    await post('/api/v1/action', playerToken, place(8, 8));
    const woke = await waiting;
    const idle = await post('/api/v1/wait', playerToken, { timeoutMs: 50, waitFor: 'event' });
    assert.equal(idle.timedOut, true);
    assert.equal(woke.state.isMyTurn, true);
    assert.deepEqual(woke.events.map((event: { type: string }) => event.type), ['place']);
    const page = await fetch(base + '/');
    assert.match(await page.text(), /五子棋/);
    assert.equal((await fetch(base + '/_kana/client.js')).status, 200);
    assert.equal((await fetch(base + '/../package.json')).status, 404);
  } finally {
    server.close();
  }
});
