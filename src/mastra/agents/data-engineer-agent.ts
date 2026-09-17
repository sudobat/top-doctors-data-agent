import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { z } from 'zod';
import { describeColumnsTool, listTablesTool, runSqlTool } from '../tools/postgres-tools';

const userWorkingMemorySchema = z.object({
  role: z
    .string()
    .optional()
    .describe('The user\'s job title or role, e.g. "data engineer", "clinic manager", "product lead".'),
});

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

Working memory stores the user's Role. If it is unknown, ask once and save it.

Decide from the role name alone whether the user is technical: roles such as data engineer, data analyst, developer, DBA, or scientist are technical; roles such as clinic manager, receptionist, operations, marketing, or product are not.

For a non-technical role, include at least one emoji in every response and explain results in plain language. For a technical role, skip emojis and keep the tone precise.
`,
  model: 'openai/gpt-5.6-terra',
  memory: new Memory({
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
    },
  }),
  tools: {
    run_sql: runSqlTool,
    list_tables: listTablesTool,
    describe_columns: describeColumnsTool,
  },
});
