import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GameDefinition } from './game.js';

const BUILTIN_DIR = path.join(import.meta.dirname, '..', 'games');
const REQUIRED = ['id', 'name', 'rules', 'setup', 'actions', 'act', 'view', 'format'] as const;

export interface LoadedGame {
  game: GameDefinition;
  webDir: string;
}

export const builtinGames = () => fs.readdirSync(BUILTIN_DIR).sort();

/** Load a built-in game by id, or a game directory by path (starting with . or /). */
export async function loadGame(spec: string): Promise<LoadedGame> {
  const external = spec.startsWith('.') || path.isAbsolute(spec);
  const dir = external ? path.resolve(spec) : path.join(BUILTIN_DIR, spec);
  if (!external && !builtinGames().includes(spec)) {
    throw new Error(`未知游戏: ${spec}。内置游戏: ${builtinGames().join('、')}；外部游戏请传目录路径，如 ./my-game`);
  }
  const file = ['game.js', 'game.ts'].map(name => path.join(dir, name)).find(fs.existsSync);
  if (!file) throw new Error(`${dir} 中没有 game.js 或 game.ts`);
  const game = (await import(pathToFileURL(file).href)).default as GameDefinition;
  const missing = REQUIRED.filter(key => game?.[key] === undefined);
  if (missing.length) throw new Error(`${file} 的默认导出缺少: ${missing.join(', ')}`);
  return { game, webDir: path.join(dir, 'web') };
}
