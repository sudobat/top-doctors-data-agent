import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

type BrokenSeedContract = {
  describeBrokenScenarios: () => string[];
  seededTableIdsForMode: (broken: boolean) => string[];
};

async function loadBrokenContract(): Promise<BrokenSeedContract> {
  const mod = (await import('../../scripts/seed-bigquery.mjs')) as Partial<BrokenSeedContract>;
  assert.equal(typeof mod.describeBrokenScenarios, 'function');
  assert.equal(typeof mod.seededTableIdsForMode, 'function');
  return mod as BrokenSeedContract;
}

describe('BigQuery seed — --broken pipeline', () => {
  it('documents intentional data-quality / pipeline-error scenarios for --broken', async () => {
    const { describeBrokenScenarios } = await loadBrokenContract();
    const scenarios = describeBrokenScenarios();
    assert.ok(scenarios.length >= 2, 'expected multiple broken pipeline scenarios');
    assert.ok(
      scenarios.some((s) => /duplicate|gap|quality|outlier|rca/i.test(s)),
      'broken scenarios should cover duplicate/gap-style exercises',
    );
  });

  it('still seeds ops_ metadata tables when --broken is used', async () => {
    const { seededTableIdsForMode } = await loadBrokenContract();
    const brokenOps = seededTableIdsForMode(true).filter((id) => id.startsWith('ops_'));
    const healthyOps = seededTableIdsForMode(false).filter((id) => id.startsWith('ops_'));
    assert.deepEqual(brokenOps.sort(), healthyOps.sort());
    assert.ok(brokenOps.length > 0);
  });
});
