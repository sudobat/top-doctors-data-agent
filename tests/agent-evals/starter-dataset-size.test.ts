import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

type DatasetItem = {
  externalId?: string;
  input?: string;
  groundTruth?: {
    requiredTools?: string[];
    expectedStructure?: string[];
  };
};

type DatasetFile = {
  items?: DatasetItem[];
};

function loadDataset(agentId: string): DatasetFile {
  const path = join(root, 'evals/datasets', agentId, 'v1.json');
  assert.equal(existsSync(path), true, `missing dataset ${path}`);
  return JSON.parse(readFileSync(path, 'utf8')) as DatasetFile;
}

const OM_TOOLS = new Set([
  'om_search_glossary',
  'om_get_glossary_term',
  'om_search_metrics',
  'om_get_metric',
  'om_list_certified_assets',
  'om_describe_certified_table',
]);

const OUTLIER_SECTIONS = ['scope', 'outliers found', 'root causes', 'confidence & caveats'];

describe('agent evals — starter dataset size and emphasis', () => {
  for (const agentId of ['data-engineer-agent', 'outlier-analysis-agent'] as const) {
    it(`${agentId} starter dataset contains 5–10 items`, () => {
      const items = loadDataset(agentId).items ?? [];
      assert.ok(
        items.length >= 5 && items.length <= 10,
        `expected 5–10 items, got ${items.length}`,
      );
    });
  }

  it('data-engineer business/metric cases require OpenMetadata tools', () => {
    const items = loadDataset('data-engineer-agent').items ?? [];
    assert.ok(items.length > 0, 'starter dataset must exist');

    const businessLike = items.filter((item) => {
      const text = String(item.input ?? '').toLowerCase();
      return /metric|glossary|revenue|specialty|mean|define|definition/.test(text);
    });
    assert.ok(
      businessLike.length > 0,
      'expected at least one business/metric prompt in data-engineer starter set',
    );

    for (const item of businessLike) {
      const tools = item.groundTruth?.requiredTools ?? [];
      const usesOm = tools.some((t) => OM_TOOLS.has(t));
      assert.ok(
        usesOm,
        `business/metric case ${item.externalId} must require an OpenMetadata tool; got [${tools.join(', ')}]`,
      );
    }
  });

  it('outlier starter cases expect the four-section answer structure', () => {
    const items = loadDataset('outlier-analysis-agent').items ?? [];
    assert.ok(items.length > 0, 'starter dataset must exist');

    for (const item of items) {
      const structure = (item.groundTruth?.expectedStructure ?? []).map((s) =>
        s.toLowerCase(),
      );
      for (const section of OUTLIER_SECTIONS) {
        assert.ok(
          structure.some((s) => s.includes(section) || section.includes(s)),
          `item ${item.externalId} expectedStructure must include "${section}"; got [${structure.join(', ')}]`,
        );
      }
    }
  });
});
