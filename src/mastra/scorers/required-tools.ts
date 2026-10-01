import { createScorer } from '@mastra/core/evals';
import { normalizeScorerRun } from './run-shape.js';

function evaluateRequiredTools(run: unknown): {
  score: number;
  reason: string;
} {
  const normalized = normalizeScorerRun(run);
  const required = Array.isArray(normalized.groundTruth?.requiredTools)
    ? (normalized.groundTruth.requiredTools as string[])
    : [];
  const called = new Set(normalized.toolCalls.map((c) => c.toolName));
  const missing = required.filter((id) => !called.has(id));
  if (missing.length === 0) {
    return {
      score: 1,
      reason: `All required tools were called: ${required.join(', ') || '(none)'}.`,
    };
  }
  return {
    score: 0,
    reason: `Missing required tools: ${missing.join(', ')}.`,
  };
}

export const requiredToolsScorer = createScorer({
  id: 'required-tools',
  description:
    'Scores 1 when every groundTruth.requiredTools id appears in the tool-call trajectory; otherwise 0 with missing tools listed.',
  type: 'agent',
})
  .generateScore(({ run }) => evaluateRequiredTools(run).score)
  .generateReason(({ run }) => evaluateRequiredTools(run).reason);

requiredToolsScorer.run = requiredToolsScorer.run.bind(requiredToolsScorer);
