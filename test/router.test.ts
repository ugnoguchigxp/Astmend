import { describe, expect, it } from 'vitest';
import { applyPatchToText } from '../src/index.js';

describe('applyPatchToText', () => {
  it('adds a parameter to a function', () => {
    const result = applyPatchToText(
      {
        type: 'update_function',
        file: 'src/userService.ts',
        name: 'getUser',
        changes: {
          add_param: {
            name: 'includeDeleted',
            type: 'boolean',
          },
        },
      },
      `export function getUser(id: string) {
  return id;
}
`,
    );

    expect(result.success).toBe(true);
    expect(result.patchedFiles).toContain('src/userService.ts');
    expect(result.updatedText).toContain('getUser(id: string, includeDeleted: boolean)');
    expect(result.diff).toContain('includeDeleted: boolean');
  });

  it('adds a property to an interface', () => {
    const result = applyPatchToText(
      {
        type: 'update_interface',
        file: 'src/userTypes.ts',
        name: 'User',
        changes: {
          add_property: {
            name: 'isDeleted',
            type: 'boolean',
          },
        },
      },
      `export interface User {
  id: string;
}
`,
    );

    expect(result.success).toBe(true);
    expect(result.patchedFiles).toContain('src/userTypes.ts');
    expect(result.updatedText).toContain('isDeleted: boolean;');
    expect(result.diff).toContain('isDeleted: boolean;');
  });

  it('is idempotent when the same function parameter already exists', () => {
    const result = applyPatchToText(
      {
        type: 'update_function',
        file: 'src/userService.ts',
        name: 'getUser',
        changes: {
          add_param: {
            name: 'includeDeleted',
            type: 'boolean',
          },
        },
      },
      `export function getUser(id: string, includeDeleted: boolean) {
  return id;
}
`,
    );

    expect(result.success).toBe(true);
    expect(result.patchedFiles).toHaveLength(0);
    expect(result.diff).toBe('');
  });

  it('rejects conflicting changes', () => {
    const result = applyPatchToText(
      {
        type: 'update_interface',
        file: 'src/userTypes.ts',
        name: 'User',
        changes: {
          add_property: {
            name: 'id',
            type: 'number',
          },
        },
      },
      `export interface User {
  id: string;
}
`,
    );

    expect(result.success).toBe(false);
    expect(result.rejects[0].reason).toBe('CONFLICT');
    expect(result.diagnostics[0]).toContain('already exists');
  });

  it('rejects invalid input shape', () => {
    const result = applyPatchToText(
      {
        type: 'update_function',
        file: 'src/userService.ts',
        name: 'getUser',
        changes: {},
      },
      `export function getUser(id: string) {
  return id;
}
`,
    );

    expect(result.success).toBe(false);
    expect(result.rejects[0].reason).toBe('INVALID_PATCH_SCHEMA');
  });

  it('normalizes reject path when file is not a string', () => {
    const result = applyPatchToText(
      {
        type: 'update_function',
        file: 123,
        name: 'getUser',
        changes: {},
      },
      `export function getUser(id: string) {
  return id;
}
`,
    );

    expect(result.success).toBe(false);
    expect(result.rejects[0]).toMatchObject({
      path: 'unknown',
      reason: 'INVALID_PATCH_SCHEMA',
    });
  });

  it('rejects invalid TypeScript source', () => {
    const result = applyPatchToText(
      {
        type: 'update_function',
        file: 'src/userService.ts',
        name: 'getUser',
        changes: {
          add_param: {
            name: 'includeDeleted',
            type: 'boolean',
          },
        },
      },
      `export function getUser(id: string) {
  return id;
`,
    );

    expect(result.success).toBe(false);
    expect(result.rejects[0].reason).toBe('UNKNOWN');
  });
});
