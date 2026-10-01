import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

function seedScriptSource(): string {
  return readFileSync(join(root, 'scripts/seed-bigquery.mjs'), 'utf8');
}

describe('BigQuery seed — npm scripts and orchestration', () => {
  it('does not require clinic Postgres seed scripts to run BigQuery seed', () => {
    const bqSeed = pkg.scripts['db:seed:bq'] ?? '';
    assert.match(bqSeed, /seed-bigquery\.mjs/);
    assert.doesNotMatch(bqSeed, /seed-db\.mjs/);
    assert.doesNotMatch(bqSeed, /db:up/);
    assert.doesNotMatch(bqSeed, /docker compose up.*postgres/);
  });

  it('generates synthetic rows inside BigQuery via SQL (not Postgres mirror loads)', () => {
    const source = seedScriptSource();
    assert.doesNotMatch(source, /from\s+["']pg["']/);
    assert.doesNotMatch(source, /readPostgresTables/);
    assert.doesNotMatch(source, /seed-db\.mjs/);
    assert.doesNotMatch(source, /docker compose up.*postgres/i);
    assert.match(source, /GENERATE_ARRAY|CREATE TABLE AS SELECT|CREATE OR REPLACE TABLE AS/i);
  });

  it('does not materialize full-scale datasets in local NDJSON temp files as the primary path', () => {
    const source = seedScriptSource();
    assert.doesNotMatch(source, /NEWLINE_DELIMITED_JSON/);
    assert.doesNotMatch(source, /\.load\s*\(/);
  });

  it('has no pg / Docker Postgres / DATABASE_URL dependency', () => {
    const source = seedScriptSource();
    assert.doesNotMatch(source, /DATABASE_URL/);
    assert.doesNotMatch(source, /from\s+["']pg["']/);
    assert.doesNotMatch(source, /pg\.Pool/);
  });
});
