import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeCodeUnitsFromProject,
  analyzeCodeUnitsFromText,
  generateAstFingerprintFromText,
  resolveSymbolCandidatesFromProject,
  resolveSymbolCandidatesFromText,
} from '../src/index.js';

describe('code unit scanner', () => {
  const sourceText = `export function getUser(id: string): string {
  return id;
}

function localOnly() {
  return 1;
}

export default class UserService {
  value = 1;

  constructor(private readonly baseUrl: string) {}

  findById(id: string): string {
    return id;
  }
}

export interface User {
  id: string;
  role?: 'admin' | 'user';
}

export type Status = 'active' | 'disabled';

export const count = 1;
`;

  it('lists exported top-level code units by default', () => {
    const units = analyzeCodeUnitsFromText(sourceText, { includeMembers: false }, 'src/user.ts');

    expect(units.map((unit) => `${unit.kind}:${unit.name}`)).toEqual([
      'function:getUser',
      'class:UserService',
      'interface:User',
      'type_alias:Status',
      'variable:count',
    ]);
    expect(units.find((unit) => unit.name === 'localOnly')).toBeUndefined();
    expect(units.find((unit) => unit.name === 'UserService')).toMatchObject({
      isExported: true,
      exportKind: 'default',
    });
  });

  it('can include non-exported declarations and members', () => {
    const units = analyzeCodeUnitsFromText(
      sourceText,
      { includeNonExported: true, includeMembers: true },
      'src/user.ts',
    );

    expect(units.map((unit) => `${unit.kind}:${unit.name}`)).toEqual(
      expect.arrayContaining([
        'function:localOnly',
        'constructor:constructor',
        'method:findById',
        'property:value',
        'property:id',
        'property:role',
      ]),
    );
    expect(units.find((unit) => unit.name === 'findById')?.parentId).toContain('class:UserService');
  });

  it('adds type metadata and AST hashes only when requested', () => {
    const plainUnits = analyzeCodeUnitsFromText(sourceText, {}, 'src/user.ts');
    const enrichedUnits = analyzeCodeUnitsFromText(
      sourceText,
      { includeAstHash: true, includeTypeMetadata: true },
      'src/user.ts',
    );

    const plainFunction = plainUnits.find((unit) => unit.name === 'getUser');
    const enrichedFunction = enrichedUnits.find((unit) => unit.name === 'getUser');
    const status = enrichedUnits.find((unit) => unit.name === 'Status');

    expect(plainFunction?.astHash).toBeUndefined();
    expect(plainFunction?.typeMetadata).toBeUndefined();
    expect(enrichedFunction?.astHash).toMatch(/^[a-f0-9]{64}$/);
    expect(enrichedFunction?.typeMetadata).toMatchObject({
      returnType: 'string',
      parameters: [{ name: 'id', type: 'string', optional: false }],
    });
    expect(status?.typeMetadata?.literalUnionValues).toEqual(['active', 'disabled']);
  });

  it('generates the same AST hash for equivalent normalized structures', () => {
    const first = analyzeCodeUnitsFromText(
      `export function first(value: string) {
  return value.toUpperCase();
}
`,
      { includeAstHash: true },
      'src/a.ts',
    )[0];
    const second = analyzeCodeUnitsFromText(
      `export function second(input: string) {
  return input.toUpperCase();
}
`,
      { includeAstHash: true },
      'src/b.ts',
    )[0];

    expect(first.astHash).toBe(second.astHash);
    expect(
      generateAstFingerprintFromText(
        `export function first(value: string) {
  return value.toUpperCase();
}
`,
        { kind: 'function', name: 'first' },
      ),
    ).toBe(first.astHash);
  });

  it('resolves symbol candidates without throwing for ambiguous or missing names', () => {
    const candidates = resolveSymbolCandidatesFromText(
      `function dup() { return 1; }
function dup() { return 2; }
`,
      { kind: 'function', name: 'dup' },
      { includeNonExported: true },
      'src/dup.ts',
    );
    const missing = resolveSymbolCandidatesFromText(
      `function exists() { return 1; }`,
      { kind: 'function', name: 'missing' },
      { includeNonExported: true },
      'src/missing.ts',
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0].id).not.toBe(candidates[1].id);
    expect(missing).toEqual([]);
  });

  it('scans projects and keeps same-named symbols distinct by file', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'astmend-scanner-'));
    await writeFile(
      path.join(tempDir, 'tsconfig.json'),
      `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["**/*.ts"]
}
`,
      'utf8',
    );
    await writeFile(path.join(tempDir, 'a.ts'), `export function same() { return 'a'; }\n`, 'utf8');
    await writeFile(path.join(tempDir, 'b.ts'), `export function same() { return 'b'; }\n`, 'utf8');

    const units = await analyzeCodeUnitsFromProject(tempDir);
    const candidates = await resolveSymbolCandidatesFromProject(tempDir, {
      kind: 'function',
      name: 'same',
    });

    expect(units.filter((unit) => unit.name === 'same')).toHaveLength(2);
    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(2);
  });
});
