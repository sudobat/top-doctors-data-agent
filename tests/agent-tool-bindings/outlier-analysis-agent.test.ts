import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { outlierAnalysisAgent } from '../../src/mastra/agents/outlier-analysis-agent.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('outlierAnalysisAgent', () => {
  it('has the expected id', () => {
    assert.equal(outlierAnalysisAgent.id, 'outlier-analysis-agent');
  });

  it('binds only BigQuery tools', async () => {
    const keys = Object.keys(await outlierAnalysisAgent.listTools());

    for (const id of ['bq_list_tables', 'bq_describe_columns', 'bq_run_sql']) {
      assert.ok(keys.includes(id), `missing tool ${id}; have ${keys.join(', ')}`);
    }

    for (const id of ['om_search_glossary', 'bq_list_datasets', 'run_sql']) {
      assert.ok(!keys.includes(id), `unexpected tool ${id}`);
    }
    const mastraEntry = readFileSync(join(root, 'src/mastra/index.ts'), 'utf8');
    assert.doesNotMatch(mastraEntry, /postgres-tools/);
  });
});
