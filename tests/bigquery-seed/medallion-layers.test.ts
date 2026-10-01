import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

type MedallionContract = {
  MEDALLION_LAYER_PREFIXES: string[];
  TABLE_NAMING: {
    rawAndCopper: { fullHistory: boolean };
    bronze: { versionsPerKey: number };
    silver: { currentState: boolean };
    gold: { analyticsMarts: boolean; legacyVisitMarts: boolean };
    ops: { pipelineMetadata: boolean };
  };
  listSeededTableIds: () => string[];
};

async function loadMedallionContract(): Promise<MedallionContract> {
  const mod = (await import('../../scripts/seed-bigquery.mjs')) as Partial<MedallionContract>;
  assert.ok(mod.MEDALLION_LAYER_PREFIXES, 'missing MEDALLION_LAYER_PREFIXES export');
  assert.ok(mod.TABLE_NAMING, 'missing TABLE_NAMING export');
  assert.equal(typeof mod.listSeededTableIds, 'function');
  return mod as MedallionContract;
}

describe('BigQuery seed — medallion layers', () => {
  it('uses ops_, raw_, copper_, bronze_, silver_, and gold_ prefixes', async () => {
    const { MEDALLION_LAYER_PREFIXES } = await loadMedallionContract();
    assert.deepEqual(
      [...MEDALLION_LAYER_PREFIXES].sort(),
      ['bronze_', 'copper_', 'gold_', 'ops_', 'raw_', 'silver_'].sort(),
    );
  });

  it('models raw and copper as full change history for mutable entities', async () => {
    const { TABLE_NAMING } = await loadMedallionContract();
    assert.equal(TABLE_NAMING.rawAndCopper.fullHistory, true);
  });

  it('models bronze as last two versions per entity key', async () => {
    const { TABLE_NAMING } = await loadMedallionContract();
    assert.equal(TABLE_NAMING.bronze.versionsPerKey, 2);
  });

  it('models silver as current-state distinct business keys', async () => {
    const { TABLE_NAMING } = await loadMedallionContract();
    assert.equal(TABLE_NAMING.silver.currentState, true);
  });

  it('models gold as new-domain analytics marts without legacy visit/room marts', async () => {
    const { TABLE_NAMING, listSeededTableIds } = await loadMedallionContract();
    assert.equal(TABLE_NAMING.gold.analyticsMarts, true);
    assert.equal(TABLE_NAMING.gold.legacyVisitMarts, false);
    const goldTables = listSeededTableIds().filter((id) => id.startsWith('gold_'));
    assert.ok(goldTables.length > 0);
    for (const legacy of ['gold_visits_mart', 'gold_patient_visit_summary']) {
      assert.ok(!goldTables.includes(legacy), `legacy mart ${legacy} must not be seeded`);
    }
  });

  it('includes ops_ pipeline metadata for healthy seeds', async () => {
    const { listSeededTableIds } = await loadMedallionContract();
    const opsTables = listSeededTableIds().filter((id) => id.startsWith('ops_'));
    assert.ok(opsTables.length > 0, 'expected ops_ metadata tables');
  });

  it('creates tables with PRIMARY KEY (...) NOT ENFORCED when entity keys exist', () => {
    const source = readFileSync(join(root, 'scripts/seed-bigquery.mjs'), 'utf8');
    assert.match(source, /PRIMARY KEY\s*\([^)]+\)\s*NOT ENFORCED/i);
  });

  it('drops stale BigQuery tables outside the seeded schema set', () => {
    const source = readFileSync(join(root, 'scripts/seed-bigquery.mjs'), 'utf8');
    assert.match(source, /dropStale|DROP TABLE IF EXISTS/i);
    assert.doesNotMatch(source, /keep\.has\(table\.id\)\s*continue[\s\S]*postgres/i);
  });
});
