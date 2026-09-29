import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isCertifiedTableName,
  isPublishedStatus,
  PUBLISHED_STATUS,
} from '../../src/mastra/db/openmetadata.js';

describe('isPublishedStatus', () => {
  it('treats Approved and omitted status as published', () => {
    assert.equal(isPublishedStatus(PUBLISHED_STATUS), true);
    assert.equal(isPublishedStatus(undefined), true);
    assert.equal(isPublishedStatus('Draft'), false);
    assert.equal(isPublishedStatus('In Review'), false);
  });
});

describe('isCertifiedTableName', () => {
  it('accepts only silver_ and gold_ prefixes', () => {
    assert.equal(isCertifiedTableName('silver_doctors'), true);
    assert.equal(isCertifiedTableName('gold_revenue_by_specialty'), true);
    assert.equal(isCertifiedTableName('bronze_doctors'), false);
    assert.equal(isCertifiedTableName('raw_ehr_visits'), false);
    assert.equal(isCertifiedTableName('ops_airflow_dag_runs'), false);
    assert.equal(isCertifiedTableName('doctors'), false);
  });
});
