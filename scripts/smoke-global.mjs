import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();

const run = (command, args, options = {}) => {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    ...options,
  });
};

const read = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });

const packOutputRaw = read('npm', ['pack', '--json']);
const packOutput = JSON.parse(packOutputRaw);
if (
  !Array.isArray(packOutput) ||
  packOutput.length === 0 ||
  typeof packOutput[0]?.filename !== 'string'
) {
  throw new Error('Failed to parse npm pack output.');
}

const tarballName = packOutput[0].filename;
const tarballPath = path.resolve(repoRoot, tarballName);

try {
  run('npm', ['install', '-g', tarballPath]);
  run('astmend', ['version']);
  run('astmend', ['context', '--help']);
  run('astmend', ['mcp'], { input: '' });
} finally {
  try {
    run('npm', ['uninstall', '-g', 'astmend']);
  } finally {
    await rm(tarballPath, { force: true });
  }
}
