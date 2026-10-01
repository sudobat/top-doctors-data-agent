import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('package scripts for seed and semantic stack', () => {
  it('exposes BigQuery native seed commands with env-file', () => {
    assert.match(pkg.scripts['db:seed:bq'], /--env-file=\.env/);
    assert.match(pkg.scripts['db:seed:bq'], /seed-bigquery\.mjs/);
    assert.match(pkg.scripts['db:seed:bq:broken'], /--env-file=\.env/);
    assert.match(pkg.scripts['db:seed:bq:broken'], /seed-bigquery\.mjs/);
    assert.match(pkg.scripts['db:seed:bq:broken'], /--broken/);
  });

  it('does not expose removed clinic Postgres seed commands', () => {
    assert.equal(pkg.scripts['db:up'], undefined);
    assert.equal(pkg.scripts['db:seed'], undefined);
    assert.equal(pkg.scripts['db:seed:broken'], undefined);
  });

  it('exposes semantic stack and Metabase sync commands (OpenMetadata Postgres unchanged)', () => {
    assert.match(pkg.scripts['semantic:up'], /--profile semantic up/);
    assert.match(pkg.scripts['semantic:down'], /--profile semantic down/);
    assert.match(pkg.scripts['semantic:sync-metabase'], /sync-metabase-descriptions\.mjs/);
  });

  it('documents BigQuery seed as replacement for removed clinic Postgres seed', () => {
    assert.ok(pkg.scripts['db:seed:bq']);
    assert.ok(pkg.scripts['db:seed:bq:broken']);
    assert.equal(pkg.scripts['db:seed'], undefined);
  });
});
