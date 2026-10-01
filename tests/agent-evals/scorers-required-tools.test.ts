import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requiredToolsScorer } from '../../src/mastra/scorers/required-tools.js';

async function score(input: {
  requiredTools: string[];
  toolCalls: string[];
}): Promise<{ score: number; reason: string }> {
  const run = requiredToolsScorer.run ?? requiredToolsScorer;
  return run({
    groundTruth: { requiredTools: input.requiredTools },
    tracing: { toolCalls: input.toolCalls.map((id) => ({ toolName: id, toolId: id })) },
    toolCalls: input.toolCalls,
  });
}

describe('agent evals — required-tools scorer', () => {
  it('scores 1 when every required tool appears in the trajectory', async () => {
    const result = await score({
      requiredTools: ['om_search_metrics', 'bq_run_sql'],
      toolCalls: ['om_search_metrics', 'bq_list_tables', 'bq_run_sql'],
    });
    assert.equal(result.score, 1);
  });

  it('scores 0 and lists missing tools when any required tool is absent', async () => {
    const result = await score({
      requiredTools: ['om_search_metrics', 'bq_run_sql'],
      toolCalls: ['om_search_metrics'],
    });
    assert.equal(result.score, 0);
    assert.match(result.reason, /bq_run_sql/);
    assert.match(result.reason, /missing/i);
  });
});
