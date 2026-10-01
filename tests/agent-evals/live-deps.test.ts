import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readRunner(): string {
  const path = join(root, 'scripts/eval-run-experiment.mjs');
  assert.equal(existsSync(path), true, `missing ${path}`);
  return readFileSync(path, 'utf8');
}

function readLoader(): string {
  const path = join(root, 'scripts/eval-load-datasets.mjs');
  assert.equal(existsSync(path), true, `missing ${path}`);
  return readFileSync(path, 'utf8');
}

describe('agent evals — live dependencies', () => {
  it('runs tool calls live with unmockedToolPolicy allow (mocked playback out of scope)', () => {
    const runner = readRunner();
    assert.match(runner, /unmockedToolPolicy\s*:\s*['"]allow['"]/);
    assert.doesNotMatch(
      runner,
      /recordedTool|playbackMode|mockTools\s*:\s*true/,
      'mocked/recorded tool mode is out of scope',
    );
  });

  it('documents expectation of seeded BigQuery clinic dataset', () => {
    const sources = [readRunner(), readLoader()].join('\n');
    assert.match(
      sources,
      /db:seed:bq|seed-bigquery|BigQuery|BQ_/i,
      'eval scripts must expect seeded BigQuery',
    );
  });

  it('documents OpenMetadata reachability for data-engineer-agent evals', () => {
    const runner = readRunner();
    assert.match(
      runner,
      /OpenMetadata|OM_|semantic|openmetadata/i,
      'data-engineer evals must expect OpenMetadata when OM tools are required',
    );
  });

  it('fails fast or fails items on missing live deps — never silently skips', () => {
    const runner = readRunner();
    assert.match(
      runner,
      /fail|throw|Error|missing.*(BigQuery|OpenMetadata|BQ|OM)/i,
      'missing live deps must produce a clear failure path',
    );
    assert.doesNotMatch(
      runner,
      /silentlySkip|skipIfMissingDeps\s*=\s*true|continue\s*;\s*\/\/\s*skip/,
      'must not silently skip items when live deps are missing',
    );
  });
});
