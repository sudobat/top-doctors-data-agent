import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mastra } from '../../src/mastra/index.js';

const REQUIRED_SCORERS = [
  'required-tools',
  'answer-structure',
  'answer-similarity-judge',
] as const;

describe('agent evals — scorers registration', () => {
  it('registers all harness scorers on the Mastra instance', () => {
    const registered = mastra.listScorers?.() ?? (mastra as { scorers?: Record<string, unknown> }).scorers;
    assert.ok(registered, 'Mastra instance must expose a scorers registry');

    const ids = Array.isArray(registered)
      ? registered.map((s: { id?: string } | string) => (typeof s === 'string' ? s : s.id))
      : Object.keys(registered as Record<string, unknown>);

    for (const id of REQUIRED_SCORERS) {
      assert.ok(ids.includes(id), `missing scorer ${id}; have [${ids.join(', ')}]`);
    }
  });

  it('answer-similarity-judge is registered and selectable for experiments', () => {
    const registered = mastra.listScorers?.() ?? (mastra as { scorers?: Record<string, unknown> }).scorers;
    const ids = Array.isArray(registered)
      ? registered.map((s: { id?: string } | string) => (typeof s === 'string' ? s : s.id))
      : Object.keys(registered as Record<string, unknown>);
    assert.ok(ids.includes('answer-similarity-judge'));
  });
});
