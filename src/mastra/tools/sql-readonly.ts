const BLOCKED_SQL =
  /\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|LOCK|VACUUM|REFRESH|COMMENT|REASSIGN|OWNER|RESET|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|DECLARE|EXECUTE|PREPARE|DEALLOCATE|LISTEN|NOTIFY|UNLISTEN|LOAD|DISCARD|REINDEX|CLUSTER|CHECKPOINT|SET)\b/i;

const ALLOWED_START = /^(SELECT|WITH|TABLE|VALUES|EXPLAIN)\b/i;

export function assertReadOnlySql(sql: string): string {
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new Error('SQL query must not be empty.');
  }

  const stripped = stripSqlLiteralsAndComments(trimmed);
  const withoutTrailingSemicolon = stripped.replace(/;\s*$/, '').trim();
  if (!withoutTrailingSemicolon) {
    throw new Error('SQL query must not be empty.');
  }
  if (withoutTrailingSemicolon.includes(';')) {
    throw new Error('Only a single SQL statement is allowed.');
  }

  if (BLOCKED_SQL.test(withoutTrailingSemicolon)) {
    throw new Error('Write or DDL SQL is not allowed.');
  }

  if (!ALLOWED_START.test(withoutTrailingSemicolon)) {
    throw new Error('Only read-only SQL is allowed (SELECT, WITH, TABLE, VALUES, or EXPLAIN).');
  }

  const explainPrefix = withoutTrailingSemicolon.match(/^EXPLAIN(?:\s+ANALYZE)?(?:\s+VERBOSE)?\s+/i);
  const statement = explainPrefix
    ? withoutTrailingSemicolon.slice(explainPrefix[0].length)
    : withoutTrailingSemicolon;

  if (!/^(SELECT|WITH|TABLE|VALUES)\b/i.test(statement)) {
    throw new Error('Only read-only SQL is allowed (SELECT, WITH, TABLE, VALUES, or EXPLAIN of those).');
  }

  return trimmed.replace(/;\s*$/, '').trim();
}

function stripSqlLiteralsAndComments(sql: string): string {
  let output = '';
  let i = 0;

  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (two === '--') {
      const newline = sql.indexOf('\n', i);
      i = newline === -1 ? sql.length : newline;
      continue;
    }

    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }

    const char = sql[i];
    if (char === "'" || char === '"') {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === char) {
          if (sql[i + 1] === char) {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      output += ' ';
      continue;
    }

    if (char === '$') {
      const tagMatch = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (tagMatch) {
        const tag = tagMatch[0];
        const end = sql.indexOf(tag, i + tag.length);
        i = end === -1 ? sql.length : end + tag.length;
        output += ' ';
        continue;
      }
    }

    output += char;
    i += 1;
  }

  return output;
}
