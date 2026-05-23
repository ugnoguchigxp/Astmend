import { promises as fs } from 'node:fs';
import path from 'node:path';

const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage']);

const toPosixPath = (value: string): string => value.split(path.sep).join(path.posix.sep);

export const normalizeRepoRelativePath = (value: string): string =>
  toPosixPath(path.posix.normalize(value.replace(/^\.\/+/, '')));

export const stripGitPrefix = (value: string): string => {
  const normalized = normalizeRepoRelativePath(value);
  if (normalized.startsWith('a/')) {
    return normalized.slice(2);
  }
  if (normalized.startsWith('b/')) {
    return normalized.slice(2);
  }
  return normalized;
};

export const toRelativePath = (repoRoot: string, absolutePath: string): string =>
  normalizeRepoRelativePath(path.relative(repoRoot, absolutePath));

export const isTypeScriptLikeFile = (filePath: string): boolean =>
  /\.(ts|tsx|mts|cts)$/i.test(filePath) && !/\.d\.ts$/i.test(filePath);

const collectTypeScriptFiles = async (directory: string, output: string[]): Promise<void> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }
      await collectTypeScriptFiles(absolute, output);
      continue;
    }
    if (entry.isFile() && isTypeScriptLikeFile(entry.name)) {
      output.push(absolute);
    }
  }
};

export const resolveTargetFiles = async (
  repoRoot: string,
  files?: string[],
): Promise<{ files: string[]; warnings: string[] }> => {
  if (files) {
    if (files.length === 0) {
      return { files: [], warnings: [] };
    }
    const warnings: string[] = [];
    const resolved = files.map((file) => path.resolve(repoRoot, file));
    const existing: string[] = [];
    for (const absolutePath of resolved) {
      try {
        const stats = await fs.stat(absolutePath);
        if (stats.isFile()) {
          existing.push(absolutePath);
        } else {
          warnings.push(`Not a file: ${toRelativePath(repoRoot, absolutePath)}`);
        }
      } catch {
        warnings.push(`File not found: ${toRelativePath(repoRoot, absolutePath)}`);
      }
    }
    return {
      files: existing,
      warnings,
    };
  }

  const discovered: string[] = [];
  await collectTypeScriptFiles(repoRoot, discovered);
  return {
    files: discovered,
    warnings: [],
  };
};
