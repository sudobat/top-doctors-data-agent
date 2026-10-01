import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mastra } from '../../src/mastra/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('agent evals — observability metrics', () => {
  it('relies on existing Mastra observability exporters for cost and latency (no custom accounting)', () => {
    const indexSource = readFileSync(join(root, 'src/mastra/index.ts'), 'utf8');
    assert.match(indexSource, /MastraStorageExporter/);
    assert.match(indexSource, /MastraPlatformExporter/);
    assert.ok(mastra.getObservability?.() || (mastra as { observability?: unknown }).observability);

    assert.doesNotMatch(indexSource, /customCostAccounting|CostTracker|tokenBillingStore/);
    const runnerPath = join(root, 'scripts/eval-run-experiment.mjs');
    const runner = readFileSync(runnerPath, 'utf8');
    assert.doesNotMatch(
      runner,
      /customCostAccounting|CostTracker|tokenBillingStore|recordCost\(/,
      'eval runner must not invent custom cost accounting',
    );
  });

  it('links experiment items to observability traces for duration and usage/cost comparison', () => {
    const runner = readFileSync(join(root, 'scripts/eval-run-experiment.mjs'), 'utf8');
    assert.match(
      runner,
      /traceId|trace_id|observability|span/i,
      'runner must surface or link observability traces per experiment item',
    );
  });
});
