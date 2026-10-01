import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const IN_SCOPE = ['data-engineer-agent', 'outlier-analysis-agent'] as const;
const OUT_OF_SCOPE = 'agent';

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

function listDirNames(rel: string): string[] {
  const abs = join(root, rel);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

describe('agent evals — in-scope agents only', () => {
  it('datasets exist only for data-engineer-agent and outlier-analysis-agent', () => {
    const agents = listDirNames('evals/datasets');
    assert.deepEqual(
      [...agents].sort(),
      [...IN_SCOPE].sort(),
      'eval datasets must cover exactly the two in-scope agents',
    );
    assert.ok(!agents.includes(OUT_OF_SCOPE), 'general agent must not have eval datasets');
  });

  it('variants exist only for data-engineer-agent and outlier-analysis-agent', () => {
    const agents = listDirNames('evals/variants');
    assert.deepEqual(
      [...agents].sort(),
      [...IN_SCOPE].sort(),
      'eval variants must cover exactly the two in-scope agents',
    );
    assert.ok(!agents.includes(OUT_OF_SCOPE), 'general agent must not have eval variants');
  });

  it('eval npm scripts do not target the general agent', () => {
    const evalScripts = Object.entries(pkg.scripts).filter(([name]) => name.startsWith('eval:'));
    assert.ok(evalScripts.length > 0, 'expected eval:* npm scripts to exist');
    for (const [name, cmd] of evalScripts) {
      assert.doesNotMatch(
        cmd,
        /(?:^|[\s"'=/])agent(?:[\s"']|$)/,
        `${name} must not target the general agent id`,
      );
      assert.doesNotMatch(name, /^eval:run:agent$/, 'no convenience script for general agent');
    }
  });
});
