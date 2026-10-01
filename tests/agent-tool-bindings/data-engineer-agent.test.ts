import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { dataEngineerAgent } from '../../src/mastra/agents/data-engineer-agent.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('dataEngineerAgent', () => {
  it('has the expected id', () => {
    assert.equal(dataEngineerAgent.id, 'data-engineer-agent');
  });

  it('uses BigQuery warehouse tools only for SQL (no Postgres warehouse tools)', async () => {
    const keys = Object.keys(await dataEngineerAgent.listTools());
    for (const id of ['run_sql', 'list_tables', 'describe_columns']) {
      assert.ok(!keys.includes(id), `unexpected Postgres warehouse tool ${id}`);
    }
    const mastraEntry = readFileSync(join(root, 'src/mastra/index.ts'), 'utf8');
    assert.doesNotMatch(mastraEntry, /postgres-tools/);
  });

  it('binds OpenMetadata and BigQuery tools, not Postgres tools', async () => {
    const keys = Object.keys(await dataEngineerAgent.listTools());

    for (const id of [
      'om_search_glossary',
      'om_get_glossary_term',
      'om_search_metrics',
      'om_get_metric',
      'om_list_certified_assets',
      'om_describe_certified_table',
      'bq_list_datasets',
      'bq_list_tables',
      'bq_describe_columns',
      'bq_run_sql',
    ]) {
      assert.ok(keys.includes(id), `missing tool ${id}; have ${keys.join(', ')}`);
    }

    for (const id of ['run_sql', 'list_tables', 'describe_columns']) {
      assert.ok(!keys.includes(id), `unexpected Postgres tool ${id}`);
    }
  });
});
