import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

type SeedContract = {
  REFERENCE_ENTITIES: string[];
  CORE_ENTITIES: string[];
  COUNTRY_CODES: string[];
  RELATIONSHIP_RULES: {
    appointmentsLink: string[];
    invoicesPerAppointment: boolean;
    patientsDerivedFromAppointments: boolean;
  };
};

async function loadSeedContract(): Promise<SeedContract> {
  const mod = (await import('../../scripts/seed-bigquery.mjs')) as Partial<SeedContract>;
  assert.ok(mod.REFERENCE_ENTITIES, 'seed contract must export REFERENCE_ENTITIES');
  assert.ok(mod.CORE_ENTITIES, 'seed contract must export CORE_ENTITIES');
  assert.ok(mod.COUNTRY_CODES, 'seed contract must export COUNTRY_CODES');
  assert.ok(mod.RELATIONSHIP_RULES, 'seed contract must export RELATIONSHIP_RULES');
  return mod as SeedContract;
}

describe('BigQuery seed — domain entities', () => {
  it('seeds reference dimensions countries and specialties', async () => {
    const { REFERENCE_ENTITIES } = await loadSeedContract();
    for (const name of ['countries', 'specialties']) {
      assert.ok(REFERENCE_ENTITIES.includes(name), `missing reference entity ${name}`);
    }
  });

  it('seeds core entities doctors, clinics, patients, appointments, invoices', async () => {
    const { CORE_ENTITIES } = await loadSeedContract();
    for (const name of ['doctors', 'clinics', 'patients', 'appointments', 'invoices']) {
      assert.ok(CORE_ENTITIES.includes(name), `missing core entity ${name}`);
    }
  });

  it('excludes legacy visits and rooms clinic model entities', async () => {
    const { CORE_ENTITIES, REFERENCE_ENTITIES } = await loadSeedContract();
    const all = [...CORE_ENTITIES, ...REFERENCE_ENTITIES];
    for (const legacy of ['visits', 'rooms', 'ehr_visits']) {
      assert.ok(!all.includes(legacy), `legacy entity ${legacy} must not be seeded`);
    }
  });

  it('defines appointment and invoice relationship rules', async () => {
    const { RELATIONSHIP_RULES } = await loadSeedContract();
    for (const key of ['doctors', 'clinics', 'patients', 'countries', 'specialties']) {
      assert.ok(
        RELATIONSHIP_RULES.appointmentsLink.includes(key),
        `appointments must link ${key}`,
      );
    }
    assert.equal(RELATIONSHIP_RULES.invoicesPerAppointment, true);
    assert.equal(RELATIONSHIP_RULES.patientsDerivedFromAppointments, true);
  });

  it('uses exactly eight fixed country codes', async () => {
    const { COUNTRY_CODES } = await loadSeedContract();
    assert.deepEqual([...COUNTRY_CODES].sort(), ['AR', 'CL', 'CO', 'ES', 'GB', 'IE', 'IT', 'MX']);
  });
});
