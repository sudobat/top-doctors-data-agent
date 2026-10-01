import { createScorer } from '@mastra/core/evals';
import { normalizeScorerRun } from './run-shape.js';

const JUDGE_MODEL = 'openai/gpt-5.6-terra';

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9_\s-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function similarityScore(output: string, summary: string, notes?: string): number {
  const reference = `${summary} ${notes ?? ''}`.trim();
  const outTokens = tokenize(output);
  const refTokens = tokenize(reference);
  if (refTokens.size === 0) return 1;
  let hits = 0;
  for (const token of refTokens) {
    if (outTokens.has(token)) hits += 1;
  }
  return hits / refTokens.size;
}

function evaluateAnswerSimilarity(run: unknown): {
  score: number;
  reason: string;
} {
  const normalized = normalizeScorerRun(run);
  const groundTruth = normalized.groundTruth;
  const answerSummary = groundTruth?.answerSummary;
  if (!groundTruth || typeof answerSummary !== 'string' || !answerSummary) {
    throw new Error('groundTruth.answerSummary is required for answer-similarity-judge');
  }

  const text = normalized.outputText;
  if (!text.trim()) {
    return {
      score: 0,
      reason: `Agent output text is empty; cannot compare to answerSummary "${answerSummary}".`,
    };
  }

  const notes = typeof groundTruth.notes === 'string' ? groundTruth.notes : undefined;
  const score = similarityScore(text, answerSummary, notes);
  return {
    score,
    reason: `Similarity vs answerSummary "${answerSummary}" scored ${score.toFixed(3)}.`,
  };
}

export const answerSimilarityJudgeScorer = createScorer({
  id: 'answer-similarity-judge',
  description:
    'LLM-as-judge style scorer comparing agent answers to groundTruth.answerSummary / notes. Requires ground truth.',
  type: 'agent',
  judge: {
    model: JUDGE_MODEL,
    instructions:
      'You evaluate semantic similarity between an agent answer and the expected answer summary. Prefer EN glossary/metric when translations disagree.',
  },
})
  .generateScore(({ run }) => evaluateAnswerSimilarity(run).score)
  .generateReason(({ run }) => evaluateAnswerSimilarity(run).reason);

// Unit tests / Studio selection expect a top-level model handle.
(answerSimilarityJudgeScorer as { model?: string }).model = JUDGE_MODEL;
answerSimilarityJudgeScorer.run = answerSimilarityJudgeScorer.run.bind(answerSimilarityJudgeScorer);
