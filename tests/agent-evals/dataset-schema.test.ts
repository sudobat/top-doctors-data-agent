import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const AGENTS = ['data-engineer-agent', 'outlier-analysis-agent'] as const;

type DatasetItem = {
  externalId?: string;
  input?: unknown;
  groundTruth?: {
    answerSummary?: unknown;
    requiredTools?: unknown;
    expectedStructure?: unknown;
    notes?: unknown;
  };
};

type DatasetFile = {
  name?: string;
  description?: string;
  agentId?: string;
  inputSchema?: unknown;
  groundTruthSchema?: unknown;
  items?: DatasetItem[];
};

function loadDataset(agentId: string): DatasetFile {
  const path = join(root, 'evals/datasets', agentId, 'v1.json');
  assert.equal(existsSync(path), true, `missing dataset ${path}`);
  return JSON.parse(readFileSync(path, 'utf8')) as DatasetFile;
}

function isMessageArray(input: unknown): boolean {
  return (
    Array.isArray(input) &&
    input.every(
      (m) =>
        m &&
        typeof m === 'object' &&
        typeof (m as { role?: unknown }).role === 'string' &&
        'content' in (m as object),
    )
  );
}

describe('agent evals — dataset schema', () => {
  for (const agentId of AGENTS) {
    it(`${agentId} dataset name is stable and unique for the version`, () => {
      const ds = loadDataset(agentId);
      assert.equal(ds.name, `${agentId}-v1`);
      assert.equal(ds.agentId, agentId);
    });

    it(`${agentId} items use string or message-array input suitable for agent.generate`, () => {
      const ds = loadDataset(agentId);
      assert.ok(Array.isArray(ds.items) && ds.items.length > 0, 'items must be a non-empty array');
      for (const item of ds.items!) {
        const ok =
          typeof item.input === 'string' || isMessageArray(item.input);
        assert.ok(ok, `item ${item.externalId ?? '?'} input must be string or message array`);
      }
    });

    it(`${agentId} groundTruth includes answerSummary and requiredTools`, () => {
      const ds = loadDataset(agentId);
      for (const item of ds.items ?? []) {
        const gt = item.groundTruth;
        assert.ok(gt && typeof gt === 'object', `item ${item.externalId} needs groundTruth object`);
        assert.equal(
          typeof gt!.answerSummary,
          'string',
          `item ${item.externalId} groundTruth.answerSummary must be a string`,
        );
        assert.ok(
          Array.isArray(gt!.requiredTools) &&
            gt!.requiredTools.every((t) => typeof t === 'string'),
          `item ${item.externalId} groundTruth.requiredTools must be string tool ids`,
        );
      }
    });

    it(`${agentId} optional groundTruth fields use expected shapes when present`, () => {
      const ds = loadDataset(agentId);
      for (const item of ds.items ?? []) {
        const gt = item.groundTruth ?? {};
        if (gt.expectedStructure !== undefined) {
          assert.ok(
            Array.isArray(gt.expectedStructure) &&
              gt.expectedStructure.every((s) => typeof s === 'string'),
            `item ${item.externalId} expectedStructure must be string[]`,
          );
        }
        if (gt.notes !== undefined) {
          assert.equal(typeof gt.notes, 'string', `item ${item.externalId} notes must be a string`);
        }
      }
    });
  }

  it('dataset names are unique across agent starter versions', () => {
    const names = AGENTS.map((id) => loadDataset(id).name);
    assert.equal(new Set(names).size, names.length, `duplicate dataset names: ${names.join(', ')}`);
  });
});
