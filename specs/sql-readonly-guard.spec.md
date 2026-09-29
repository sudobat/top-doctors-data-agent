---
name: SQL Read-Only Guard
description: Shared validation that allows only single-statement read-only SQL for warehouse tools
targets:
  - ../src/mastra/tools/postgres-tools.ts
---

# SQL Read-Only Guard

```ts
function assertReadOnlySql(sql: string): string
```

Used by Postgres `run_sql` and BigQuery `bq_run_sql` before execution.

## Allowed statements

- Accepts a single statement starting with `SELECT`, `WITH`, `TABLE`, `VALUES`, or `EXPLAIN` / `EXPLAIN ANALYZE` / `EXPLAIN VERBOSE` of those
  `[@test] ../tests/sql-readonly-guard/assert-read-only-sql.test.ts`
- Trailing semicolon is stripped from the returned SQL
  `[@test] ../tests/sql-readonly-guard/assert-read-only-sql.test.ts`

## Rejected input

- Empty or whitespace-only SQL throws `"SQL query must not be empty."`
  `[@test] ../tests/sql-readonly-guard/assert-read-only-sql.test.ts`
- Multiple statements (`;` separating statements after stripping) throw `"Only a single SQL statement is allowed."`
  `[@test] ../tests/sql-readonly-guard/assert-read-only-sql.test.ts`
- Write/DDL/admin keywords (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, `SET`, …) throw `"Write or DDL SQL is not allowed."`
  `[@test] ../tests/sql-readonly-guard/assert-read-only-sql.test.ts`
- Keywords inside string literals or comments must not trigger a block
  `[@test] ../tests/sql-readonly-guard/assert-read-only-sql.test.ts`
