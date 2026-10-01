import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { answerStructureScorer } from '../../src/mastra/scorers/answer-structure.js';

async function score(output: string, expectedStructure: string[]): Promise<{ score: number; reason: string }> {
  const run = answerStructureScorer.run ?? answerStructureScorer;
  return run({
    output,
    groundTruth: { expectedStructure },
  });
}

describe('agent evals — answer-structure scorer', () => {
  it('is case-insensitive on heading labels', async () => {
    const result = await score(
      ['## SCOPE', '## Outliers Found', '## ROOT CAUSES', '## Confidence & Caveats'].join('\n\n'),
      ['Scope', 'Outliers found', 'Root causes', 'Confidence & caveats'],
    );
    assert.equal(result.score, 1);
  });

  it('tolerates markdown formatting around section headings', async () => {
    const result = await score(
      [
        '**Scope**',
        'n=12',
        '',
        '### Outliers found',
        '- a',
        '',
        '*Root causes*',
        'method: z-score',
        '',
        '#### Confidence & caveats',
        'low n',
      ].join('\n'),
      ['Scope', 'Outliers found', 'Root causes', 'Confidence & caveats'],
    );
    assert.equal(result.score, 1);
  });

  it('scores 0 when expected sections are missing', async () => {
    const result = await score('Just a free-form paragraph with no sections.', [
      'definition',
      'sql',
      'results',
    ]);
    assert.equal(result.score, 0);
    assert.match(result.reason, /definition|sql|results|missing/i);
  });
});
