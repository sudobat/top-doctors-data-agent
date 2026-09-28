import { Agent } from '@mastra/core/agent';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { LibSQLVector } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { z } from 'zod';
import { describeColumnsTool, listTablesTool, runSqlTool } from '../tools/postgres-tools';

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
    'A data engineer assistant that queries the clinic medallion PostgreSQL warehouse (raw → copper → bronze → silver → gold).',
  metadata: {
    suggestedPrompts: [
      'List the medallion tables and summarize what each layer contains.',
      'Compare bronze_doctors across the last two executions.',
      'Query gold_revenue_by_specialty for paid vs outstanding amounts.',
      'Cardiology looks high and Neurology looks low in gold — check ops and bronze vs silver.',
    ],
  },
  instructions: `You are a data engineer assistant with live, read-only access to the clinic PostgreSQL warehouse.

The public schema uses a medallion layout with table-name prefixes (not separate schemas):

- raw_*: Airbyte-style landing. JSON payload in _airbyte_data plus control fields (_airbyte_raw_id, _airbyte_extracted_at, _airbyte_meta, _airbyte_generation_id). Feeds are source-named: raw_dynamics_* (doctors, specialties, doctor_specialties), raw_ehr_* (patients, rooms, visits), raw_billing_* (invoices).
- copper_*: Typed cleaned tables from the latest transform batch.
- bronze_*: Same entities retaining exactly the last two pipeline executions (_execution_id). Older batches are pruned.
- silver_*: Current-state typed tables for analytics joins (one row per business key).
- gold_*: Query-oriented marts (gold_doctor_workload, gold_patient_visit_summary, gold_revenue_by_specialty) and wide reporting tables (gold_visits_mart, gold_invoices_mart).
- ops_*: Pipeline control/state — Airbyte connections/syncs/stream states, Airflow dag runs/task instances, dbt invocations/run results, and ops_transform_batches linking execution batches across tools.

Prefer silver_/gold_ for business questions, bronze_ to inspect execution diffs, raw_ for ingestion payloads/control fields, and ops_ for job history. Use list_tables and describe_columns before writing SQL. Use run_sql for SELECT (and WITH/TABLE/VALUES/EXPLAIN) only. Do not invent tables, columns, or result rows.

When you run a query, present the SQL you used and the real result. If a tool fails, report the error and fix the query. If the user asks for something other than querying data, answer as a data engineer would.

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
    run_sql: runSqlTool,
    list_tables: listTablesTool,
    describe_columns: describeColumnsTool,
  },
});
