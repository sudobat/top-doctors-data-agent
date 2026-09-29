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
  it('exposes clinic Postgres and BigQuery seed commands', () => {
    assert.match(pkg.scripts['db:up'], /docker compose up -d postgres/);
    assert.match(pkg.scripts['db:seed'], /seed-db\.mjs/);
    assert.match(pkg.scripts['db:seed:broken'], /--broken/);
    assert.match(pkg.scripts['db:seed:bq'], /seed-bigquery\.mjs/);
    assert.match(pkg.scripts['db:seed:bq:broken'], /seed-bigquery\.mjs/);
  });

  it('exposes semantic stack and Metabase sync commands', () => {
    assert.match(pkg.scripts['semantic:up'], /--profile semantic up/);
    assert.match(pkg.scripts['semantic:down'], /--profile semantic down/);
    assert.match(pkg.scripts['semantic:sync-metabase'], /sync-metabase-descriptions\.mjs/);
  });
});
