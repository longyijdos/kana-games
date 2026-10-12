import { chmodSync, cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// tsc compiles the TypeScript; copy the pages' static files next to it.
const root = fileURLToPath(new URL('../../', import.meta.url));
cpSync(path.join(root, 'games'), path.join(root, 'dist/games'), {
  recursive: true,
  filter: file => !file.endsWith('.ts')
});
chmodSync(path.join(root, 'dist/src/cli.js'), 0o755);
