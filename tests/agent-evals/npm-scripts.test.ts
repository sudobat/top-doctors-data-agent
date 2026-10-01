import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

const REQUIRED = [
  'eval:load',
  'eval:run',
  'eval:run:data-engineer',
  'eval:run:outlier-analysis',
] as const;

describe('agent evals — npm scripts', () => {
  it('defines eval:load, eval:run, and per-agent convenience scripts', () => {
    for (const name of REQUIRED) {
      assert.ok(pkg.scripts[name], `missing package.json script ${name}`);
    }
  });

  it('invokes eval scripts with --env-file=.env and the expected entrypoints', () => {
    assert.match(pkg.scripts['eval:load']!, /--env-file=\.env/);
    assert.match(pkg.scripts['eval:load']!, /eval-load-datasets\.mjs/);

    assert.match(pkg.scripts['eval:run']!, /--env-file=\.env/);
    assert.match(pkg.scripts['eval:run']!, /eval-run-experiment\.mjs/);

    assert.match(pkg.scripts['eval:run:data-engineer']!, /--env-file=\.env/);
    assert.match(pkg.scripts['eval:run:data-engineer']!, /eval-run-experiment\.mjs|eval:run/);
    assert.match(pkg.scripts['eval:run:data-engineer']!, /data-engineer-agent/);

    assert.match(pkg.scripts['eval:run:outlier-analysis']!, /--env-file=\.env/);
    assert.match(pkg.scripts['eval:run:outlier-analysis']!, /eval-run-experiment\.mjs|eval:run/);
    assert.match(pkg.scripts['eval:run:outlier-analysis']!, /outlier-analysis-agent/);

    assert.equal(existsSync(join(root, 'scripts/eval-load-datasets.mjs')), true);
    assert.equal(existsSync(join(root, 'scripts/eval-run-experiment.mjs')), true);
  });

  it('does not define CI gating / score-threshold scripts (out of scope)', () => {
    const evalNames = Object.keys(pkg.scripts).filter((n) => n.startsWith('eval:'));
    assert.ok(
      evalNames.length > 0,
      'eval:* scripts must exist before asserting CI gating is out of scope',
    );
    for (const name of evalNames) {
      assert.doesNotMatch(
        name,
        /eval:(gate|ci|threshold|pass-fail)/i,
        `CI gating script ${name} is out of scope`,
      );
      assert.doesNotMatch(pkg.scripts[name]!, /score.?threshold|pass.?fail.?gate|minScore/i);
    }
  });
});
