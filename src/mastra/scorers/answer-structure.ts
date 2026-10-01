import { createScorer } from '@mastra/core/evals';
import { normalizeScorerRun } from './run-shape.js';

function normalizeHeading(label: string): string {
  return label
    .toLowerCase()
    .replace(/[#*_`>~\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findMissingSections(text: string, expected: string[]): string[] {
  const normalizedText = normalizeHeading(text);
  return expected.filter((section) => {
    const needle = normalizeHeading(section);
    return !normalizedText.includes(needle);
  });
}

function evaluateAnswerStructure(run: unknown): {
  score: number;
  reason: string;
} {
  const normalized = normalizeScorerRun(run);
  const expected = Array.isArray(normalized.groundTruth?.expectedStructure)
    ? (normalized.groundTruth.expectedStructure as string[])
    : [];

  if (expected.length === 0) {
    return {
      score: 1,
      reason: `Output contains expected structure sections: (none).`,
    };
  }

  const text = normalized.outputText;
  if (!text.trim()) {
    return {
      score: 0,
      reason:
        'Agent output text is empty; cannot verify expected structure sections: ' +
        expected.join(', ') +
        '.',
    };
  }

  const missing = findMissingSections(text, expected);
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
  type: 'agent',
})
  .generateScore(({ run }) => evaluateAnswerStructure(run).score)
  .generateReason(({ run }) => evaluateAnswerStructure(run).reason);

answerStructureScorer.run = answerStructureScorer.run.bind(answerStructureScorer);
