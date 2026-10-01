import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('clinic Postgres removal — db artifacts', () => {
  it('does not have a db/ directory for clinic warehouse SQL', () => {
    assert.equal(existsSync(join(root, 'db')), false, 'db/ must not exist');
  });

  it('does not have scripts/seed-db.mjs', () => {
    assert.equal(existsSync(join(root, 'scripts/seed-db.mjs')), false, 'scripts/seed-db.mjs must not exist');
  });
});
