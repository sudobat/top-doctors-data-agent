---
name: Clinic Postgres Seed (Removed)
description: Obsolete local clinic Postgres warehouse; removed in favor of BigQuery-native seed
targets:
  - ../docker-compose.yml
  - ../package.json
---

# Clinic Postgres Seed (Removed)

The local medallion clinic Postgres warehouse is **removed**. Synthetic clinic data is seeded only via `scripts/seed-bigquery.mjs` per `bigquery-warehouse-seed.spec.md`.

## Docker Compose

- There is no `postgres` service for the clinic warehouse in `docker-compose.yml`
  `[@test] ../tests/clinic-postgres-removal/compose-and-scripts.test.ts`
- OpenMetadata and Metabase still use their **own** Postgres instances under the `semantic` profile; those services are unchanged
  `[@test] ../tests/package-scripts.test.ts`

## Removed artifacts

- Directory `db/` (e.g. `schema.sql`, `seed.sql`, pipeline-error SQL) must not exist
  `[@test] ../tests/clinic-postgres-removal/db-artifacts.test.ts`
- Script `scripts/seed-db.mjs` must not exist
  `[@test] ../tests/clinic-postgres-removal/db-artifacts.test.ts`

## Removed npm scripts

- `db:up`, `db:seed`, and `db:seed:broken` are removed from `package.json`
  `[@test] ../tests/clinic-postgres-removal/compose-and-scripts.test.ts`
- `db:down` may remain for tearing down compose stacks but must not reference a clinic `postgres` service
  `[@test] ../tests/clinic-postgres-removal/compose-and-scripts.test.ts`

## Legacy behavior (do not reintroduce)

- Host port `POSTGRES_PORT` / default **5434** clinic credentials (`clinic`/`clinic`/`clinic`) initdb flow
- Medallion prefixes in Postgres `public` and legacy gold marts (`gold_visits_mart`, `gold_patient_visit_summary`, visits/rooms model)
- Postgres as the source of truth for agent warehouse SQL

## Replacement

- Use `npm run db:seed:bq` and `npm run db:seed:bq:broken` instead
  `[@test] ../tests/package-scripts.test.ts`
