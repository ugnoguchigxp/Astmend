import { execFile as execFileCallback } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { AstmendError } from '../engine/errors.js';
import type { ContextOptions } from './schema.js';

const execFile = promisify(execFileCallback);

export interface DiffSource {
  mode: 'git' | 'diff-file';
  diffText: string;
  base: string | null;
  head: string | null;
}

const normalizeRepoRoot = (repoRoot: string): string => path.resolve(repoRoot);

const runGit = async (repoRoot: string, args: string[]): Promise<string> => {
  try {
    const { stdout } = await execFile('git', ['-C', repoRoot, ...args], {
      maxBuffer: 1024 * 1024 * 25,
    });
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AstmendError(
      'INVALID_INPUT',
      `Failed to run git command: git ${args.join(' ')} (${message})`,
    );
  }
};

export const readDiffSource = async (options: ContextOptions): Promise<DiffSource> => {
  const repoRoot = normalizeRepoRoot(options.repoRoot);
  if (options.diffFile) {
    if (options.base || options.head) {
      throw new AstmendError('INVALID_INPUT', 'diffFile cannot be combined with base/head.');
    }
    const diffText = await fs.readFile(path.resolve(repoRoot, options.diffFile), 'utf8');
    return {
      mode: 'diff-file',
      diffText,
      base: null,
      head: null,
    };
  }

  const base = options.base ?? 'HEAD~1';
  const head = options.head ?? 'HEAD';
  const diffText = await runGit(repoRoot, ['diff', '--no-ext-diff', '--unified=3', base, head]);
  return {
    mode: 'git',
    diffText,
    base,
    head,
  };
};

export const readFileFromGitRef = async (
  repoRoot: string,
  ref: string,
  filePath: string,
): Promise<string | undefined> => {
  try {
    return await runGit(repoRoot, ['show', `${ref}:${filePath}`]);
  } catch {
    return undefined;
  }
};
