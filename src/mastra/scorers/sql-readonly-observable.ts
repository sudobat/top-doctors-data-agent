import { createScorer } from '@mastra/core/evals';
import { assertCertifiedSemanticSql } from '../tools/bigquery-tools.js';
import { assertReadOnlySql } from '../tools/sql-readonly.js';
import { normalizeScorerRun } from './run-shape.js';

function extractObservableSql(run: unknown): string | undefined {
  const normalized = normalizeScorerRun(run);
  for (const call of normalized.toolCalls) {
    if (call.toolName !== 'bq_run_sql') continue;
    const sql = call.args?.sql ?? call.input?.sql;
    if (typeof sql === 'string' && sql.trim()) return sql;
  }
  return undefined;
}

function evaluateSqlReadonly(run: unknown): {
  score: number;
  reason: string;
} {
  const normalized = normalizeScorerRun(run);
  const sql = extractObservableSql(run);
  if (!sql) {
    return {
      score: 0,
      reason:
        'No observable SQL found: bq_run_sql was not called or SQL args were not available.',
    };
  }

  try {
    assertReadOnlySql(sql);
    const constraints = normalized.groundTruth?.sqlConstraints as
      | { certifiedOnly?: boolean }
      | undefined;
    if (constraints?.certifiedOnly) {
      assertCertifiedSemanticSql(sql);
    }
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
  type: 'agent',
})
  .generateScore(({ run }) => evaluateSqlReadonly(run).score)
  .generateReason(({ run }) => evaluateSqlReadonly(run).reason);

sqlReadonlyObservableScorer.run = sqlReadonlyObservableScorer.run.bind(sqlReadonlyObservableScorer);
