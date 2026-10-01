---
name: Postgres Warehouse Tools (Removed)
description: Clinic Postgres pool and Mastra tools removed; agents use BigQuery tools only
targets:
  - ../src/mastra/index.ts
  - ../package.json
---

# Postgres Warehouse Tools (Removed)

Read-only clinic Postgres access via Mastra is **removed**. Warehouse SQL for data agents goes through BigQuery tools only (`bigquery-warehouse-tools.spec.md`).

## Removed implementation files

- `src/mastra/db/postgres.ts` must not exist
  `[@test] ../tests/postgres-warehouse-tools/removed-artifacts.test.ts`
- `src/mastra/tools/postgres-tools.ts` must not exist (including former `run_sql`, `list_tables`, `describe_columns`, and any re-export of `assertReadOnlySql`)
  `[@test] ../tests/postgres-warehouse-tools/removed-artifacts.test.ts`

## Mastra registration

- `src/mastra/index.ts` does not register Postgres warehouse tools
  `[@test] ../tests/postgres-warehouse-tools/removed-from-mastra.test.ts`
- `data-engineer-agent` and `outlier-analysis-agent` bind BigQuery tools only; Postgres tool ids are absent
  `[@test] ../tests/agent-tool-bindings/data-engineer-agent.test.ts`
  `[@test] ../tests/agent-tool-bindings/outlier-analysis-agent.test.ts`

## Shared SQL read-only guard

- `assertReadOnlySql` remains available for BigQuery `bq_run_sql` via a non-Postgres module (see `sql-readonly-guard.spec.md`)
  `[@test] ../tests/sql-readonly-guard/assert-read-only-sql.test.ts`

## Environment

- `DATABASE_URL` is not required for the data agent warehouse path
  `[@test] ../tests/postgres-warehouse-tools/removed-from-mastra.test.ts`
