import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const AGENTS = ['data-engineer-agent', 'outlier-analysis-agent'] as const;

describe('agent evals — dataset layout', () => {
  for (const agentId of AGENTS) {
    it(`has a versioned starter dataset at evals/datasets/${agentId}/v1.json`, () => {
      const dir = join(root, 'evals/datasets', agentId);
      const v1 = join(dir, 'v1.json');
      assert.equal(existsSync(dir), true, `missing dataset dir ${dir}`);
      assert.equal(existsSync(v1), true, `missing starter dataset ${v1}`);

      const versioned = readdirSync(dir).filter((f) => /^v\d+\.json$/.test(f));
      assert.ok(versioned.includes('v1.json'), 'starter version must be v1.json');
      assert.ok(versioned.length >= 1, 'at least one versioned dataset file required');
    });
  }
});
