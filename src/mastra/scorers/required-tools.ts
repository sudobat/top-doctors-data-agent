import { createScorer } from '@mastra/core/evals';

type ToolCallLike =
  | string
  | {
      toolName?: string;
      toolId?: string;
      name?: string;
    };

type RequiredToolsRun = {
  toolCalls?: ToolCallLike[];
  tracing?: { toolCalls?: ToolCallLike[] };
  groundTruth?: { requiredTools?: string[] };
};

function collectToolIds(run: RequiredToolsRun): string[] {
  const ids = new Set<string>();
  const add = (entry: ToolCallLike | undefined) => {
    if (!entry) return;
    if (typeof entry === 'string') {
      ids.add(entry);
      return;
    }
    const id = entry.toolName ?? entry.toolId ?? entry.name;
    if (typeof id === 'string' && id.length > 0) ids.add(id);
  };

  for (const entry of run.toolCalls ?? []) add(entry);
  for (const entry of run.tracing?.toolCalls ?? []) add(entry);
  return [...ids];
}

function evaluateRequiredTools(run: RequiredToolsRun): {
  score: number;
  reason: string;
} {
  const required = run.groundTruth?.requiredTools ?? [];
  const called = new Set(collectToolIds(run));
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
})
  .generateScore(({ run }) => evaluateRequiredTools(run as RequiredToolsRun).score)
  .generateReason(({ run }) => evaluateRequiredTools(run as RequiredToolsRun).reason);

requiredToolsScorer.run = requiredToolsScorer.run.bind(requiredToolsScorer);
