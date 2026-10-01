import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sqlReadonlyObservableScorer } from '../../src/mastra/scorers/sql-readonly-observable.js';

async function score(payload: Record<string, unknown>): Promise<{ score: number; reason: string }> {
  const run = sqlReadonlyObservableScorer.run ?? sqlReadonlyObservableScorer;
  return run(payload);
}

describe('agent evals — sql-readonly-observable scorer', () => {
  it('does not invent SQL; non-pass with explicit reason when no SQL call is observable', async () => {
    const result = await score({
      groundTruth: { sqlConstraints: { readonly: true } },
      toolCalls: [{ toolName: 'om_search_metrics' }],
      tracing: { toolCalls: [] },
    });
    assert.notEqual(result.score, 1, 'must not pass when SQL is unobservable');
    assert.equal(typeof result.reason, 'string');
    assert.ok(result.reason.length > 0, 'reason must be explicit (not a silent skip)');
    assert.match(result.reason, /sql|observable|not (?:called|found|available)/i);
  });

  it('passes read-only SQL when bq_run_sql args are observable', async () => {
    const result = await score({
      groundTruth: { sqlConstraints: { readonly: true, certifiedOnly: true } },
      toolCalls: [
        {
          toolName: 'bq_run_sql',
          args: { sql: 'SELECT specialty, paid_total FROM gold_revenue_by_specialty' },
        },
      ],
    });
    assert.equal(result.score, 1);
  });

  it('rejects non-certified table prefixes for data-engineer certifiedOnly cases', async () => {
    const result = await score({
      groundTruth: { sqlConstraints: { readonly: true, certifiedOnly: true } },
      toolCalls: [
        {
          toolName: 'bq_run_sql',
          args: { sql: 'SELECT * FROM bronze_raw_appointments' },
        },
      ],
    });
    assert.equal(result.score, 0);
    assert.match(result.reason, /certified|silver_|gold_|bronze/i);
  });
});
