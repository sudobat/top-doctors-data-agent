import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const AGENTS = ['data-engineer-agent', 'outlier-analysis-agent'] as const;
const IN_SCOPE = new Set(AGENTS);

type VariantConfig = {
  id?: string;
  agentId?: string;
  model?: string;
  instructions?: string;
  tools?: string[];
  scorers?: string[];
};

/** Minimal YAML/JSON loader for variant fixtures under evals/variants. */
function parseVariantFile(raw: string): VariantConfig {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as VariantConfig;
  }
  const result: VariantConfig = {};
  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim() || line.trim().startsWith('#')) {
      i += 1;
      continue;
    }
    const m = /^([A-Za-z_][\w]*)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      i += 1;
      continue;
    }
    const key = m[1]!;
    const rest = m[2]!;
    if (rest === '|' || rest === '>') {
      const block: string[] = [];
      i += 1;
      while (i < lines.length && (/^ {2}/.test(lines[i]!) || lines[i]!.trim() === '')) {
        block.push(lines[i]!.replace(/^ {2}/, ''));
        i += 1;
      }
      (result as Record<string, unknown>)[key] = block.join('\n').trimEnd();
      continue;
    }
    if (rest === '' || rest === '[]') {
      if (key === 'tools' || key === 'scorers') {
        const arr: string[] = [];
        i += 1;
        while (i < lines.length && /^\s*-\s+/.test(lines[i]!)) {
          arr.push(lines[i]!.replace(/^\s*-\s+/, '').trim());
          i += 1;
        }
        (result as Record<string, unknown>)[key] = arr;
        continue;
      }
    }
    const value = rest.replace(/^["']|["']$/g, '');
    if (key === 'tools' || key === 'scorers') {
      // handled above; scalar unexpected
    }
    (result as Record<string, unknown>)[key] = value;
    i += 1;
  }
  return result;
}

function listVariantFiles(agentId: string): string[] {
  const dir = join(root, 'evals/variants', agentId);
  assert.equal(existsSync(dir), true, `missing variants dir ${dir}`);
  return readdirSync(dir).filter((f) => /\.(ya?ml|json)$/i.test(f));
}

function loadVariant(agentId: string, file: string): VariantConfig {
  const path = join(root, 'evals/variants', agentId, file);
  return parseVariantFile(readFileSync(path, 'utf8'));
}

describe('agent evals — variant config schema', () => {
  for (const agentId of AGENTS) {
    it(`lists YAML/JSON variant configs under evals/variants/${agentId}/`, () => {
      const files = listVariantFiles(agentId);
      assert.ok(files.length > 0, `expected at least one variant under ${agentId}`);
      assert.ok(
        files.some((f) => /\.ya?ml$/i.test(f)),
        'expected YAML variants (JSON also accepted)',
      );
    });

    it(`${agentId} variants require id and in-scope agentId`, () => {
      for (const file of listVariantFiles(agentId)) {
        const v = loadVariant(agentId, file);
        assert.equal(typeof v.id, 'string', `${file} missing id`);
        assert.ok(v.id && v.id.length > 0, `${file} id must be non-empty`);
        assert.equal(typeof v.agentId, 'string', `${file} missing agentId`);
        assert.ok(IN_SCOPE.has(v.agentId as (typeof AGENTS)[number]), `${file} agentId out of scope`);
        assert.equal(v.agentId, agentId, `${file} agentId must match parent folder`);
      }
    });

    it(`${agentId} optional override fields use expected types when present`, () => {
      for (const file of listVariantFiles(agentId)) {
        const v = loadVariant(agentId, file);
        if (v.model !== undefined) assert.equal(typeof v.model, 'string');
        if (v.instructions !== undefined) assert.equal(typeof v.instructions, 'string');
        if (v.tools !== undefined) {
          assert.ok(Array.isArray(v.tools) && v.tools.every((t) => typeof t === 'string'));
        }
        if (v.scorers !== undefined) {
          assert.ok(Array.isArray(v.scorers) && v.scorers.every((s) => typeof s === 'string'));
        }
      }
    });

    it(`${agentId} has a baseline variant with no model/instructions/tools overrides`, () => {
      const files = listVariantFiles(agentId);
      const baselineFile = files.find((f) => /^baseline\.(ya?ml|json)$/i.test(f));
      assert.ok(baselineFile, `missing baseline.yaml (or .json) for ${agentId}`);
      const v = loadVariant(agentId, baselineFile!);
      assert.equal(v.id, 'baseline');
      assert.equal(v.model, undefined, 'baseline must not override model');
      assert.equal(v.instructions, undefined, 'baseline must not override instructions');
      assert.equal(v.tools, undefined, 'baseline must not override tools');
      // scorers may still be listed
      if (v.scorers !== undefined) {
        assert.ok(Array.isArray(v.scorers));
      }
    });
  }
});
