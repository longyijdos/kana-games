import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SOURCE_DIR = path.join(import.meta.dirname, '..', '..', 'skills');
const home = () => process.env.HOME || os.homedir();

/** Global skill directories of common agents; anything else is treated as a directory path. */
export const SKILL_TARGETS: Record<string, () => string> = {
  claude: () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home(), '.claude'), 'skills'),
  codex: () => path.join(process.env.CODEX_HOME || path.join(home(), '.codex'), 'skills'),
  kana: () => path.join(process.env.KANA_HOME || path.join(home(), '.kana'), 'skills')
};

/** Copy every bundled skill into target. Existing skills are kept unless force is set. */
export function installSkills(target: string, force: boolean) {
  const dir = SKILL_TARGETS[target] ? SKILL_TARGETS[target]() : path.resolve(target);
  fs.mkdirSync(dir, { recursive: true });
  const results = fs.readdirSync(SOURCE_DIR).sort().map(name => {
    const destination = path.join(dir, name);
    const exists = fs.existsSync(destination);
    if (exists && !force) return { name, status: 'skipped' as const };
    fs.rmSync(destination, { recursive: true, force: true });
    fs.cpSync(path.join(SOURCE_DIR, name), destination, { recursive: true });
    return { name, status: exists ? 'replaced' as const : 'installed' as const };
  });
  return { dir, results };
}
