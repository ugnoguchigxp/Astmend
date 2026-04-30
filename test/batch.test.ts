import { describe, expect, it } from 'vitest';
import { applyPatchBatchToText } from '../src/index.js';

describe('patch batch', () => {
  const sourceText = `export function getUser(id: string) {
  return id;
}
`;

  it('applies multiple operations to text and returns one final diff', () => {
    const result = applyPatchBatchToText(
      {
        file: 'src/user.ts',
        operations: [
          {
            type: 'add_import',
            file: 'src/user.ts',
            module: './types',
            named: [{ name: 'User' }],
          },
          {
            type: 'update_function',
            file: 'src/user.ts',
            name: 'getUser',
            changes: {
              add_param: {
                name: 'includeDeleted',
                type: 'boolean',
              },
            },
          },
        ],
      },
      sourceText,
    );

    expect(result.success).toBe(true);
    expect(result.patchedFiles).toEqual(['src/user.ts']);
    expect(result.updatedText).toContain("import { User } from './types';");
    expect(result.updatedText).toContain('getUser(id: string, includeDeleted: boolean)');
    expect(result.diff).toContain('includeDeleted');
  });

  it('is idempotent when every operation is already applied', () => {
    const result = applyPatchBatchToText(
      {
        file: 'src/user.ts',
        operations: [
          {
            type: 'add_import',
            file: 'src/user.ts',
            module: './types',
            named: [{ name: 'User' }],
          },
          {
            type: 'update_function',
            file: 'src/user.ts',
            name: 'getUser',
            changes: {
              add_param: {
                name: 'includeDeleted',
                type: 'boolean',
              },
            },
          },
        ],
      },
      `import { User } from './types';

export function getUser(id: string, includeDeleted: boolean) {
  return id;
}
`,
    );

    expect(result.success).toBe(true);
    expect(result.patchedFiles).toEqual([]);
    expect(result.diff).toBe('');
  });

  it('stops on reject by default', () => {
    const result = applyPatchBatchToText(
      {
        file: 'src/user.ts',
        operations: [
          {
            type: 'update_function',
            file: 'src/user.ts',
            name: 'missing',
            changes: {
              add_param: {
                name: 'includeDeleted',
                type: 'boolean',
              },
            },
          },
          {
            type: 'add_import',
            file: 'src/user.ts',
            module: './types',
            named: [{ name: 'User' }],
          },
        ],
      },
      sourceText,
    );

    expect(result.success).toBe(false);
    expect(result.rejects[0].reason).toBe('SYMBOL_NOT_FOUND');
    expect(result.updatedText).not.toContain("import { User } from './types';");
  });

  it('continues after reject when stopOnReject is false', () => {
    const result = applyPatchBatchToText(
      {
        file: 'src/user.ts',
        stopOnReject: false,
        operations: [
          {
            type: 'update_function',
            file: 'src/user.ts',
            name: 'missing',
            changes: {
              add_param: {
                name: 'includeDeleted',
                type: 'boolean',
              },
            },
          },
          {
            type: 'add_import',
            file: 'src/user.ts',
            module: './types',
            named: [{ name: 'User' }],
          },
        ],
      },
      sourceText,
    );

    expect(result.success).toBe(false);
    expect(result.patchedFiles).toEqual(['src/user.ts']);
    expect(result.updatedText).toContain("import { User } from './types';");
    expect(result.diagnostics[0]).toContain('operation 0');
  });
});
