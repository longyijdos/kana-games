import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../src/skills.js';

test('skills: installs bundled skills, keeps existing ones unless forced', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kana-games-skills-'));
  process.env.KANA_HOME = root;
  try {
    const first = installSkills('kana', false);
    assert.equal(first.dir, path.join(root, 'skills'));
    assert.deepEqual(first.results.map(result => result.status), ['installed', 'installed']);
    assert.ok(fs.existsSync(path.join(root, 'skills/kana-games-play/references/gomoku.md')));
    fs.writeFileSync(path.join(root, 'skills/kana-games-play/SKILL.md'), 'local edit');
    assert.deepEqual(installSkills('kana', false).results.map(result => result.status), ['skipped', 'skipped']);
    assert.deepEqual(installSkills(path.join(root, 'skills'), true).results.map(result => result.status), ['replaced', 'replaced']);
    assert.notEqual(fs.readFileSync(path.join(root, 'skills/kana-games-play/SKILL.md'), 'utf8'), 'local edit');
  } finally {
    delete process.env.KANA_HOME;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
