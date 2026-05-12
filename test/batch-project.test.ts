import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyPatchBatchFromProject,
  applyPatchBatchToFiles,
  validatePatchBatchOperation,
  validatePatchProjectOperation,
} from '../src/index.js';

describe('multi-file patch batch', () => {
  it('applies sequential operations across multiple files in memory', async () => {
    const result = await applyPatchBatchToFiles(
      {
        operations: [
          {
            type: 'update_function',
            file: 'src/a.ts',
            name: 'getUser',
            changes: {
              add_param: { name: 'includeDeleted', type: 'boolean' },
            },
          },
          {
            type: 'update_interface',
            file: 'src/b.ts',
            name: 'User',
            changes: {
              add_property: { name: 'name', type: 'string' },
            },
          },
        ],
      },
      {
        'src/a.ts': `export function getUser(id: string) {
  return id;
}
`,
        'src/b.ts': `export interface User {
  id: string;
}
`,
      },
    );

    expect(result.success).toBe(true);
    expect(result.patchedFiles).toEqual(['src/a.ts', 'src/b.ts']);
    expect(result.diffByFile['src/a.ts']).toContain('includeDeleted');
    expect(result.diffByFile['src/b.ts']).toContain('name: string');
    expect(result.operationResults).toEqual([
      { index: 0, file: 'src/a.ts', success: true, changed: true },
      { index: 1, file: 'src/b.ts', success: true, changed: true },
    ]);
  });

  it('continues after reject when stopOnReject is false', async () => {
    const result = await applyPatchBatchToFiles(
      {
        stopOnReject: false,
        operations: [
          {
            type: 'update_function',
            file: 'src/a.ts',
            name: 'missing',
            changes: {
              add_param: { name: 'flag', type: 'boolean' },
            },
          },
          {
            type: 'add_import',
            file: 'src/b.ts',
            module: './types',
            named: [{ name: 'User' }],
          },
        ],
      },
      {
        'src/a.ts': `export function getUser(id: string) {
  return id;
}
`,
        'src/b.ts': `export function hello() {
  return 'hello';
}
`,
      },
    );

    expect(result.success).toBe(false);
    expect(result.rejects[0].reason).toBe('SYMBOL_NOT_FOUND');
    expect(result.patchedFiles).toEqual(['src/b.ts']);
    expect(result.diffByFile['src/b.ts']).toContain("import { User } from './types';");
    expect(result.operationResults).toEqual([
      { index: 0, file: 'src/a.ts', success: false, changed: false },
      { index: 1, file: 'src/b.ts', success: true, changed: true },
    ]);
  });

  it('validates project batch schema without applying changes', () => {
    expect(
      validatePatchProjectOperation({
        operations: [
          {
            type: 'update_function',
            file: 'src/a.ts',
            name: 'a',
            changes: {
              add_param: { name: 'b', type: 'string' },
            },
          },
        ],
      }),
    ).toEqual({ valid: true });

    const invalid = validatePatchProjectOperation({
      operations: [
        {
          type: 'update_function',
          file: 'src/a.ts',
          name: 'a',
          changes: {},
        },
      ],
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors?.[0]).toContain('changes');
  });

  it('loads files from disk for project batch apply', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'astmend-project-batch-'));

    try {
      const aPath = join(directory, 'a.ts');
      const bPath = join(directory, 'b.ts');

      await writeFile(
        aPath,
        `export function getUser(id: string) {
  return id;
}
`,
      );
      await writeFile(
        bPath,
        `export interface User {
  id: string;
}
`,
      );

      const result = await applyPatchBatchFromProject({
        operations: [
          {
            type: 'update_function',
            file: aPath,
            name: 'getUser',
            changes: {
              add_param: { name: 'activeOnly', type: 'boolean' },
            },
          },
          {
            type: 'update_interface',
            file: bPath,
            name: 'User',
            changes: {
              add_property: { name: 'active', type: 'boolean' },
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.patchedFiles).toEqual([aPath, bPath]);
      expect(result.diffByFile[aPath]).toContain('activeOnly');
      expect(result.diffByFile[bPath]).toContain('active: boolean');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('returns FILE_NOT_FOUND when source text is missing in memory mode', async () => {
    const result = await applyPatchBatchToFiles(
      {
        operations: [
          {
            type: 'update_function',
            file: 'src/missing.ts',
            name: 'getUser',
            changes: {
              add_param: { name: 'activeOnly', type: 'boolean' },
            },
          },
        ],
      },
      {},
    );

    expect(result.success).toBe(false);
    expect(result.rejects).toEqual([
      {
        path: 'src/missing.ts',
        reason: 'FILE_NOT_FOUND',
      },
    ]);
    expect(result.operationResults).toEqual([
      {
        index: 0,
        file: 'src/missing.ts',
        success: false,
        changed: false,
      },
    ]);
  });

  it('returns INVALID_PATCH_SCHEMA when in-memory source is not a string', async () => {
    const sourceTextByFile = {
      'src/a.ts': 123,
    } as unknown as Record<string, string>;

    const result = await applyPatchBatchToFiles(
      {
        operations: [
          {
            type: 'update_function',
            file: 'src/a.ts',
            name: 'getUser',
            changes: {
              add_param: { name: 'activeOnly', type: 'boolean' },
            },
          },
        ],
      },
      sourceTextByFile,
    );

    expect(result.success).toBe(false);
    expect(result.rejects[0]).toEqual({
      path: 'src/a.ts',
      reason: 'INVALID_PATCH_SCHEMA',
    });
    expect(result.diagnostics[0]).toContain('must be a string');
  });

  it('validates single-file batch and reports cross-file mismatches', () => {
    expect(
      validatePatchBatchOperation({
        file: 'src/a.ts',
        operations: [
          {
            type: 'update_function',
            file: 'src/a.ts',
            name: 'a',
            changes: {
              add_param: { name: 'b', type: 'string' },
            },
          },
        ],
      }),
    ).toEqual({ valid: true });

    const mismatch = validatePatchBatchOperation({
      file: 'src/a.ts',
      operations: [
        {
          type: 'update_function',
          file: 'src/b.ts',
          name: 'a',
          changes: {
            add_param: { name: 'b', type: 'string' },
          },
        },
      ],
    });

    expect(mismatch.valid).toBe(false);
    expect(mismatch.errors).toEqual(['Batch operation 0 targets src/b.ts, expected src/a.ts']);
  });
});
