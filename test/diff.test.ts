import { describe, expect, it } from 'vitest';
import {
  analyzeChangedSymbolsFromDiff,
  analyzeChangedSymbolsFromText,
  createPatchDiff,
} from '../src/index.js';

describe('changed symbol analysis', () => {
  const beforeText = `export function foo() {
  return 1;
}

export class User {
  getName() {
    return 'a';
  }

  removeMe() {
    return 'x';
  }
}

export interface Settings {
  baseUrl: string;
}

export type Alias = {
  value: string;
};
`;

  const afterText = `export function foo() {
  return 2;
}

export class User {
  getName() {
    return 'b';
  }
}

export interface Settings {
  baseUrl: string;
  timeout: number;
}

export type Alias = {
  value: string;
};

export const added = true;
`;

  it('extracts changed symbols from a unified diff', () => {
    const diff = createPatchDiff('src/sample.ts', beforeText, afterText);
    const reports = analyzeChangedSymbolsFromDiff(diff, {
      beforeText,
      sourceText: afterText,
      filePath: 'src/sample.ts',
    });

    expect(reports).toHaveLength(1);
    expect(reports[0].file).toBe('src/sample.ts');
    expect(reports[0].symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'function',
          name: 'foo',
          changeKind: 'modified',
          isExported: true,
          exportKind: 'named',
        }),
        expect.objectContaining({
          kind: 'method',
          name: 'getName',
          changeKind: 'modified',
          isExported: true,
          exportKind: 'named',
        }),
        expect.objectContaining({
          kind: 'method',
          name: 'removeMe',
          changeKind: 'removed',
          isExported: true,
          exportKind: 'named',
        }),
        expect.objectContaining({
          kind: 'property',
          name: 'timeout',
          changeKind: 'added',
          isExported: true,
          exportKind: 'named',
        }),
        expect.objectContaining({
          kind: 'variable',
          name: 'added',
          changeKind: 'added',
          isExported: true,
          exportKind: 'named',
        }),
      ]),
    );

  });

  it('matches the text-based convenience API', () => {
    const reports = analyzeChangedSymbolsFromText(beforeText, afterText, 'src/sample.ts');

    expect(reports).toHaveLength(1);
    expect(reports[0].symbols.some((symbol) => symbol.name === 'foo')).toBe(true);
    expect(reports[0].symbols.some((symbol) => symbol.name === 'added')).toBe(true);
  });
});