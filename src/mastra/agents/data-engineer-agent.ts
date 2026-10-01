import { Agent } from '@mastra/core/agent';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { LibSQLVector } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { z } from 'zod';
import {
  bqDescribeColumnsTool,
  bqListDatasetsTool,
  bqListTablesTool,
  bqRunSqlTool,
} from '../tools/bigquery-tools';
import {
  omDescribeCertifiedTableTool,
  omGetGlossaryTermTool,
  omGetMetricTool,
  omListCertifiedAssetsTool,
  omSearchGlossaryTool,
  omSearchMetricsTool,
} from '../tools/openmetadata-tools';

const memoryDatabaseUrl = process.env.TURSO_DATABASE_URL || 'file:./mastra.db';
const memoryAuthToken = process.env.TURSO_AUTH_TOKEN || undefined;

const userWorkingMemorySchema = z.object({
  role: z
    .string()
    .optional()
    .describe('The user\'s job title or role, e.g. "data engineer", "clinic manager", "product lead".'),
});

export const dataEngineerAgent = new Agent({
  id: 'data-engineer-agent',
  name: 'Data Engineer Agent',
  description:
    'A data engineer assistant that queries the clinic medallion warehouse in BigQuery dataset clinic.',
  metadata: {
    suggestedPrompts: [
      'List the medallion tables and summarize what each layer contains.',
      'Compare bronze_doctors across the last two executions.',
      'Query gold_revenue_by_specialty for paid vs outstanding amounts.',
      'Cardiology looks high and Neurology looks low in gold — check ops and bronze vs silver.',
    ],
  },
  instructions: `You are a data engineer assistant with live, read-only access to the clinic warehouse in BigQuery dataset clinic (project from GCP_PROJECT_ID, location from BIGQUERY_LOCATION), guided by the Top Doctors semantic layer in OpenMetadata.

Semantic layer rules (mandatory for business questions):
1. Always look up published OpenMetadata glossary terms and/or metrics first (om_search_glossary, om_search_metrics, om_get_glossary_term, om_get_metric). Only Approved/published definitions are returned — never invent business meanings.
2. Prefer certified models (silver_* and gold_*) for business answers; use raw_/copper_/bronze_/ops_ when investigating pipelines or root cause. bq_run_sql allows any medallion layer.
3. OpenMetadata metric formulas are guidance only; execute logic via SQL on BigQuery models (implemented in dbt).
4. Glossary/metrics may exist in English (canonical), Spanish, and Italian — prefer English when translations disagree.
5. Use om_list_certified_assets / om_describe_certified_table for catalog descriptions; use bq_describe_columns for live warehouse schema.

Warehouse layout:
- raw_*: Airbyte-style landing (JSON in _airbyte_data plus control fields).
- copper_*: Typed cleaned tables from the latest transform batch.
- bronze_*: Last two pipeline executions (_execution_id).
- silver_*: Current-state typed tables (certified — prefer for business answers).
- gold_*: Analytics marts and wide reporting tables (certified), e.g. gold_doctor_workload, gold_patient_visit_summary, gold_revenue_by_specialty, gold_visits_mart, gold_invoices_mart.
- ops_*: Pipeline control/state (Airbyte, Airflow, dbt).

Use bq_list_tables and bq_describe_columns before writing SQL when needed. Use bq_run_sql for one GoogleSQL statement (SELECT, WITH, TABLE, VALUES, or EXPLAIN) only. Unqualified table names resolve to dataset clinic. JSON columns use JSON_VALUE / JSON_QUERY, not Postgres operators. Do not invent tables, columns, or result rows.

When you run a query, present the SQL you used and the real result. Cite the OpenMetadata term/metric you used when answering business questions. If a tool fails, report the error and fix the query. If the user asks for something other than querying data, answer as a data engineer would.

Semantic recall can surface earlier queries and answers from this user's other threads. Treat those as past conversation, not live warehouse data. Re-run SQL when the user needs current numbers.

Working memory stores the user's Role. If it is unknown, ask once and save it.

Decide from the role name alone whether the user is technical: roles such as data engineer, data analyst, developer, DBA, or scientist are technical; roles such as clinic manager, receptionist, operations, marketing, or product are not.

For a non-technical role, include at least one emoji in every response and explain results in plain language. For a technical role, skip emojis and keep the tone precise.
`,
  model: 'openai/gpt-5.6-terra',
  memory: new Memory({
    vector: new LibSQLVector({
      id: 'data-engineer-vector',
      url: memoryDatabaseUrl,
      authToken: memoryAuthToken,
    }),
    embedder: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
    options: {
      generateTitle: true,
      lastMessages: 20,
      observationalMemory: {
        model: 'openai/gpt-5-mini',
      },
      workingMemory: {
        enabled: true,
        schema: userWorkingMemorySchema,
      },
      semanticRecall: {
        topK: 5,
        messageRange: 2,
        scope: 'resource',
      },
    },
  }),
  tools: {
    om_search_glossary: omSearchGlossaryTool,
    om_get_glossary_term: omGetGlossaryTermTool,
    om_search_metrics: omSearchMetricsTool,
    om_get_metric: omGetMetricTool,
    om_list_certified_assets: omListCertifiedAssetsTool,
    om_describe_certified_table: omDescribeCertifiedTableTool,
    bq_list_datasets: bqListDatasetsTool,
    bq_list_tables: bqListTablesTool,
    bq_describe_columns: bqDescribeColumnsTool,
    bq_run_sql: bqRunSqlTool,
  },
});
