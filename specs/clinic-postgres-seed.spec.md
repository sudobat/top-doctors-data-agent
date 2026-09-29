---
name: Clinic Postgres Seed
description: Local medallion clinic database via Docker Compose and seed scripts
targets:
  - ../docker-compose.yml
  - ../scripts/seed-db.mjs
  - ../db/**
---

# Clinic Postgres Seed

## Compose service

- Service `postgres` exposes host port `POSTGRES_PORT` (default **5434**) so it does not clash with local 5432/5433
- First start mounts `db/schema.sql` then `db/seed.sql` into initdb
- Default credentials: user/password/db `clinic`

## npm scripts

| Script | Behavior |
| --- | --- |
| `db:up` | `docker compose up -d postgres` |
| `db:seed` | Re-applies schema + healthy seed via `psql` (`ON_ERROR_STOP=1`) |
| `db:seed:broken` | Healthy seed plus `seed-pipeline-errors.sql` (Cardiology duplicates; Neurology gaps) |

## Medallion prefixes

- Tables use `ops_`, `raw_`, `copper_`, `bronze_`, `silver_`, `gold_` prefixes in `public`
- Gold marts include `gold_doctor_workload`, `gold_patient_visit_summary`, `gold_revenue_by_specialty`, `gold_visits_mart`, `gold_invoices_mart`

## Verification

- npm scripts `db:up`, `db:seed`, and `db:seed:broken` are defined
  `[@test] ../tests/package-scripts.test.ts`
