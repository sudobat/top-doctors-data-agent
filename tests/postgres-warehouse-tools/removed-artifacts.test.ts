import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Postgres warehouse tools removal — artifacts', () => {
  it('does not ship src/mastra/db/postgres.ts', () => {
    assert.equal(existsSync(join(root, 'src/mastra/db/postgres.ts')), false);
  });

  it('does not ship src/mastra/tools/postgres-tools.ts', () => {
    assert.equal(existsSync(join(root, 'src/mastra/tools/postgres-tools.ts')), false);
  });
});
