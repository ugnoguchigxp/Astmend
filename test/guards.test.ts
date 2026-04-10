import { describe, expect, it } from 'vitest';
import { applyPatchToText } from '../src/index.js';

describe('type validation', () => {
  it('allows local type aliases used in a function parameter', () => {
    const result = applyPatchToText(
      {
        type: 'update_function',
        file: 'src/userService.ts',
        name: 'getUser',
        changes: {
          add_param: {
            name: 'userId',
            type: 'UserId',
          },
        },
      },
      `type UserId = string;

export function getUser(id: string) {
  return id;
}
`,
    );

    expect(result.success).toBe(true);
    expect(result.patchedFiles).toHaveLength(1);
    expect(result.updatedText).toContain('userId: UserId');
  });

  it('rejects unresolved types in interface properties', () => {
    const result = applyPatchToText(
      {
        type: 'update_interface',
        file: 'src/userTypes.ts',
        name: 'User',
        changes: {
          add_property: {
            name: 'profile',
            type: 'MissingType',
          },
        },
      },
      `export interface User {
  id: string;
}
`,
    );

    expect(result.success).toBe(false);
    expect(result.rejects[0].reason).toBe('SYMBOL_NOT_FOUND');
  });

  it('rejects value imports used as type annotations', () => {
    const result = applyPatchToText(
      {
        type: 'update_function',
        file: 'src/userService.ts',
        name: 'getUser',
        changes: {
          add_param: {
            name: 'reader',
            type: 'readFileSync',
          },
        },
      },
      `import { readFileSync } from 'node:fs';

export function getUser(id: string) {
  return id;
}
`,
    );

    expect(result.success).toBe(false);
    expect(result.rejects[0].reason).toBe('SYMBOL_NOT_FOUND');
  });

  it('allows imported type-like bindings by context stubbing', () => {
    const result = applyPatchToText(
      {
        type: 'update_function',
        file: 'src/userService.ts',
        name: 'getUser',
        changes: {
          add_param: {
            name: 'profile',
            type: 'Profile',
          },
        },
      },
      `import type { Profile } from './types';

export function getUser(id: string) {
  return id;
}
`,
    );

    expect(result.success).toBe(true);
    expect(result.patchedFiles).toHaveLength(1);
    expect(result.updatedText).toContain('profile: Profile');
  });

  it('allows namespace-qualified imported types', () => {
    const result = applyPatchToText(
      {
        type: 'update_function',
        file: 'src/userService.ts',
        name: 'getUser',
        changes: {
          add_param: {
            name: 'profile',
            type: 'Types.Profile',
          },
        },
      },
      `import * as Types from './types';

export function getUser(id: string) {
  return id;
}
`,
    );

    expect(result.success).toBe(true);
    expect(result.patchedFiles).toHaveLength(1);
    expect(result.updatedText).toContain('profile: Types.Profile');
  });
});
