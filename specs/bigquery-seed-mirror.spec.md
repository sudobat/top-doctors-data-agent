---
name: BigQuery Seed Mirror
description: Copy local clinic Postgres public tables into the BigQuery clinic dataset
targets:
  - ../scripts/seed-bigquery.mjs
---

# BigQuery Seed Mirror

## Pipeline

1. Ensure Postgres is up and run `seed-db.mjs` (optional `--broken`)
2. Read all `public` tables (columns + PKs); map Postgres types to BigQuery
3. Ensure dataset exists (or location matches `BIGQUERY_LOCATION`)
4. `CREATE OR REPLACE TABLE` with `PRIMARY KEY (...) NOT ENFORCED`; NDJSON load `WRITE_TRUNCATE`
5. Drop BigQuery tables not present in Postgres
6. Verify row counts; mismatch fails the script

## Env

- Requires `GCP_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`
- Defaults: dataset `clinic`, location `EU`

## Contracts

- Postgres CHECK/FK constraints are not enforced in BigQuery
- Unsupported Postgres types abort the seed with an error
- npm: `db:seed:bq`, `db:seed:bq:broken`

## Verification

- npm scripts `db:seed:bq` and `db:seed:bq:broken` are defined
  `[@test] ../tests/package-scripts.test.ts`
