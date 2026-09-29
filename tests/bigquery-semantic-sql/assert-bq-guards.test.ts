import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertBigQueryReadOnly,
  assertCertifiedSemanticSql,
} from '../../src/mastra/tools/bigquery-tools.js';

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

describe('assertCertifiedSemanticSql', () => {
  it('rejects raw_/copper_/bronze_/ops_ identifiers', () => {
    assert.throws(
      () => assertCertifiedSemanticSql('SELECT * FROM bronze_doctors'),
      /Forbidden reference\(s\): bronze_doctors/,
    );
    assert.throws(
      () => assertCertifiedSemanticSql('SELECT * FROM raw_ehr_visits JOIN ops_dbt_run_results USING (id)'),
      /raw_ehr_visits/,
    );
    assert.throws(
      () => assertCertifiedSemanticSql('SELECT * FROM copper_patients'),
      /copper_patients/,
    );
  });

  it('allows silver_/gold_ and queries without forbidden prefixes', () => {
    assert.doesNotThrow(() =>
      assertCertifiedSemanticSql('SELECT * FROM gold_revenue_by_specialty JOIN silver_doctors USING (doctor_id)'),
    );
    assert.doesNotThrow(() => assertCertifiedSemanticSql('SELECT 1'));
  });
});
