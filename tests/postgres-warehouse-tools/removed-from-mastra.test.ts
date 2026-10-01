import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Postgres warehouse tools removal — Mastra registration', () => {
  it('does not import or register Postgres warehouse tools in src/mastra/index.ts', () => {
    const source = readFileSync(join(root, 'src/mastra/index.ts'), 'utf8');
    assert.doesNotMatch(source, /from '\.\/tools\/postgres-tools'/);
    assert.doesNotMatch(source, /\brunSqlTool\b/);
    assert.doesNotMatch(source, /\blistTablesTool\b/);
    assert.doesNotMatch(source, /\bdescribeColumnsTool\b/);
  });

  it('does not require DATABASE_URL for warehouse SQL in Mastra entry', () => {
    assert.equal(
      existsSync(join(root, 'src/mastra/db/postgres.ts')),
      false,
      'postgres.ts must be removed so DATABASE_URL is not part of the warehouse path',
    );
    const bigqueryTools = readFileSync(join(root, 'src/mastra/tools/bigquery-tools.ts'), 'utf8');
    assert.doesNotMatch(bigqueryTools, /\.\/db\/postgres|\.\/tools\/postgres-tools/);
  });
});
