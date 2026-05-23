import { parsePatch } from 'diff';
import { normalizeRepoRelativePath, stripGitPrefix } from './files.js';
import type { ChangedFileInfo } from './schema.js';

const normalizePatchPath = (value: string | undefined): string | undefined => {
  if (!value || value === 'unknown' || value === '/dev/null') {
    return undefined;
  }
  return normalizeRepoRelativePath(stripGitPrefix(value));
};

const detectBinaryPaths = (diffText: string): Set<string> => {
  const binaryPaths = new Set<string>();
  const binaryLineRegex = /^Binary files (.+) and (.+) differ$/;
  for (const line of diffText.split('\n')) {
    const match = line.match(binaryLineRegex);
    if (!match) {
      continue;
    }
    const first = normalizePatchPath(match[1]);
    const second = normalizePatchPath(match[2]);
    if (first) {
      binaryPaths.add(first);
    }
    if (second) {
      binaryPaths.add(second);
    }
  }
  return binaryPaths;
};

const detectChangeKind = (
  oldPath: string | undefined,
  newPath: string | undefined,
): ChangedFileInfo['changeKind'] => {
  if (!oldPath && newPath) {
    return 'added';
  }
  if (oldPath && !newPath) {
    return 'deleted';
  }
  if (oldPath && newPath && oldPath !== newPath) {
    return 'renamed';
  }
  return 'modified';
};

export const extractChangedFilesFromDiff = (diffText: string): ChangedFileInfo[] => {
  const binaryPaths = detectBinaryPaths(diffText);
  const patches = parsePatch(diffText);

  return patches.flatMap((patch) => {
    const oldPath = normalizePatchPath(patch.oldFileName);
    const newPath = normalizePatchPath(patch.newFileName);
    if (!oldPath && !newPath && patch.hunks.length === 0) {
      return [];
    }
    const file = newPath ?? oldPath ?? 'unknown';
    const changeKind = detectChangeKind(oldPath, newPath);

    return [
      {
        file,
        changeKind,
        ...(oldPath ? { oldPath } : {}),
        ...(newPath ? { newPath } : {}),
        isBinary: binaryPaths.has(file),
        ranges: patch.hunks.map((hunk) => ({
          beforeStart: hunk.oldStart,
          beforeLines: hunk.oldLines,
          afterStart: hunk.newStart,
          afterLines: hunk.newLines,
        })),
      },
    ];
  });
};
