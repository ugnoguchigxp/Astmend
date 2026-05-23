import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractRoutes } from '../src/index.js';

describe('route extraction', () => {
  it('extracts route info and reports unresolved path warnings', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'astmend-routes-'));
    await mkdir(path.join(repoRoot, 'src'), { recursive: true });

    await writeFile(
      path.join(repoRoot, 'src', 'routes.ts'),
      `const app = { get: (..._args: unknown[]) => {}, post: (..._args: unknown[]) => {} };
const dynamicPath = '/dynamic';
app.get('/users/:id', auth, listUsers);
app.post(dynamicPath, createUser);
`,
      'utf8',
    );

    const result = await extractRoutes({
      repoRoot,
      files: ['src/routes.ts'],
    });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/routes.ts',
          method: 'get',
          path: '/users/:id',
          pathParams: ['id'],
        }),
        expect.objectContaining({
          file: 'src/routes.ts',
          method: 'post',
          path: null,
        }),
      ]),
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ROUTE_PATH_UNRESOLVED',
        }),
      ]),
    );
  });
});
