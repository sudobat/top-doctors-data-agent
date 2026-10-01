import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

type VolumeExpectations = {
  getExpectedSilverRange: (
    entity: string,
    scale: number,
  ) => { min: number; max: number };
  getExpectedHistoryRange: (
    entity: string,
    scale: number,
  ) => { min: number; max: number };
  verifyPostSeedCounts: (counts: Record<string, number>, scale: number) => void;
  defaultSeedScale: number;
};

async function loadVolumeExpectations(): Promise<VolumeExpectations> {
  const mod = (await import('../../scripts/seed-bigquery.mjs')) as Partial<VolumeExpectations>;
  assert.equal(typeof mod.getExpectedSilverRange, 'function');
  assert.equal(typeof mod.getExpectedHistoryRange, 'function');
  assert.equal(typeof mod.verifyPostSeedCounts, 'function');
  assert.equal(mod.defaultSeedScale, 1.0);
  return mod as VolumeExpectations;
}

function within(range: { min: number; max: number }, value: number): boolean {
  return value >= range.min && value <= range.max;
}

describe('BigQuery seed — SEED_SCALE volumes', () => {
  it('defaults SEED_SCALE to 1.0', async () => {
    const { defaultSeedScale } = await loadVolumeExpectations();
    assert.equal(defaultSeedScale, 1.0);
  });

  it('expects ~200k silver doctors at scale 1.0 (±5%)', async () => {
    const { getExpectedSilverRange } = await loadVolumeExpectations();
    const range = getExpectedSilverRange('doctors', 1.0);
    assert.ok(within(range, 200_000));
  });

  it('expects ~900 silver clinics at scale 1.0 (±5%)', async () => {
    const { getExpectedSilverRange } = await loadVolumeExpectations();
    const range = getExpectedSilverRange('clinics', 1.0);
    assert.ok(within(range, 900));
  });

  it('expects ~12M silver appointments at scale 1.0 (±5%)', async () => {
    const { getExpectedSilverRange } = await loadVolumeExpectations();
    const range = getExpectedSilverRange('appointments', 1.0);
    assert.ok(within(range, 12_000_000));
  });

  it('expects ~44M doctor raw/copper history rows at scale 1.0 (±5%)', async () => {
    const { getExpectedHistoryRange } = await loadVolumeExpectations();
    const range = getExpectedHistoryRange('doctors', 1.0);
    assert.ok(within(range, 44_000_000));
  });

  it('expects ~200k clinic raw/copper history rows at scale 1.0 (±5%)', async () => {
    const { getExpectedHistoryRange } = await loadVolumeExpectations();
    const range = getExpectedHistoryRange('clinics', 1.0);
    assert.ok(within(range, 200_000));
  });

  it('scales doctor silver to ~20k at SEED_SCALE=0.1 (±10%)', async () => {
    const { getExpectedSilverRange } = await loadVolumeExpectations();
    const range = getExpectedSilverRange('doctors', 0.1);
    assert.ok(within(range, 20_000));
  });

  it('expects ~80 silver specialties at scale 1.0 (±5%)', async () => {
    const { getExpectedSilverRange } = await loadVolumeExpectations();
    const range = getExpectedSilverRange('specialties', 1.0);
    assert.ok(within(range, 80));
  });

  it('expects invoice silver count to match appointments (~one per appointment)', async () => {
    const { getExpectedSilverRange } = await loadVolumeExpectations();
    const appointments = getExpectedSilverRange('appointments', 1.0);
    const invoices = getExpectedSilverRange('invoices', 1.0);
    assert.equal(invoices.min, appointments.min);
    assert.equal(invoices.max, appointments.max);
  });

  it('expects fewer distinct patients than appointments (repeat patients)', async () => {
    const { getExpectedSilverRange } = await loadVolumeExpectations();
    const patients = getExpectedSilverRange('patients', 1.0);
    const appointments = getExpectedSilverRange('appointments', 1.0);
    assert.ok(patients.max < appointments.min);
  });

  it('verifyPostSeedCounts fails on mismatch (non-zero exit semantics)', async () => {
    const { verifyPostSeedCounts, getExpectedSilverRange } = await loadVolumeExpectations();
    const badCount = getExpectedSilverRange('doctors', 1.0).max + 1;
    assert.throws(
      () => verifyPostSeedCounts({ silver_doctors: badCount }, 1.0),
      /row count|does not match|outside expected/i,
    );
  });
});
