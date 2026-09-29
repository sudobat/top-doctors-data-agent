---
name: Postgres Warehouse Tools
description: Read-only clinic Postgres pool and Mastra tools for local medallion warehouse access
targets:
  - ../src/mastra/db/postgres.ts
  - ../src/mastra/tools/postgres-tools.ts
---

# Postgres Warehouse Tools

## Client

```ts
function getPostgresPool(): pg.Pool
function queryPostgres(sql: string, params?: unknown[]): Promise<{ rows; rowCount; fields }>
```

- `DATABASE_URL` is required; missing value throws `"DATABASE_URL is not set."`
- Row serialization: `Date` → ISO string, `bigint` → string, `Buffer` → base64

## Tools (registered on Mastra; not bound to data agents)

| Tool id | Behavior |
| --- | --- |
| `run_sql` | Validates with `assertReadOnlySql`, then `queryPostgres` |
| `list_tables` | Lists `public` base tables ordered by name |
| `describe_columns` | Columns for `public.<tableName>`; missing table throws |

- `run_sql` rejects non-read-only SQL via the shared guard
  `[@test] ../tests/sql-readonly-guard/assert-read-only-sql.test.ts`
