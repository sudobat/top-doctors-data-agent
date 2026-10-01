import { createScorer } from '@mastra/core/evals';

const JUDGE_MODEL = 'openai/gpt-5.6-terra';

type SimilarityRun = {
  output?: unknown;
  groundTruth?: { answerSummary?: unknown; notes?: string };
};

function extractOutputText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    return output
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'content' in part) {
          return String((part as { content?: unknown }).content ?? '');
        }
        return '';
      })
      .join('\n');
  }
  return String(output ?? '');
}

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

function evaluateAnswerSimilarity(run: SimilarityRun): {
  score: number;
  reason: string;
} {
  const groundTruth = run.groundTruth;
  if (!groundTruth || typeof groundTruth.answerSummary !== 'string' || !groundTruth.answerSummary) {
    throw new Error('groundTruth.answerSummary is required for answer-similarity-judge');
  }
  const score = similarityScore(
    extractOutputText(run.output),
    groundTruth.answerSummary,
    groundTruth.notes,
  );
  return {
    score,
    reason: `Similarity vs answerSummary "${groundTruth.answerSummary}" scored ${score.toFixed(3)}.`,
  };
}

export const answerSimilarityJudgeScorer = createScorer({
  id: 'answer-similarity-judge',
  description:
    'LLM-as-judge style scorer comparing agent answers to groundTruth.answerSummary / notes. Requires ground truth.',
  judge: {
    model: JUDGE_MODEL,
    instructions:
      'You evaluate semantic similarity between an agent answer and the expected answer summary. Prefer EN glossary/metric when translations disagree.',
  },
})
  .generateScore(({ run }) => evaluateAnswerSimilarity(run as SimilarityRun).score)
  .generateReason(({ run }) => evaluateAnswerSimilarity(run as SimilarityRun).reason);

// Unit tests / Studio selection expect a top-level model handle.
(answerSimilarityJudgeScorer as { model?: string }).model = JUDGE_MODEL;
answerSimilarityJudgeScorer.run = answerSimilarityJudgeScorer.run.bind(answerSimilarityJudgeScorer);
