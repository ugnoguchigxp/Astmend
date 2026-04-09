import { describe, expect, it } from 'vitest';
import { AstmendError, applyPatchToText } from '../src/index.js';

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

    expect(result.changed).toBe(true);
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

    expect(result.changed).toBe(true);
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

    expect(result.changed).toBe(false);
    expect(result.diff).toBe('');
  });

  it('rejects conflicting changes', () => {
    expect(() =>
      applyPatchToText(
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
      ),
    ).toThrowError(AstmendError);
  });

  it('rejects invalid input shape', () => {
    try {
      applyPatchToText(
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
      throw new Error('Expected invalid input to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AstmendError);
      expect((error as AstmendError).code).toBe('INVALID_INPUT');
    }
  });

  it('rejects invalid TypeScript source', () => {
    expect(() =>
      applyPatchToText(
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
      ),
    ).toThrowError(AstmendError);
  });
});
