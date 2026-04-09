import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AstmendError,
  analyzeReferencesFromFile,
  analyzeReferencesFromText,
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

    expect(report.references).toHaveLength(2);
    expect(report.references[0]).toMatchObject({ line: 6, column: 10 });
    expect(report.references[1]).toMatchObject({ line: 9, column: 15 });
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
