---
name: BigQuery Warehouse Tools
description: GCP BigQuery client and read-only tools for the clinic dataset
targets:
  - ../src/mastra/db/bigquery.ts
  - ../src/mastra/tools/bigquery-tools.ts
---

# BigQuery Warehouse Tools

## Client env

- Requires `GCP_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS`
- Defaults: `BIGQUERY_DATASET=clinic`, `BIGQUERY_LOCATION=EU`, max bytes billed 1 GiB, max rows 500

## Tools

| Tool id | Behavior |
| --- | --- |
| `bq_list_datasets` | Lists datasets in the project |
| `bq_list_tables` | Lists tables; dataset defaults to clinic |
| `bq_describe_columns` | Flattens nested RECORD fields as `parent.child` |
| `bq_run_sql` | `assertReadOnlySql` → `assertBigQueryReadOnly` → query |

- Dataset/table identifiers must match `/^[A-Za-z_][A-Za-z0-9_]{0,1023}$/`
  `[@test] ../tests/bigquery-semantic-sql/assert-bq-guards.test.ts`
- Missing dataset/table throws a clear not-found error
