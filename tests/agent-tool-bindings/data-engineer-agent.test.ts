import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dataEngineerAgent } from '../../src/mastra/agents/data-engineer-agent.js';

describe('dataEngineerAgent', () => {
  it('has the expected id', () => {
    assert.equal(dataEngineerAgent.id, 'data-engineer-agent');
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
