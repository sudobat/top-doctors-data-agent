---
name: BigQuery Semantic SQL Guards
description: Extra BigQuery-only checks for EXPORT/LOAD write forms
targets:
  - ../src/mastra/tools/bigquery-tools.ts
---

# BigQuery Semantic SQL Guards

```ts
function assertBigQueryReadOnly(sql: string): void
```

Applied by `bq_run_sql` after `assertReadOnlySql`.

## BigQuery write forms

- `EXPORT DATA` and `LOAD DATA` are rejected with `"Write or DDL SQL is not allowed."`
  `[@test] ../tests/bigquery-semantic-sql/assert-bq-guards.test.ts`

## Notes

- Medallion layer prefixes (`raw_`, `copper_`, `bronze_`, `silver_`, `gold_`, `ops_`) are **not** restricted by `bq_run_sql`; any table in the configured dataset may be queried if the SQL is otherwise read-only.
