import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { clinicDatasetId, describeColumns, listDatasets, listTables, queryBigQuery } from '../db/bigquery';
import { assertReadOnlySql } from './sql-readonly';

export const bqListDatasetsTool = createTool({
  id: 'bq_list_datasets',
  description:
    'List BigQuery datasets in the configured GCP project (GCP_PROJECT_ID), including each dataset location.',
  inputSchema: z.object({}),
  execute: async () => listDatasets(),
});

export const bqListTablesTool = createTool({
  id: 'bq_list_tables',
  description: 'List tables and views in a BigQuery dataset. Defaults to the clinic dataset.',
  inputSchema: z.object({
    datasetId: z
      .string()
      .optional()
      .describe('BigQuery dataset id. Defaults to BIGQUERY_DATASET (clinic).'),
  }),
  execute: async ({ datasetId }) => listTables(datasetId || clinicDatasetId()),
});

export const bqDescribeColumnsTool = createTool({
  id: 'bq_describe_columns',
  description: 'Describe columns for a BigQuery table, including nested RECORD fields.',
  inputSchema: z.object({
    datasetId: z
      .string()
      .optional()
      .describe('BigQuery dataset id. Defaults to BIGQUERY_DATASET (clinic).'),
    tableId: z.string().describe('BigQuery table id inside that dataset.'),
  }),
  execute: async ({ datasetId, tableId }) => describeColumns(datasetId || clinicDatasetId(), tableId),
});

export const bqRunSqlTool = createTool({
  id: 'bq_run_sql',
  description:
    'Run one read-only GoogleSQL query (SELECT, WITH, TABLE, VALUES, or EXPLAIN) against certified clinic BigQuery models only (silver_/gold_). Unqualified table names resolve to that dataset. raw_/copper_/bronze_/ops_ are rejected. Returns at most 500 rows. Queries are capped by BIGQUERY_MAXIMUM_BYTES_BILLED (default 1 GiB).',
  inputSchema: z.object({
    sql: z.string().describe('A single read-only GoogleSQL statement.'),
    location: z
      .string()
      .optional()
      .describe('BigQuery location, for example EU or europe-west1. Falls back to BIGQUERY_LOCATION.'),
  }),
  execute: async ({ sql, location }) => {
    const safeSql = assertReadOnlySql(sql);
    assertBigQueryReadOnly(safeSql);
    assertCertifiedSemanticSql(safeSql);
    return queryBigQuery(safeSql, location);
  },
});

export function assertBigQueryReadOnly(sql: string): void {
  if (/\b(EXPORT\s+DATA|LOAD\s+DATA)\b/i.test(sql)) {
    throw new Error('Write or DDL SQL is not allowed.');
  }
}

/** Semantic layer: agents may only query certified silver_/gold_ models. */
export function assertCertifiedSemanticSql(sql: string): void {
  const forbidden = sql.match(/\b(?:raw_|copper_|bronze_|ops_)[A-Za-z0-9_]+/gi);
  if (forbidden?.length) {
    throw new Error(
      `Semantic layer allows only certified silver_/gold_ models. Forbidden reference(s): ${[...new Set(forbidden)].join(', ')}`,
    );
  }
}
