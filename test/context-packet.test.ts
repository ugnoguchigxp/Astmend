import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  CONTEXT_PACKET_SCHEMA_VERSION,
  contextPacketSchema,
  createContextPacket,
} from '../src/index.js';

const execFile = promisify(execFileCallback);

const runGit = async (cwd: string, args: string[]): Promise<string> => {
  const { stdout } = await execFile('git', ['-C', cwd, ...args], {
    maxBuffer: 1024 * 1024 * 10,
  });
  return stdout;
};

const setupRepo = async (): Promise<string> => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'astmend-context-'));
  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'astmend@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Astmend Test']);

  await writeFile(
    path.join(repoRoot, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: ['src/**/*.ts'] }, null, 2),
    'utf8',
  );
  await mkdir(path.join(repoRoot, 'src'), { recursive: true });

  await writeFile(
    path.join(repoRoot, 'src', 'app.ts'),
    `export function getUser(id: string) {
  return id;
}

const app = {
  get: (..._args: unknown[]) => {},
};

const db = {
  select() {
    return {
      from: (..._args: unknown[]) => ({
        where: (..._whereArgs: unknown[]) => true,
      }),
    };
  },
};

app.get('/users/:id', auth, async (c: unknown) => {
  return db.select().from(users).where(eq(users.id, c));
});
`,
    'utf8',
  );

  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'initial']);

  await writeFile(
    path.join(repoRoot, 'src', 'app.ts'),
    `export function getUser(id: string, includeDeleted: boolean) {
  return includeDeleted ? id : id.toUpperCase();
}

const app = {
  get: (..._args: unknown[]) => {},
};

const db = {
  select() {
    return {
      from: (..._args: unknown[]) => ({
        where: (..._whereArgs: unknown[]) => true,
      }),
    };
  },
  update: (..._args: unknown[]) => true,
};

app.get('/admin/users/:id', auth, async (c: unknown) => {
  db.update(users);
  return db.select().from(users).where(eq(users.id, c));
});
`,
    'utf8',
  );

  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'updated']);

  return repoRoot;
};

describe('context packet', () => {
  it('builds a schema-valid context packet from git refs', async () => {
    const repoRoot = await setupRepo();
    const packet = await createContextPacket({
      repoRoot,
      base: 'HEAD~1',
      head: 'HEAD',
      includeSourceExcerpt: true,
    });

    expect(packet.schemaVersion).toBe(CONTEXT_PACKET_SCHEMA_VERSION);
    expect(contextPacketSchema.safeParse(packet).success).toBe(true);
    expect(packet.diff.changedFiles.map((file) => file.file)).toContain('src/app.ts');
    expect(packet.changedSymbols.length).toBeGreaterThan(0);
    expect(packet.routes.length).toBeGreaterThan(0);
    expect(packet.dbQueries.length).toBeGreaterThan(0);
    expect(packet.riskHints.length).toBeGreaterThan(0);
    expect(packet.sourceExcerpts?.length ?? 0).toBeGreaterThan(0);
  });

  it('returns warnings in diff-file mode without failing packet generation', async () => {
    const repoRoot = await setupRepo();
    const patchText = await runGit(repoRoot, [
      'diff',
      '--no-ext-diff',
      '--unified=3',
      'HEAD~1',
      'HEAD',
    ]);
    const patchPath = path.join(repoRoot, 'review.patch');
    await writeFile(patchPath, patchText, 'utf8');

    const packet = await createContextPacket({
      repoRoot,
      diffFile: './review.patch',
    });

    expect(packet.diff.changedFiles.length).toBeGreaterThan(0);
    expect(packet.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SYMBOL_EXTRACTION_UNAVAILABLE',
        }),
      ]),
    );
  });

  it('returns empty diff context without unknown-file noise when there are no changes', async () => {
    const repoRoot = await setupRepo();
    const packet = await createContextPacket({
      repoRoot,
      base: 'HEAD',
      head: 'HEAD',
    });

    expect(packet.diff.changedFiles).toEqual([]);
    expect(packet.changedSymbols).toEqual([]);
    expect(packet.routes).toEqual([]);
    expect(packet.dbQueries).toEqual([]);
    expect(packet.riskHints).toEqual([]);
    expect(packet.warnings.some((warning) => warning.code === 'UNKNOWN_FILE_IN_DIFF')).toBe(false);
  });
});
