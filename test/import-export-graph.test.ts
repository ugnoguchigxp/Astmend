import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeImportExportGraphFromFile,
  analyzeImportExportGraphFromProject,
} from '../src/index.js';

describe('import export graph', () => {
  it('extracts imports and exports from a file', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'astmend-graph-file-'));
    const filePath = path.join(tempDir, 'index.ts');
    await writeFile(
      filePath,
      `import defaultThing, { named as localNamed } from './dep';
import * as ns from './namespace';
import './setup';

export function run() {}
export const value = 1;
export { localNamed as renamed };
export * from './dep';
export { other } from './other';
export default run;
`,
      'utf8',
    );

    const graph = await analyzeImportExportGraphFromFile(filePath);
    const file = graph.files[0];

    expect(file.imports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          importKind: 'default',
          importedName: 'default',
          localName: 'defaultThing',
        }),
        expect.objectContaining({
          importKind: 'named',
          importedName: 'named',
          localName: 'localNamed',
        }),
        expect.objectContaining({ importKind: 'namespace', localName: 'ns' }),
        expect.objectContaining({ importKind: 'side_effect', moduleSpecifier: './setup' }),
      ]),
    );
    expect(file.exports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ exportKind: 'named', exportedName: 'run' }),
        expect.objectContaining({ exportKind: 'named', exportedName: 'value' }),
        expect.objectContaining({
          exportKind: 'named',
          exportedName: 'renamed',
          localName: 'localNamed',
        }),
        expect.objectContaining({ exportKind: 'export_all', exportedName: '*' }),
        expect.objectContaining({ exportKind: 're_export', exportedName: 'other' }),
        expect.objectContaining({
          exportKind: 'default',
          exportedName: 'default',
          localName: 'run',
        }),
      ]),
    );
  });

  it('resolves relative imports in project mode', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'astmend-graph-project-'));
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
    await writeFile(path.join(tempDir, 'dep.ts'), `export const dep = 1;\n`, 'utf8');
    await writeFile(
      path.join(tempDir, 'index.ts'),
      `import { dep } from './dep';\nexport { dep };\n`,
      'utf8',
    );

    const graph = await analyzeImportExportGraphFromProject(tempDir);
    const indexFile = graph.files.find((file) => file.file.endsWith('/index.ts'));

    expect(indexFile?.imports[0]).toMatchObject({
      importKind: 'named',
      moduleSpecifier: './dep',
      importedName: 'dep',
    });
    expect(indexFile?.imports[0].resolvedFile).toMatch(/dep\.ts$/);
  });

  it('captures anonymous default exports', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'astmend-graph-default-'));
    const filePath = path.join(tempDir, 'default.ts');
    await writeFile(
      filePath,
      `export default function () {
  return 1;
}
`,
      'utf8',
    );

    const graph = await analyzeImportExportGraphFromFile(filePath);

    expect(graph.files[0].exports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ exportKind: 'default', exportedName: 'default' }),
      ]),
    );
  });
});
