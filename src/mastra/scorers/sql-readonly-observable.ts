import { createScorer } from '@mastra/core/evals';
import { assertCertifiedSemanticSql } from '../tools/bigquery-tools.js';
import { assertReadOnlySql } from '../tools/sql-readonly.js';

type ToolCallLike = {
  toolName?: string;
  toolId?: string;
  name?: string;
  args?: { sql?: string };
  input?: { sql?: string };
};

type SqlReadonlyRun = {
  toolCalls?: ToolCallLike[];
  tracing?: { toolCalls?: ToolCallLike[] };
  groundTruth?: { sqlConstraints?: { certifiedOnly?: boolean } };
};

function extractObservableSql(run: SqlReadonlyRun): string | undefined {
  const calls = [...(run.toolCalls ?? []), ...(run.tracing?.toolCalls ?? [])];
  for (const call of calls) {
    const name = call.toolName ?? call.toolId ?? call.name;
    if (name !== 'bq_run_sql') continue;
    const sql = call.args?.sql ?? call.input?.sql;
    if (typeof sql === 'string' && sql.trim()) return sql;
  }
  return undefined;
}

function validateObservableSql(sql: string, run: SqlReadonlyRun): void {
  assertReadOnlySql(sql);
  if (run.groundTruth?.sqlConstraints?.certifiedOnly) {
    assertCertifiedSemanticSql(sql);
  }
}

function evaluateSqlReadonly(run: SqlReadonlyRun): {
  score: number;
  reason: string;
} {
  const sql = extractObservableSql(run);
  if (!sql) {
    return {
      score: 0,
      reason:
        'No observable SQL found: bq_run_sql was not called or SQL args were not available.',
    };
  }

  try {
    validateObservableSql(sql, run);
    return {
      score: 1,
      reason:
        'Observable bq_run_sql SQL passed read-only (and certified-only when required) checks.',
    };
  } catch (error) {
    return {
      score: 0,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export const sqlReadonlyObservableScorer = createScorer({
  id: 'sql-readonly-observable',
  description:
    'When bq_run_sql args are observable, validates read-only SQL and optional certified-only table prefixes; otherwise non-pass with an explicit reason.',
})
  .generateScore(({ run }) => evaluateSqlReadonly(run as SqlReadonlyRun).score)
  .generateReason(({ run }) => evaluateSqlReadonly(run as SqlReadonlyRun).reason);

sqlReadonlyObservableScorer.run = sqlReadonlyObservableScorer.run.bind(sqlReadonlyObservableScorer);
