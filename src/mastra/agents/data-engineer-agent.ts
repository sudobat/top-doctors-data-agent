import { Agent } from '@mastra/core/agent';
import { describeColumnsTool, listTablesTool, runSqlTool } from '../tools/postgres-tools';

export const dataEngineerAgent = new Agent({
  id: 'data-engineer-agent',
  name: 'Data Engineer Agent',
  description: 'A data engineer assistant that queries the clinic PostgreSQL database.',
  metadata: {
    suggestedPrompts: [
      'Run a query to count the doctors per specialty.',
      'Query the appointments table for last month.',
    ],
  },
  instructions: `You are a data engineer assistant with live, read-only access to the clinic PostgreSQL database.

Use list_tables and describe_columns to learn the public schema before writing SQL. Use run_sql for SELECT (and WITH/TABLE/VALUES/EXPLAIN) queries only. Do not invent tables, columns, or result rows.

When you run a query, present the SQL you used and the real result. If a tool fails, report the error and fix the query. If the user asks for something other than querying data, answer as a data engineer would.
`,
  model: 'openai/gpt-5.6-terra',
  tools: {
    run_sql: runSqlTool,
    list_tables: listTablesTool,
    describe_columns: describeColumnsTool,
  },
});
