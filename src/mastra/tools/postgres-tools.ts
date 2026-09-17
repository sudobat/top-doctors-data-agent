import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { queryPostgres } from '../db/postgres';

const BLOCKED_SQL =
  /\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|LOCK|VACUUM|REFRESH|COMMENT|REASSIGN|OWNER|RESET|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|DECLARE|EXECUTE|PREPARE|DEALLOCATE|LISTEN|NOTIFY|UNLISTEN|LOAD|DISCARD|REINDEX|CLUSTER|CHECKPOINT|SET)\b/i;

const ALLOWED_START = /^(SELECT|WITH|TABLE|VALUES|EXPLAIN)\b/i;

export function assertReadOnlySql(sql: string): string {
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new Error('SQL query must not be empty.');
  }

  const stripped = stripSqlLiteralsAndComments(trimmed);
  const withoutTrailingSemicolon = stripped.replace(/;\s*$/, '').trim();
  if (!withoutTrailingSemicolon) {
    throw new Error('SQL query must not be empty.');
  }
  if (withoutTrailingSemicolon.includes(';')) {
    throw new Error('Only a single SQL statement is allowed.');
  }

  if (!ALLOWED_START.test(withoutTrailingSemicolon)) {
    throw new Error('Only read-only SQL is allowed (SELECT, WITH, TABLE, VALUES, or EXPLAIN).');
  }

  const explainPrefix = withoutTrailingSemicolon.match(/^EXPLAIN(?:\s+ANALYZE)?(?:\s+VERBOSE)?\s+/i);
  const statement = explainPrefix
    ? withoutTrailingSemicolon.slice(explainPrefix[0].length)
    : withoutTrailingSemicolon;

  if (!/^(SELECT|WITH|TABLE|VALUES)\b/i.test(statement)) {
    throw new Error('Only read-only SQL is allowed (SELECT, WITH, TABLE, VALUES, or EXPLAIN of those).');
  }

  if (BLOCKED_SQL.test(withoutTrailingSemicolon)) {
    throw new Error('Write or DDL SQL is not allowed.');
  }

  return trimmed.replace(/;\s*$/, '').trim();
}

export const runSqlTool = createTool({
  id: 'run_sql',
  description:
    'Run a read-only SQL query against the clinic PostgreSQL database and return all rows. SELECT/WITH/TABLE/VALUES/EXPLAIN only.',
  inputSchema: z.object({
    sql: z.string().describe('A single read-only SQL statement.'),
  }),
  execute: async ({ sql }) => {
    const safeSql = assertReadOnlySql(sql);
    return queryPostgres(safeSql);
  },
});

export const listTablesTool = createTool({
  id: 'list_tables',
  description: 'List base tables in the public schema of the clinic PostgreSQL database.',
  inputSchema: z.object({}),
  execute: async () => {
    return queryPostgres(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
  },
});

export const describeColumnsTool = createTool({
  id: 'describe_columns',
  description: 'Describe columns for a table in the public schema of the clinic PostgreSQL database.',
  inputSchema: z.object({
    tableName: z.string().describe('Table name in the public schema.'),
  }),
  execute: async ({ tableName }) => {
    const result = await queryPostgres(
      `
      SELECT
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default,
        ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
      [tableName],
    );

    if (result.rowCount === 0) {
      throw new Error(`Table "${tableName}" was not found in the public schema.`);
    }

    return result;
  },
});

function stripSqlLiteralsAndComments(sql: string): string {
  let output = '';
  let i = 0;

  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (two === '--') {
      const newline = sql.indexOf('\n', i);
      i = newline === -1 ? sql.length : newline;
      continue;
    }

    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }

    const char = sql[i];
    if (char === "'" || char === '"') {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === char) {
          if (sql[i + 1] === char) {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      output += ' ';
      continue;
    }

    if (char === '$') {
      const tagMatch = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (tagMatch) {
        const tag = tagMatch[0];
        const end = sql.indexOf(tag, i + tag.length);
        i = end === -1 ? sql.length : end + tag.length;
        output += ' ';
        continue;
      }
    }

    output += char;
    i += 1;
  }

  return output;
}
