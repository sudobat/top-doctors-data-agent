---
name: BigQuery Warehouse Seed
description: Native BigQuery medallion seeder for Top Doctors clinic domain (no Postgres mirror)
targets:
  - ../scripts/seed-bigquery.mjs
  - ../package.json
---

# BigQuery Warehouse Seed

Generates schema and synthetic data **directly in BigQuery**. There is no local clinic Postgres warehouse and no Postgres-to-BigQuery mirror step.

## npm scripts

- `db:seed:bq` runs `node --env-file=.env scripts/seed-bigquery.mjs`
  `[@test] ../tests/package-scripts.test.ts`
- `db:seed:bq:broken` runs the same script with `--broken` for intentional pipeline-failure scenarios
  `[@test] ../tests/package-scripts.test.ts`
- Clinic Postgres seed scripts (`db:up`, `db:seed`, `db:seed:broken`) are not part of this pipeline and must not be required to run BigQuery seed
  `[@test] ../tests/bigquery-seed/npm-scripts.test.ts`

## Environment

- Requires `GCP_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS`; missing values fail fast before seeding
  `[@test] ../tests/bigquery-seed/env-and-dataset.test.ts`
- Default dataset id is `clinic` (`BIGQUERY_DATASET` override)
  `[@test] ../tests/bigquery-seed/env-and-dataset.test.ts`
- Default location is `EU` (`BIGQUERY_LOCATION` override)
  `[@test] ../tests/bigquery-seed/env-and-dataset.test.ts`
- `SEED_SCALE` is a positive numeric multiplier (default **1.0**); entity volumes scale proportionally unless a requirement states otherwise (e.g. fixed country count)
  `[@test] ../tests/bigquery-seed/seed-scale.test.ts`

## Domain entities (excludes legacy visits/rooms clinic model)

- Reference dimensions: **countries**, **specialties**
  `[@test] ../tests/bigquery-seed/domain-entities.test.ts`
- Core entities: **doctors**, **clinics**, **patients**, **appointments**, **invoices**
  `[@test] ../tests/bigquery-seed/domain-entities.test.ts`
- Relationships: appointments link doctors, clinics, patients, countries, and specialties; invoices derive from appointments (~one invoice per appointment)
  `[@test] ../tests/bigquery-seed/domain-entities.test.ts`
- Patients are derived from appointment demand (repeat patients allowed)
  `[@test] ../tests/bigquery-seed/domain-entities.test.ts`

## Countries (reference, not scaled by `SEED_SCALE`)

- Exactly eight countries: **ES**, **IT**, **GB**, **IE**, **AR**, **CO**, **CL**, **MX**
  `[@test] ../tests/bigquery-seed/domain-entities.test.ts`

## Medallion table naming

- Layer prefixes in the clinic dataset: `ops_`, `raw_`, `copper_`, `bronze_`, `silver_`, `gold_`
  `[@test] ../tests/bigquery-seed/medallion-layers.test.ts`
- **raw** and **copper**: full change history for mutable entities
  `[@test] ../tests/bigquery-seed/medallion-layers.test.ts`
- **bronze**: last two versions per entity key
  `[@test] ../tests/bigquery-seed/medallion-layers.test.ts`
- **silver**: current-state tables (distinct business keys at scale 1.0)
  `[@test] ../tests/bigquery-seed/medallion-layers.test.ts`
- **gold**: analytics marts for the new domain (e.g. doctor workload, appointments, revenue by specialty/country)—not legacy visit/room marts
  `[@test] ../tests/bigquery-seed/medallion-layers.test.ts`
- **ops_**: pipeline/run metadata tables; present for both healthy and `--broken` seeds
  `[@test] ../tests/bigquery-seed/medallion-layers.test.ts`

## Volumes at `SEED_SCALE=1.0` (silver distinct vs history)

| Entity | Silver (distinct / current) | raw + copper (history) |
| --- | --- | --- |
| Doctors | ~200k | ~44M rows |
| Clinics | ~900 | ~200k (~220× history vs current, same ratio pattern as doctors) |
| Appointments | ~12M (~1.5M × 8 countries) | ~same order as current (few modifications) |
| Patients | derived from appointments | light history (appointment-like) |
| Invoices | ~one per appointment | light history (appointment-like) |
| Specialties | ~80 | light / current-leaning |
| Countries | 8 (fixed) | reference only |

- Doctor silver row count is within **±5%** of 200_000 at scale 1.0
  `[@test] ../tests/bigquery-seed/seed-scale.test.ts`
- Clinic silver row count is within **±5%** of 900 at scale 1.0
  `[@test] ../tests/bigquery-seed/seed-scale.test.ts`
- Appointment silver row count is within **±5%** of 12_000_000 at scale 1.0
  `[@test] ../tests/bigquery-seed/seed-scale.test.ts`
- Doctor raw/copper history row count is within **±5%** of 44_000_000 at scale 1.0
  `[@test] ../tests/bigquery-seed/seed-scale.test.ts`
- Clinic raw/copper history row count is within **±5%** of 200_000 at scale 1.0
  `[@test] ../tests/bigquery-seed/seed-scale.test.ts`
- At `SEED_SCALE=0.1`, doctor silver count scales to ~**±10%** of 20_000 (0.1 × 200k)
  `[@test] ../tests/bigquery-seed/seed-scale.test.ts`
- Specialty silver row count is within **±5%** of 80 at scale 1.0
  `[@test] ../tests/bigquery-seed/seed-scale.test.ts`
- Invoice silver row count is within **±5%** of appointment silver count at scale 1.0 (~one invoice per appointment)
  `[@test] ../tests/bigquery-seed/seed-scale.test.ts`
- Patient silver distinct count is less than appointment silver count at scale 1.0 (repeat patients across appointments)
  `[@test] ../tests/bigquery-seed/seed-scale.test.ts`

## Generation strategy (primary path)

- Synthetic rows are produced **inside BigQuery via SQL** (e.g. `GENERATE_ARRAY`, deterministic expressions)—not by shipping large local NDJSON/CSV payloads or row-by-row `INSERT`s
  `[@test] ../tests/bigquery-seed/npm-scripts.test.ts`
- The Node seeder orchestrates DDL/`CREATE TABLE AS SELECT` (or equivalent) jobs and post-seed verification; it must not materialize full-scale entity datasets in local memory or temp files
  `[@test] ../tests/bigquery-seed/npm-scripts.test.ts`
- Client-side file load jobs (GCS or local) and the Storage Write API are out of scope for the primary path; SQL generation is required for volume tables at any `SEED_SCALE`
  `[@test] ../tests/bigquery-seed/npm-scripts.test.ts`

## Pipeline behavior

- Ensures the target dataset exists in the configured location before seeding tables
  `[@test] ../tests/bigquery-seed/env-and-dataset.test.ts`
- Creates or replaces tables with appropriate BigQuery types and `PRIMARY KEY (...) NOT ENFORCED` where entity keys exist
  `[@test] ../tests/bigquery-seed/medallion-layers.test.ts`
- Has no `pg` / Docker Postgres / `DATABASE_URL` dependency
  `[@test] ../tests/bigquery-seed/npm-scripts.test.ts`
- Drops BigQuery tables in the clinic dataset that are no longer part of the seeded schema set
  `[@test] ../tests/bigquery-seed/medallion-layers.test.ts`
- Verifies post-seed row counts against expected ranges; mismatch fails the script with a non-zero exit code
  `[@test] ../tests/bigquery-seed/seed-scale.test.ts`

## `--broken` seed

- `--broken` completes the same schema load but injects intentional data-quality / pipeline-error scenarios suitable for outlier and RCA exercises (analogous to prior Cardiology duplicate and Neurology gap patterns, adapted to the new domain)
  `[@test] ../tests/bigquery-seed/broken-pipeline.test.ts`
- `--broken` still populates `ops_` metadata so downstream jobs can distinguish healthy vs broken runs
  `[@test] ../tests/bigquery-seed/broken-pipeline.test.ts`

## Agent warehouse access

- Mastra data agents use BigQuery warehouse tools only for SQL against this dataset; see `bigquery-warehouse-tools.spec.md`
  `[@test] ../tests/agent-tool-bindings/data-engineer-agent.test.ts`

## Out of scope

- Local Postgres clinic warehouse, `docker compose` `postgres` service, and Postgres mirror seeding (see `clinic-postgres-seed.spec.md` obsolescence and removed `bigquery-seed-mirror` spec)
  `[@test] ../tests/clinic-postgres-removal/compose-and-scripts.test.ts`
- OpenMetadata application Postgres (`openmetadata/postgresql`) remains unrelated infrastructure under the semantic stack
  `[@test] ../tests/package-scripts.test.ts`
