import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertBigQueryReadOnly } from '../../src/mastra/tools/bigquery-tools.js';

describe('assertBigQueryReadOnly', () => {
  it('rejects EXPORT DATA and LOAD DATA', () => {
    assert.throws(
      () => assertBigQueryReadOnly('EXPORT DATA OPTIONS(uri="gs://x") AS SELECT 1'),
      /Write or DDL SQL is not allowed/,
    );
    assert.throws(
      () => assertBigQueryReadOnly('LOAD DATA INTO dataset.t FROM FILES (uris=["gs://x"])'),
      /Write or DDL SQL is not allowed/,
    );
  });

  it('allows ordinary SELECT', () => {
    assert.doesNotThrow(() => assertBigQueryReadOnly('SELECT * FROM gold_revenue_by_specialty'));
  });
});
