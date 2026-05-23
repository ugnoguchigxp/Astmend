import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';

const execFile = promisify(execFileCallback);

const runGit = async (cwd: string, args: string[]): Promise<string> => {
  const { stdout } = await execFile('git', ['-C', cwd, ...args], {
    maxBuffer: 1024 * 1024 * 10,
  });
  return stdout;
};

const createMemoryStream = () => {
  let buffer = '';
  return {
    stream: {
      write(chunk: string | Buffer) {
        buffer += chunk.toString();
        return true;
      },
    } as unknown as NodeJS.WriteStream,
    get value() {
      return buffer;
    },
  };
};

const setupCliRepo = async (): Promise<string> => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'astmend-cli-'));
  await mkdir(path.join(repoRoot, 'src'), { recursive: true });
  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'astmend@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Astmend Test']);

  await writeFile(
    path.join(repoRoot, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: ['src/**/*.ts'] }, null, 2),
    'utf8',
  );
  await writeFile(
    path.join(repoRoot, 'src', 'sample.ts'),
    `export function hello(name: string) {
  return name;
}
`,
    'utf8',
  );
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'initial']);

  await writeFile(
    path.join(repoRoot, 'src', 'sample.ts'),
    `export function hello(name: string, loud: boolean) {
  return loud ? name.toUpperCase() : name;
}
`,
    'utf8',
  );
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'updated']);

  return repoRoot;
};

describe('cli', () => {
  it('prints version', async () => {
    const stdout = createMemoryStream();
    const stderr = createMemoryStream();
    const code = await runCli(['version'], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd: process.cwd(),
    });

    expect(code).toBe(0);
    expect(stdout.value.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(stderr.value).toBe('');
  });

  it('prints help for context command', async () => {
    const stdout = createMemoryStream();
    const stderr = createMemoryStream();
    const code = await runCli(['context', '--help'], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd: process.cwd(),
    });

    expect(code).toBe(0);
    expect(stderr.value).toContain('Usage');
  });

  it('outputs context packet as json', async () => {
    const repoRoot = await setupCliRepo();
    const stdout = createMemoryStream();
    const stderr = createMemoryStream();
    const code = await runCli(
      ['context', '--repo-root', repoRoot, '--base', 'HEAD~1', '--head', 'HEAD'],
      {
        stdout: stdout.stream,
        stderr: stderr.stream,
        cwd: process.cwd(),
      },
    );

    expect(code).toBe(0);
    const payload = JSON.parse(stdout.value) as { schemaVersion: string };
    expect(payload.schemaVersion).toBe('0.1.0');
    expect(stderr.value).toBe('');
  });

  it('returns structured symbols output', async () => {
    const repoRoot = await setupCliRepo();
    const stdout = createMemoryStream();
    const stderr = createMemoryStream();
    const code = await runCli(['symbols', '--repo-root', repoRoot, '--file', 'src/sample.ts'], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd: process.cwd(),
    });

    expect(code).toBe(0);
    const payload = JSON.parse(stdout.value) as { items: unknown[]; warnings: unknown[] };
    expect(Array.isArray(payload.items)).toBe(true);
    expect(Array.isArray(payload.warnings)).toBe(true);
    expect(stderr.value).toBe('');
  });

  it('returns usage error for unknown command', async () => {
    const stdout = createMemoryStream();
    const stderr = createMemoryStream();
    const code = await runCli(['unknown-command'], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd: process.cwd(),
    });

    expect(code).toBe(2);
    expect(stderr.value).toContain('Unknown command');
  });
});
