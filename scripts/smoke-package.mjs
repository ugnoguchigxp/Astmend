import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
const smokeDir = await mkdtemp(path.join(tmpdir(), 'astmend-smoke-package-'));

try {
  run('npm', ['init', '-y'], { cwd: smokeDir });
  run('npm', ['install', tarballPath], { cwd: smokeDir });
  run('node', ['-e', "import('astmend')"], { cwd: smokeDir });
  run('node', ['-e', "import('astmend/mcp/service')"], { cwd: smokeDir });
  run('npx', ['astmend', 'version'], { cwd: smokeDir });
  run('npx', ['astmend', 'context', '--help'], { cwd: smokeDir });
  run('npx', ['astmend', 'mcp'], { cwd: smokeDir, input: '' });
} finally {
  await rm(smokeDir, { recursive: true, force: true });
  await rm(tarballPath, { force: true });
}
