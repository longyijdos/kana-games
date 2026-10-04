import { chmodSync, cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
mkdirSync(path.join(root, 'dist/web'), { recursive: true });
cpSync(path.join(root, 'web'), path.join(root, 'dist/web'), {
  recursive: true,
  filter: file => !file.endsWith('.ts')
});
chmodSync(path.join(root, 'dist/src/cli.js'), 0o755);
