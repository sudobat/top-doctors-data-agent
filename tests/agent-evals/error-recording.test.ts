import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  recordExperimentItemError,
  attachScorerFailure,
} from '../../scripts/eval-run-experiment.mjs';

describe('agent evals — error recording', () => {
  it('records agent or tool errors as failed experiment items with error populated', () => {
    const item = recordExperimentItemError({
      externalId: 'de-glossary-then-sql-01',
      error: new Error('BigQuery unavailable'),
    });

    assert.ok(item.error, 'error must be populated on the item');
    assert.match(String(item.error), /BigQuery unavailable/);
    assert.equal(item.failed, true);
  });

  it('counts failed items in failedCount rather than omitting them', () => {
    const summary = recordExperimentItemError({
      externalId: 'case-a',
      error: new Error('tool timeout'),
      previousSummary: { total: 2, failedCount: 0, items: [{ externalId: 'ok' }] },
    });

    assert.equal(summary.failedCount, 1);
    assert.equal(summary.items.length, 2);
    assert.ok(summary.items.some((i: { externalId?: string }) => i.externalId === 'case-a'));
  });

  it('attaches scorer failures to the item score entry without erasing the item result', () => {
    const item = attachScorerFailure({
      item: {
        externalId: 'outlier-01',
        output: 'partial answer',
        scores: { 'required-tools': { score: 1, reason: 'ok' } },
      },
      scorerId: 'answer-structure',
      error: new Error('heading parse failed'),
    });

    assert.equal(item.output, 'partial answer', 'item result must remain');
    assert.equal(item.scores['required-tools'].score, 1);
    assert.ok(item.scores['answer-structure']);
    assert.ok(
      item.scores['answer-structure'].error || item.scores['answer-structure'].reason,
      'scorer failure must attach error/reason',
    );
  });
});
