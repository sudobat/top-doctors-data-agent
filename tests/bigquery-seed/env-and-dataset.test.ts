import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function seedScriptSource(): string {
  return readFileSync(join(root, 'scripts/seed-bigquery.mjs'), 'utf8');
}

describe('BigQuery seed — environment and dataset', () => {
  it('fails fast when GCP_PROJECT_ID is missing', () => {
    const result = spawnSync(process.execPath, ['--env-file=.env', join(root, 'scripts/seed-bigquery.mjs')], {
      cwd: root,
      env: { ...process.env, GCP_PROJECT_ID: '', GOOGLE_APPLICATION_CREDENTIALS: '' },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /GCP_PROJECT_ID is not set/);
  });

  it('fails fast when GOOGLE_APPLICATION_CREDENTIALS is missing', () => {
    const result = spawnSync(process.execPath, [join(root, 'scripts/seed-bigquery.mjs')], {
      cwd: root,
      env: { ...process.env, GCP_PROJECT_ID: 'test-project', GOOGLE_APPLICATION_CREDENTIALS: '' },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /GOOGLE_APPLICATION_CREDENTIALS is not set/);
  });

  it('defaults dataset id to clinic with BIGQUERY_DATASET override', () => {
    const source = seedScriptSource();
    assert.match(source, /BIGQUERY_DATASET\s*\|\|\s*["']clinic["']/);
  });

  it('defaults location to EU with BIGQUERY_LOCATION override', () => {
    const source = seedScriptSource();
    assert.match(source, /BIGQUERY_LOCATION\s*\|\|\s*["']EU["']/);
  });

  it('ensures the target dataset exists before seeding entity tables', async () => {
    const mod = (await import('../../scripts/seed-bigquery.mjs')) as {
      ensureClinicDataset?: (args: unknown) => Promise<void>;
    };
    assert.equal(typeof mod.ensureClinicDataset, 'function');
  });
});
