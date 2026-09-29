---
name: BigQuery Semantic SQL Guards
description: Extra BigQuery-only checks for EXPORT/LOAD and non-certified medallion prefixes
targets:
  - ../src/mastra/tools/bigquery-tools.ts
---

# BigQuery Semantic SQL Guards

```ts
function assertBigQueryReadOnly(sql: string): void
function assertCertifiedSemanticSql(sql: string): void
```

Applied by `bq_run_sql` after `assertReadOnlySql`.

## BigQuery write forms

- `EXPORT DATA` and `LOAD DATA` are rejected with `"Write or DDL SQL is not allowed."`
  `[@test] ../tests/bigquery-semantic-sql/assert-bq-guards.test.ts`

## Certified models

- Identifiers matching `raw_*`, `copper_*`, `bronze_*`, or `ops_*` are rejected with an error listing the forbidden references
  `[@test] ../tests/bigquery-semantic-sql/assert-bq-guards.test.ts`
- Queries that only reference `silver_*` / `gold_*` (or no forbidden prefixes) are allowed
  `[@test] ../tests/bigquery-semantic-sql/assert-bq-guards.test.ts`

## Notes

- Enforcement is a deny-list of non-certified prefixes, not an allow-list of `silver_`/`gold_`.
