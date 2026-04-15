import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AstmendError,
  analyzeReferencesFromFile,
  analyzeReferencesFromText,
  analyzeReferencesFromProject,
  batchAnalyzeReferencesFromText,
  batchAnalyzeReferencesFromProject,
  detectImpactFromFile,
  detectImpactFromText,
} from '../src/index.js';

describe('phase 4 reference analysis', () => {
  const sourceText = `export function foo() {
  return 1;
}

function bar() {
  return foo();
}

const value = foo();
`;

  it('finds references for a function target', () => {
    const report = analyzeReferencesFromText(sourceText, {
      kind: 'function',
      name: 'foo',
    });

    expect(report.isExported).toBe(true);
    expect(report.exportKind).toBe('named');
    expect(report.definition).toMatchObject({ line: 1, column: 17, isDefinition: true });
    expect(report.references).toHaveLength(2);
    expect(report.references[0]).toMatchObject({ line: 6, column: 10 });
    expect(report.references[1]).toMatchObject({ line: 9, column: 15 });
  });

  it('detects default exported declarations', () => {
    const report = analyzeReferencesFromText(
      `export default function foo() {
  return 1;
}

foo();
`,
      {
        kind: 'function',
        name: 'foo',
      },
    );

    expect(report.isExported).toBe(true);
    expect(report.exportKind).toBe('default');
  });

  it('reports non-exported declarations as not exported', () => {
    const report = analyzeReferencesFromText(
      `function foo() {
  return 1;
}

foo();
`,
      {
        kind: 'function',
        name: 'foo',
      },
    );

    expect(report.isExported).toBe(false);
    expect(report.exportKind).toBeNull();
  });

  it('detects impacted declarations for a function target', () => {
    const impacted = detectImpactFromText(sourceText, {
      kind: 'function',
      name: 'foo',
    });

    expect(impacted).toHaveLength(2);
    expect(impacted[0]).toMatchObject({
      kind: 'FunctionDeclaration',
      name: 'bar',
      line: 5,
      referenceCount: 1,
    });
    expect(impacted[1]).toMatchObject({
      kind: 'VariableDeclaration',
      name: 'value',
      line: 9,
      referenceCount: 1,
    });
  });

  it('picks the nearest declaration as an impact owner', () => {
    const nestedSource = `export function foo() {
  return 1;
}

function wrapper() {
  const local = foo();
  return local;
}
`;
    const impacted = detectImpactFromText(nestedSource, {
      kind: 'function',
      name: 'foo',
    });

    expect(impacted).toHaveLength(1);
    expect(impacted[0]).toMatchObject({
      kind: 'VariableDeclaration',
      name: 'local',
    });
  });

  it('supports all target kinds', () => {
    const kindSource = `type Alias = string;
interface Shape { id: Alias }
class Box { value: Alias = 'x' }
enum Kind { A = 'A' }
const base = 'v';

function useAll(v: Alias, b: Box, k: Kind) {
  const local = base;
  return [v, b.value, k, local];
}
`;

    expect(
      analyzeReferencesFromText(kindSource, {
        kind: 'type_alias',
        name: 'Alias',
      }).references.length,
    ).toBeGreaterThan(0);
    expect(
      analyzeReferencesFromText(kindSource, {
        kind: 'interface',
        name: 'Shape',
      }).references.length,
    ).toBe(0);
    expect(
      analyzeReferencesFromText(kindSource, {
        kind: 'class',
        name: 'Box',
      }).references.length,
    ).toBeGreaterThan(0);
    expect(
      analyzeReferencesFromText(kindSource, {
        kind: 'enum',
        name: 'Kind',
      }).references.length,
    ).toBeGreaterThan(0);
    expect(
      analyzeReferencesFromText(kindSource, {
        kind: 'variable',
        name: 'base',
      }).references.length,
    ).toBeGreaterThan(0);
  });

  it('supports file-based reference analysis APIs', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'astmend-phase4-'));
    const filePath = path.join(tempDir, 'sample.ts');
    await writeFile(
      filePath,
      `export function foo() { return 1; }
const local = foo();
`,
      'utf8',
    );

    const analysis = await analyzeReferencesFromFile(filePath, {
      kind: 'function',
      name: 'foo',
    });
    const impacted = await detectImpactFromFile(filePath, {
      kind: 'function',
      name: 'foo',
    });

    expect(analysis.references).toHaveLength(1);
    expect(impacted).toHaveLength(1);
    expect(impacted[0]).toMatchObject({
      kind: 'VariableDeclaration',
      name: 'local',
    });
  });

  it('analyzes multiple targets in one pass', () => {
    const batchSource = `function foo() {
  return bar();
}

function bar() {
  return 1;
}

const value = foo();
const other = bar();
`;

    const reports = batchAnalyzeReferencesFromText(batchSource, [
      { kind: 'function', name: 'foo' },
      { kind: 'function', name: 'bar' },
    ]);

    expect(reports).toHaveLength(2);
    expect(reports[0].target).toMatchObject({ kind: 'function', name: 'foo' });
    expect(reports[0].references).toHaveLength(1);
    expect(reports[1].target).toMatchObject({ kind: 'function', name: 'bar' });
    expect(reports[1].references).toHaveLength(2);
  });

  it('analyzes references across files in a project', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'astmend-project-'));

    await writeFile(
      path.join(tempDir, 'tsconfig.json'),
      `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["**/*.ts"]
}
`,
      'utf8',
    );

    await writeFile(
      path.join(tempDir, 'foo.ts'),
      `export function foo() {
  return 1;
}
`,
      'utf8',
    );

    await writeFile(
      path.join(tempDir, 'bar.ts'),
      `import { foo } from './foo';

export const value = foo();
`,
      'utf8',
    );

    const report = await analyzeReferencesFromProject(tempDir, 'foo.ts', {
      kind: 'function',
      name: 'foo',
    });

    expect(report.definition.file?.endsWith('foo.ts')).toBe(true);
    expect(report.definition.isDefinition).toBe(true);
    expect(report.references.some((entry) => entry.file?.endsWith('bar.ts'))).toBe(true);
  });

  it('analyzes multiple targets across files in a project', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'astmend-project-batch-'));

    await writeFile(
      path.join(tempDir, 'tsconfig.json'),
      `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["**/*.ts"]
}
`,
      'utf8',
    );

    await writeFile(
      path.join(tempDir, 'foo.ts'),
      `export function foo() {
  return 1;
}

export function bar() {
  return foo();
}
`,
      'utf8',
    );

    await writeFile(
      path.join(tempDir, 'consumer.ts'),
      `import { foo, bar } from './foo';

export const value = foo() + bar();
`,
      'utf8',
    );

    const reports = await batchAnalyzeReferencesFromProject(tempDir, 'foo.ts', [
      { kind: 'function', name: 'foo' },
      { kind: 'function', name: 'bar' },
    ]);

    expect(reports).toHaveLength(2);
    expect(reports[0].references.some((entry) => entry.file?.endsWith('consumer.ts'))).toBe(true);
    expect(reports[1].references.some((entry) => entry.file?.endsWith('consumer.ts'))).toBe(true);
  });

  it('throws when reference target is missing', () => {
    expect(() =>
      analyzeReferencesFromText(sourceText, {
        kind: 'function',
        name: 'missing',
      }),
    ).toThrowError(AstmendError);
  });

  it('throws when reference target is ambiguous', () => {
    expect(() =>
      analyzeReferencesFromText(
        `function dup() { return 1; }
function dup() { return 2; }
dup();
`,
        {
          kind: 'function',
          name: 'dup',
        },
      ),
    ).toThrowError(AstmendError);
  });

  it('handles top-level references without impact owners', () => {
    const impacted = detectImpactFromText(
      `function foo() { return 1; }
foo();
`,
      {
        kind: 'function',
        name: 'foo',
      },
    );

    expect(impacted).toHaveLength(0);
  });

  it('labels constructor impacts as constructor', () => {
    const impacted = detectImpactFromText(
      `class User {}
class Holder {
  constructor() {
    return new User();
  }
}
`,
      {
        kind: 'class',
        name: 'User',
      },
    );

    expect(impacted).toHaveLength(1);
    expect(impacted[0]).toMatchObject({
      kind: 'Constructor',
      name: 'constructor',
    });
  });
});
