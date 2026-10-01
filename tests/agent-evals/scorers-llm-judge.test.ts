import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { answerSimilarityJudgeScorer } from '../../src/mastra/scorers/answer-similarity-judge.js';

describe('agent evals — answer-similarity-judge scorer', () => {
  it('uses a configured model and returns a numeric score plus reason', async () => {
    assert.ok(
      answerSimilarityJudgeScorer.model || answerSimilarityJudgeScorer.config?.model,
      'judge must expose a configured model',
    );

    const run = answerSimilarityJudgeScorer.run ?? answerSimilarityJudgeScorer;
    const result = await run({
      output: 'Revenue by specialty is defined in OM; paid totals come from gold_revenue_by_specialty.',
      groundTruth: {
        answerSummary: 'Defines the OM metric then returns paid totals from gold_revenue_by_specialty',
        notes: 'Prefer EN glossary/metric when ES/IT disagree',
      },
    });

    assert.equal(typeof result.score, 'number');
    assert.ok(Number.isFinite(result.score), 'score must be a finite number');
    assert.equal(typeof result.reason, 'string');
    assert.ok(result.reason.length > 0);
  });

  it('requires ground truth and fails clearly when answerSummary is missing', async () => {
    const run = answerSimilarityJudgeScorer.run ?? answerSimilarityJudgeScorer;
    await assert.rejects(
      async () =>
        run({
          output: 'some answer',
          groundTruth: {},
        }),
      /ground.?truth|answerSummary/i,
    );
  });
});
