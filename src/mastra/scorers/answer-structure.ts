import { createScorer } from '@mastra/core/evals';

type AnswerStructureRun = {
  output?: unknown;
  groundTruth?: { expectedStructure?: string[] };
};

function normalizeHeading(label: string): string {
  return label
    .toLowerCase()
    .replace(/[#*_`>~\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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
  if (output && typeof output === 'object' && 'text' in (output as object)) {
    return String((output as { text?: unknown }).text ?? '');
  }
  return String(output ?? '');
}

function findMissingSections(text: string, expected: string[]): string[] {
  const normalizedText = normalizeHeading(text);
  return expected.filter((section) => {
    const needle = normalizeHeading(section);
    return !normalizedText.includes(needle);
  });
}

function evaluateAnswerStructure(run: AnswerStructureRun): {
  score: number;
  reason: string;
} {
  const expected = run.groundTruth?.expectedStructure ?? [];
  if (expected.length === 0) {
    return {
      score: 1,
      reason: `Output contains expected structure sections: (none).`,
    };
  }
  const missing = findMissingSections(extractOutputText(run.output), expected);
  if (missing.length === 0) {
    return {
      score: 1,
      reason: `Output contains expected structure sections: ${expected.join(', ')}.`,
    };
  }
  return {
    score: 0,
    reason: `Missing expected structure sections: ${missing.join(', ')}.`,
  };
}

export const answerStructureScorer = createScorer({
  id: 'answer-structure',
  description:
    'Checks that the agent output contains the section/heading keys in groundTruth.expectedStructure (case-insensitive, markdown-tolerant).',
})
  .generateScore(({ run }) => evaluateAnswerStructure(run as AnswerStructureRun).score)
  .generateReason(({ run }) => evaluateAnswerStructure(run as AnswerStructureRun).reason);

answerStructureScorer.run = answerStructureScorer.run.bind(answerStructureScorer);
