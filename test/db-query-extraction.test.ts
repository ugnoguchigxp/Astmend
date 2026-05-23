import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractDbQueries } from '../src/index.js';

describe('db query extraction', () => {
  it('extracts drizzle-like queries and raw sql usage', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'astmend-dbq-'));
    await mkdir(path.join(repoRoot, 'src'), { recursive: true });

    await writeFile(
      path.join(repoRoot, 'src', 'queries.ts'),
      `const db = {
  select: () => ({ from: (table: unknown) => ({ where: (_x: unknown) => table }) }),
  update: (_table: unknown) => true,
  delete: (_table: unknown) => true,
  query: { users: { findMany: () => [] } },
};
const sql = (_parts: TemplateStringsArray) => '';

async function load() {
  db.query.users.findMany();
  db.select().from(users).where(eq(users.id, id));
  db.update(users);
  db.delete(users);
  sql\`select * from users\`;
}
`,
      'utf8',
    );

    const result = await extractDbQueries({
      repoRoot,
      files: ['src/queries.ts'],
    });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: 'query' }),
        expect.objectContaining({ operation: 'select' }),
        expect.objectContaining({ operation: 'update' }),
        expect.objectContaining({ operation: 'delete' }),
        expect.objectContaining({ operation: 'raw_sql', isRawSql: true }),
      ]),
    );
    expect(result.warnings).toEqual([]);
  });
});
