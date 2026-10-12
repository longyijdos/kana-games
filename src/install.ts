import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PACKAGE_DIR = path.join(import.meta.dirname, '..', '..');
const SKILLS_DIR = path.join(PACKAGE_DIR, 'skills');
const AGENT_FILE = path.join(PACKAGE_DIR, 'agents', 'kana-games-player.md');
const AGENT_NAME = 'kana-games-player';
const home = () => process.env.HOME || os.homedir();

interface Agent { description: string; body: string }

/** Agent homes; each renders the companion subagent in that agent's own format. */
const TARGETS: Record<string, { home(): string; agentFile: string; render(agent: Agent): string }> = {
  claude: {
    home: () => process.env.CLAUDE_CONFIG_DIR || path.join(home(), '.claude'),
    agentFile: `${AGENT_NAME}.md`,
    render: ({ description, body }) => `---\nname: ${AGENT_NAME}\ndescription: ${description}\ntools: Bash, Read\n---\n\n${body}`
  },
  codex: {
    home: () => process.env.CODEX_HOME || path.join(home(), '.codex'),
    agentFile: `${AGENT_NAME}.toml`,
    render: ({ description, body }) =>
      `name = "${AGENT_NAME}"\ndescription = ${JSON.stringify(description)}\ndeveloper_instructions = '''\n${body}'''\n`
  },
  kana: {
    // Kana accepts only description, tools, model and reasoning_effort in a profile.
    home: () => process.env.KANA_HOME || path.join(home(), '.kana'),
    agentFile: `${AGENT_NAME}.md`,
    render: ({ description, body }) => `---\ndescription: ${description}\ntools: [read, shell]\n---\n\n${body}`
  }
};
export const INSTALL_TARGETS = Object.keys(TARGETS);

function readAgent(): Agent {
  const [, frontmatter, body] = fs.readFileSync(AGENT_FILE, 'utf8').split(/^---\n/m);
  return { description: frontmatter.match(/^description: (.*)$/m)![1], body: body.trimStart() };
}

function copy(source: string, destination: string, force: boolean) {
  const exists = fs.existsSync(destination);
  if (exists && !force) return 'skipped' as const;
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true });
  return exists ? 'replaced' as const : 'installed' as const;
}

/**
 * Copy the bundled skills into an agent's skill directory and, for known agents unless
 * skillsOnly is set, the companion subagent. Existing files are kept unless force is set.
 */
export function install(target: string, { force = false, skillsOnly = false } = {}) {
  const known = TARGETS[target];
  const dir = known ? path.join(known.home(), 'skills') : path.resolve(target);
  fs.mkdirSync(dir, { recursive: true });
  const results = fs.readdirSync(SKILLS_DIR).sort()
    .map(name => ({ path: path.join(dir, name), status: copy(path.join(SKILLS_DIR, name), path.join(dir, name), force) }));
  if (known && !skillsOnly) {
    const agentDir = path.join(known.home(), 'agents');
    const file = path.join(agentDir, known.agentFile);
    const exists = fs.existsSync(file);
    if (exists && !force) results.push({ path: file, status: 'skipped' });
    else {
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(file, known.render(readAgent()));
      results.push({ path: file, status: exists ? 'replaced' : 'installed' });
    }
  }
  return results;
}
