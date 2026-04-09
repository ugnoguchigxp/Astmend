import { describe, expect, it } from 'vitest';
import { AstmendError, applyPatchToText } from '../src/index.js';

describe('phase 3 operations', () => {
  it('creates a new import declaration when module import does not exist', () => {
    const result = applyPatchToText(
      {
        type: 'add_import',
        file: 'src/math.ts',
        module: 'node:fs',
        named: [
          {
            name: 'readFileSync',
          },
        ],
      },
      `export const value = 1;
`,
    );

    expect(result.changed).toBe(true);
    expect(result.updatedText).toContain("import { readFileSync } from 'node:fs';");
  });

  it('adds a named import to an existing declaration', () => {
    const result = applyPatchToText(
      {
        type: 'add_import',
        file: 'src/math.ts',
        module: 'node:path',
        named: [
          {
            name: 'resolve',
          },
        ],
      },
      `import { basename } from 'node:path';

export const value = basename('/tmp/a.txt');
`,
    );

    expect(result.changed).toBe(true);
    expect(result.updatedText).toContain("import { basename, resolve } from 'node:path';");
  });

  it('adds unaliased binding even when aliased import already exists', () => {
    const result = applyPatchToText(
      {
        type: 'add_import',
        file: 'src/math.ts',
        module: 'm',
        named: [
          {
            name: 'foo',
          },
        ],
      },
      `import { foo as f } from 'm';

export const value = f;
`,
    );

    expect(result.changed).toBe(true);
    expect(result.updatedText).toContain("import { foo as f, foo } from 'm';");
  });

  it('is idempotent when named import exists in a later duplicate declaration', () => {
    const result = applyPatchToText(
      {
        type: 'add_import',
        file: 'src/math.ts',
        module: 'm',
        named: [
          {
            name: 'b',
          },
        ],
      },
      `import { a } from 'm';
import { b } from 'm';

export const value = a + b;
`,
    );

    expect(result.changed).toBe(false);
    expect(result.diff).toBe('');
    expect(result.updatedText).toBe(`import { a } from 'm';
import { b } from 'm';

export const value = a + b;
`);
  });

  it('removes a named import from a declaration', () => {
    const result = applyPatchToText(
      {
        type: 'remove_import',
        file: 'src/math.ts',
        module: 'node:path',
        named: [
          {
            name: 'basename',
          },
        ],
      },
      `import { basename, resolve } from 'node:path';

export const value = resolve('/tmp', 'a.txt');
`,
    );

    expect(result.changed).toBe(true);
    expect(result.updatedText).not.toContain("import { basename, resolve } from 'node:path';");
    expect(result.updatedText).not.toContain('basename');
  });

  it('removes import declaration when all named specifiers are removed', () => {
    const result = applyPatchToText(
      {
        type: 'remove_import',
        file: 'src/math.ts',
        module: 'node:path',
        named: [
          {
            name: 'resolve',
          },
        ],
      },
      `import { resolve } from 'node:path';

export const value = 1;
`,
    );

    expect(result.changed).toBe(true);
    expect(result.updatedText).not.toContain("from 'node:path'");
  });

  it('removes named import from later duplicate declarations of same module', () => {
    const result = applyPatchToText(
      {
        type: 'remove_import',
        file: 'src/math.ts',
        module: 'm',
        named: [
          {
            name: 'b',
          },
        ],
      },
      `import { a } from 'm';
import { b } from 'm';

export const value = a;
`,
    );

    expect(result.changed).toBe(true);
    expect(result.updatedText).toContain("import { a } from 'm';");
    expect(result.updatedText).not.toContain("import { b } from 'm';");
  });

  it('keeps declaration when default import exists', () => {
    const result = applyPatchToText(
      {
        type: 'remove_import',
        file: 'src/math.ts',
        module: 'node:path',
        named: [
          {
            name: 'resolve',
          },
        ],
      },
      `import path, { resolve } from 'node:path';

export const value = path.sep;
`,
    );

    expect(result.changed).toBe(true);
    expect(result.updatedText).toContain("import path from 'node:path';");
  });

  it('creates a constructor when one does not exist', () => {
    const result = applyPatchToText(
      {
        type: 'update_constructor',
        file: 'src/user.ts',
        class_name: 'User',
        changes: {
          add_param: {
            name: 'includeDeleted',
            type: 'boolean',
          },
        },
      },
      `export class User {
  value = 1;
}
`,
    );

    expect(result.changed).toBe(true);
    expect(result.updatedText).toContain('constructor(includeDeleted: boolean)');
  });

  it('adds parameter to existing constructor', () => {
    const result = applyPatchToText(
      {
        type: 'update_constructor',
        file: 'src/user.ts',
        class_name: 'User',
        changes: {
          add_param: {
            name: 'includeDeleted',
            type: 'boolean',
          },
        },
      },
      `export class User {
  constructor(id: string) {}
}
`,
    );

    expect(result.changed).toBe(true);
    expect(result.updatedText).toContain('constructor(id: string, includeDeleted: boolean)');
  });

  it('is idempotent when constructor parameter already exists', () => {
    const result = applyPatchToText(
      {
        type: 'update_constructor',
        file: 'src/user.ts',
        class_name: 'User',
        changes: {
          add_param: {
            name: 'includeDeleted',
            type: 'boolean',
          },
        },
      },
      `export class User {
  constructor(id: string, includeDeleted: boolean) {}
}
`,
    );

    expect(result.changed).toBe(false);
  });

  it('rejects conflicting constructor changes', () => {
    expect(() =>
      applyPatchToText(
        {
          type: 'update_constructor',
          file: 'src/user.ts',
          class_name: 'User',
          changes: {
            add_param: {
              name: 'includeDeleted',
              type: 'number',
            },
          },
        },
        `export class User {
  constructor(id: string, includeDeleted: boolean) {}
}
`,
      ),
    ).toThrowError(AstmendError);
  });

  it('is idempotent when an import already exists', () => {
    const result = applyPatchToText(
      {
        type: 'add_import',
        file: 'src/math.ts',
        module: 'node:path',
        named: [
          {
            name: 'resolve',
          },
        ],
      },
      `import { basename, resolve } from 'node:path';

export const value = resolve('/tmp', 'a.txt');
`,
    );

    expect(result.changed).toBe(false);
    expect(result.diff).toBe('');
  });

  it('rejects constructor updates for missing classes', () => {
    expect(() =>
      applyPatchToText(
        {
          type: 'update_constructor',
          file: 'src/user.ts',
          class_name: 'MissingUser',
          changes: {
            add_param: {
              name: 'includeDeleted',
              type: 'boolean',
            },
          },
        },
        `export class User {
  value = 1;
}
`,
      ),
    ).toThrowError(AstmendError);
  });
});
