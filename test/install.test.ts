import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { install } from '../src/install.js';

const statuses = (results: { status: string }[]) => results.map(result => result.status);

test('install: installs skills and the companion agent, keeps existing files unless forced', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kana-games-skills-'));
  process.env.KANA_HOME = root;
  try {
    assert.deepEqual(statuses(install('kana')), ['installed', 'installed', 'installed']);
    assert.ok(fs.existsSync(path.join(root, 'skills/kana-games-play/references/gomoku.md')));
    const agent = fs.readFileSync(path.join(root, 'agents/kana-games-player.md'), 'utf8');
    // Kana rejects profiles with any other frontmatter field.
    assert.deepEqual(agent.split('---\n')[1].trim().split('\n').map(line => line.split(':')[0]), ['description', 'tools']);
    assert.match(agent, /kana-games wait --port <port> --timeout 240/);

    fs.writeFileSync(path.join(root, 'skills/kana-games-play/SKILL.md'), 'local edit');
    assert.deepEqual(statuses(install('kana')), ['skipped', 'skipped', 'skipped']);
    assert.deepEqual(statuses(install('kana', { force: true })), ['replaced', 'replaced', 'replaced']);
    assert.notEqual(fs.readFileSync(path.join(root, 'skills/kana-games-play/SKILL.md'), 'utf8'), 'local edit');

    // A plain directory, or --skills-only, gets the skills only.
    assert.equal(install(path.join(root, 'other')).length, 2);
    assert.deepEqual(install('kana', { force: true, skillsOnly: true }).map(result => path.basename(result.path)), ['kana-games-create', 'kana-games-play']);
  } finally {
    delete process.env.KANA_HOME;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('install: renders the companion agent for Claude Code and Codex', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kana-games-agents-'));
  process.env.CLAUDE_CONFIG_DIR = path.join(root, 'claude');
  process.env.CODEX_HOME = path.join(root, 'codex');
  try {
    install('claude');
    install('codex');
    const claude = fs.readFileSync(path.join(root, 'claude/agents/kana-games-player.md'), 'utf8');
    assert.match(claude, /^---\nname: kana-games-player\ndescription: .+\ntools: Bash, Read\n---\n\nYou are Kana/);
    const codex = fs.readFileSync(path.join(root, 'codex/agents/kana-games-player.toml'), 'utf8');
    assert.match(codex, /^name = "kana-games-player"\ndescription = ".+"\ndeveloper_instructions = '''\nYou are Kana[^]*'''\n$/);
  } finally {
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CODEX_HOME;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
