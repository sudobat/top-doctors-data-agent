import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

// Intended implementation — ImportError / missing file makes these red until authored.
import {
  applyVariantOverrides,
  resolveExperimentConfig,
  startAgentExperiment,
} from '../../scripts/eval-run-experiment.mjs';

describe('agent evals — experiment runner', () => {
  it('applies variant overrides ephemerally without mutating agent source files', () => {
    const agentSourceBefore = readFileSync(
      join(root, 'src/mastra/agents/data-engineer-agent.ts'),
      'utf8',
    );
    const result = applyVariantOverrides({
      agentId: 'data-engineer-agent',
      variant: {
        id: 'override-model',
        agentId: 'data-engineer-agent',
        model: 'openai/gpt-test-override',
        instructions: 'ephemeral eval instructions',
        tools: ['bq_run_sql'],
        scorers: ['required-tools'],
      },
    });
    assert.equal(result.model, 'openai/gpt-test-override');
    assert.equal(result.instructions, 'ephemeral eval instructions');
    assert.deepEqual(result.tools, ['bq_run_sql']);
    const agentSourceAfter = readFileSync(
      join(root, 'src/mastra/agents/data-engineer-agent.ts'),
      'utf8',
    );
    assert.equal(agentSourceAfter, agentSourceBefore, 'agent source must not be permanently mutated');
  });

  it('tools override is the exact tool set for the run', () => {
    const result = applyVariantOverrides({
      agentId: 'outlier-analysis-agent',
      variant: {
        id: 'subset',
        agentId: 'outlier-analysis-agent',
        tools: ['bq_list_tables', 'bq_run_sql'],
      },
    });
    assert.deepEqual(result.tools, ['bq_list_tables', 'bq_run_sql']);
    assert.equal(result.tools?.length, 2);
  });

  it('resolves dataset by agent, applies variant, and starts experiment with agent target', () => {
    const config = resolveExperimentConfig({
      agentId: 'data-engineer-agent',
      variantId: 'baseline',
    });
    assert.equal(config.targetType, 'agent');
    assert.equal(config.targetId, 'data-engineer-agent');
    assert.ok(Array.isArray(config.scorers) && config.scorers.length > 0);
    assert.ok(config.datasetName === 'data-engineer-agent-v1' || config.datasetId);
  });

  it('persists experiments to Mastra storage for Studio visibility', async () => {
    const outcome = await startAgentExperiment({
      agentId: 'data-engineer-agent',
      variantId: 'baseline',
    });
    assert.ok(outcome.experimentId, 'experiment must return a persisted id');
    assert.equal(outcome.visibleInStudio, true);
  });

  it('exposes per-item scorer scores and reasons in the experiment summary', async () => {
    const outcome = await startAgentExperiment({
      agentId: 'outlier-analysis-agent',
      variantId: 'baseline',
    });
    assert.ok(Array.isArray(outcome.items) && outcome.items.length > 0);
    const scored = outcome.items.find((i: { scores?: unknown }) => i.scores);
    assert.ok(scored, 'at least one item should carry scorer scores');
    for (const entry of Object.values(scored.scores as Record<string, { score?: number; reason?: string }>)) {
      assert.equal(typeof entry.score, 'number');
      assert.equal(typeof entry.reason, 'string');
    }
  });

  it('compares experiments via dataset.compareExperiments / listed results — not a separate metrics store', () => {
    const runnerSource = readFileSync(join(root, 'scripts/eval-run-experiment.mjs'), 'utf8');
    assert.match(runnerSource, /compareExperiments|listExperiments|experiment/i);
    assert.doesNotMatch(
      runnerSource,
      /customMetricsStore|metrics\.db|costAccounting/,
      'must not invent a separate metrics store',
    );
    assert.equal(existsSync(join(root, 'evals/metrics-store')), false);
  });
});
