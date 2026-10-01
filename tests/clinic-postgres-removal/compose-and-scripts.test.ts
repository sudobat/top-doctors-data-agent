import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('clinic Postgres removal — compose and npm scripts', () => {
  it('does not define a clinic warehouse postgres service in docker-compose.yml', () => {
    const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8');
    assert.doesNotMatch(
      compose,
      /^\s{2}postgres:\s*$/m,
      'clinic warehouse postgres service must be removed from docker-compose.yml',
    );
  });

  it('removes db:up, db:seed, and db:seed:broken from package.json', () => {
    assert.equal(pkg.scripts['db:up'], undefined, 'db:up must be removed');
    assert.equal(pkg.scripts['db:seed'], undefined, 'db:seed must be removed');
    assert.equal(pkg.scripts['db:seed:broken'], undefined, 'db:seed:broken must be removed');
  });

  it('keeps db:down without referencing clinic postgres', () => {
    const script = pkg.scripts['db:down'];
    assert.ok(script, 'db:down should remain for compose teardown');
    assert.doesNotMatch(script, /\bpostgres\b/, 'db:down must not target clinic postgres');
  });
});
