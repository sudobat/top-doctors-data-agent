import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertReadOnlySql } from '../../src/mastra/tools/sql-readonly.js';

describe('assertReadOnlySql', () => {
  it('allows SELECT / WITH / TABLE / VALUES / EXPLAIN', () => {
    assert.equal(assertReadOnlySql('SELECT 1'), 'SELECT 1');
    assert.equal(assertReadOnlySql('WITH x AS (SELECT 1) SELECT * FROM x'), 'WITH x AS (SELECT 1) SELECT * FROM x');
    assert.equal(assertReadOnlySql('TABLE silver_doctors'), 'TABLE silver_doctors');
    assert.equal(assertReadOnlySql('VALUES (1), (2)'), 'VALUES (1), (2)');
    assert.equal(assertReadOnlySql('EXPLAIN SELECT 1'), 'EXPLAIN SELECT 1');
    assert.equal(assertReadOnlySql('EXPLAIN ANALYZE SELECT 1'), 'EXPLAIN ANALYZE SELECT 1');
    assert.equal(assertReadOnlySql('EXPLAIN VERBOSE SELECT 1'), 'EXPLAIN VERBOSE SELECT 1');
  });

  it('strips a trailing semicolon', () => {
    assert.equal(assertReadOnlySql('SELECT 1;'), 'SELECT 1');
  });

  it('rejects empty SQL', () => {
    assert.throws(() => assertReadOnlySql('   '), /SQL query must not be empty/);
  });

  it('rejects multiple statements', () => {
    assert.throws(() => assertReadOnlySql('SELECT 1; SELECT 2'), /Only a single SQL statement is allowed/);
  });

  it('rejects write and DDL keywords', () => {
    assert.throws(() => assertReadOnlySql('DELETE FROM silver_doctors'), /Write or DDL SQL is not allowed/);
    assert.throws(() => assertReadOnlySql('SELECT 1; DROP TABLE t'), /Only a single SQL statement is allowed/);
    assert.throws(() => assertReadOnlySql('WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x'), /Write or DDL SQL is not allowed/);
    assert.throws(() => assertReadOnlySql('SELECT 1; SET search_path = public'), /Only a single SQL statement/);
  });

  it('does not treat keywords inside literals or comments as writes', () => {
    assert.equal(
      assertReadOnlySql("SELECT 'DELETE FROM nowhere' AS note"),
      "SELECT 'DELETE FROM nowhere' AS note",
    );
    assert.equal(
      assertReadOnlySql('SELECT 1 -- DROP TABLE evil'),
      'SELECT 1 -- DROP TABLE evil',
    );
    assert.equal(
      assertReadOnlySql('SELECT 1 /* INSERT INTO t */'),
      'SELECT 1 /* INSERT INTO t */',
    );
  });
});
