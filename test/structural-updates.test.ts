import { describe, expect, it } from 'vitest';
import { analyzeCodeUnitsFromText, applyPatchToText } from '../src/index.js';

describe('structural patch operations', () => {
  it('updates return types and is idempotent', () => {
    const operation = {
      type: 'update_return_type',
      file: 'src/user.ts',
      target: { kind: 'function', name: 'getUser' },
      returnType: 'string',
    };
    const source = `export function getUser(id: string) {
  return id;
}
`;

    const result = applyPatchToText(operation, source);
    const noop = applyPatchToText(operation, result.updatedText ?? source);

    expect(result.success).toBe(true);
    expect(result.updatedText).toContain('getUser(id: string): string');
    expect(noop.patchedFiles).toEqual([]);
  });

  it('updates parameter types', () => {
    const result = applyPatchToText(
      {
        type: 'update_param_type',
        file: 'src/user.ts',
        target: { kind: 'function', name: 'getUser' },
        paramName: 'id',
        paramType: 'number',
      },
      `export function getUser(id: string): string {
  return String(id);
}
`,
    );

    expect(result.success).toBe(true);
    expect(result.updatedText).toContain('getUser(id: number): string');
  });

  it('updates interface property types', () => {
    const result = applyPatchToText(
      {
        type: 'update_property_type',
        file: 'src/user.ts',
        target: { kind: 'interface', name: 'User', property: 'id' },
        propertyType: 'number',
      },
      `export interface User {
  id: string;
}
`,
    );

    expect(result.success).toBe(true);
    expect(result.updatedText).toContain('id: number;');
  });

  it('replaces function bodies', () => {
    const result = applyPatchToText(
      {
        type: 'replace_function_body',
        file: 'src/user.ts',
        target: { kind: 'function', name: 'getUser' },
        bodyText: 'return id.toUpperCase();',
      },
      `export function getUser(id: string): string {
  return id;
}
`,
    );

    expect(result.success).toBe(true);
    expect(result.updatedText).toContain('return id.toUpperCase();');
  });

  it('rejects invalid replacement function bodies', () => {
    const result = applyPatchToText(
      {
        type: 'replace_function_body',
        file: 'src/user.ts',
        target: { kind: 'function', name: 'getUser' },
        bodyText: 'if (',
      },
      `export function getUser(id: string): string {
  return id;
}
`,
    );

    expect(result.success).toBe(false);
  });

  it('adds and removes interface extends clauses', () => {
    const addResult = applyPatchToText(
      {
        type: 'add_interface_extends',
        file: 'src/user.ts',
        name: 'User',
        extends: 'BaseUser',
      },
      `interface BaseUser {
  id: string;
}

export interface User {
  name: string;
}
`,
    );
    const removeResult = applyPatchToText(
      {
        type: 'remove_interface_extends',
        file: 'src/user.ts',
        name: 'User',
        extends: 'BaseUser',
      },
      addResult.updatedText ?? '',
    );

    expect(addResult.success).toBe(true);
    expect(addResult.updatedText).toContain('export interface User extends BaseUser');
    expect(removeResult.success).toBe(true);
    expect(removeResult.updatedText).toContain('export interface User {');
  });

  it('rejects missing structural targets', () => {
    const result = applyPatchToText(
      {
        type: 'update_param_type',
        file: 'src/user.ts',
        target: { kind: 'function', name: 'getUser' },
        paramName: 'missing',
        paramType: 'number',
      },
      `export function getUser(id: string): string {
  return id;
}
`,
    );

    expect(result.success).toBe(false);
    expect(result.rejects[0].reason).toBe('SYMBOL_NOT_FOUND');
  });

  it('uses target ids to disambiguate methods', () => {
    const source = `export class First {
  run() {
    return 1;
  }
}

export class Second {
  run() {
    return 2;
  }
}
`;
    const secondRun = analyzeCodeUnitsFromText(
      source,
      {
        includeMembers: true,
      },
      'src/service.ts',
    ).find((unit) => unit.kind === 'method' && unit.id.includes('Second.run'));

    const result = applyPatchToText(
      {
        type: 'update_return_type',
        file: 'src/service.ts',
        target: { kind: 'method', name: 'run', id: secondRun?.id },
        returnType: 'number',
      },
      source,
    );

    expect(secondRun).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.updatedText).toContain(`export class Second {
  run(): number`);
  });
});
