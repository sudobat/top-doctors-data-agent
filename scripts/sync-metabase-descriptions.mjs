#!/usr/bin/env node
/**
 * Sync table/field descriptions from published OpenMetadata assets into Metabase.
 *
 * Prerequisites:
 * - OpenMetadata running (profile semantic), with BigQuery tables ingested
 * - Metabase set up, with a database that contains silver_/gold_ tables
 * - Env: OPENMETADATA_*, METABASE_URL, METABASE_USERNAME, METABASE_PASSWORD
 *
 * Matching is by table name (case-insensitive) and column name.
 */

const omUrl = (process.env.OPENMETADATA_URL || 'http://localhost:8585').replace(/\/$/, '');
const omEmail = process.env.OPENMETADATA_EMAIL || 'admin@open-metadata.org';
const omPassword = process.env.OPENMETADATA_PASSWORD || 'admin';
const omJwt = process.env.OPENMETADATA_JWT_TOKEN;

const mbUrl = (process.env.METABASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const mbUser = process.env.METABASE_USERNAME || process.env.METABASE_EMAIL;
const mbPassword = process.env.METABASE_PASSWORD;

if (!mbUser || !mbPassword) {
  console.error('Set METABASE_USERNAME (or METABASE_EMAIL) and METABASE_PASSWORD.');
  process.exit(1);
}

async function omLogin() {
  if (omJwt) return omJwt;
  const password = Buffer.from(omPassword, 'utf8').toString('base64');
  const res = await fetch(`${omUrl}/api/v1/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: omEmail, password }),
  });
  if (!res.ok) throw new Error(`OM login failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  const token = body.accessToken || body.token;
  if (!token) throw new Error('OM login missing accessToken');
  return token;
}

async function omGet(token, path) {
  const res = await fetch(`${omUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`OM ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function mbLogin() {
  const res = await fetch(`${mbUrl}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: mbUser, password: mbPassword }),
  });
  if (!res.ok) throw new Error(`Metabase login failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  if (!body.id) throw new Error('Metabase login missing session id');
  return body.id;
}

async function mb(session, path, init = {}) {
  const res = await fetch(`${mbUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Metabase-Session': session,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Metabase ${path}: ${res.status} ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

function isCertified(name = '') {
  return name.startsWith('silver_') || name.startsWith('gold_');
}

async function loadOmTables(token) {
  const search = await omGet(
    token,
    '/api/v1/search/query?q=*&index=table_search_index&from=0&size=200',
  );
  const hits = (search.hits?.hits || search.hits || [])
    .map(h => h._source || h)
    .filter(t => t?.name && isCertified(t.name));

  const detailed = [];
  for (const hit of hits) {
    const fqn = encodeURIComponent(hit.fullyQualifiedName || hit.name);
    try {
      const table = await omGet(token, `/api/v1/tables/name/${fqn}?fields=columns`);
      if (isCertified(table.name)) detailed.push(table);
    } catch (err) {
      console.warn(`Skip OM table ${hit.name}: ${err.message}`);
    }
  }
  return detailed;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const omToken = await omLogin();
  const mbSession = await mbLogin();

  const omTables = await loadOmTables(omToken);
  console.log(`OpenMetadata certified tables: ${omTables.length}`);

  const omByName = new Map(omTables.map(t => [String(t.name).toLowerCase(), t]));

  const databases = await mb(mbSession, '/api/database');
  const dbList = databases.data || databases;
  let updatedTables = 0;
  let updatedFields = 0;

  for (const db of dbList) {
    const metadata = await mb(mbSession, `/api/database/${db.id}/metadata`);
    const tables = metadata.tables || [];
    for (const table of tables) {
      const om = omByName.get(String(table.name).toLowerCase());
      if (!om) continue;

      const tableDescription = om.description || '';
      if (tableDescription && tableDescription !== table.description) {
        console.log(`[table] ${table.name}: sync description`);
        if (!dryRun) {
          await mb(mbSession, `/api/table/${table.id}`, {
            method: 'PUT',
            body: JSON.stringify({ ...table, description: tableDescription }),
          });
        }
        updatedTables += 1;
      }

      const omCols = new Map((om.columns || []).map(c => [String(c.name).toLowerCase(), c]));
      for (const field of table.fields || []) {
        const col = omCols.get(String(field.name).toLowerCase());
        if (!col?.description || col.description === field.description) continue;
        console.log(`[field] ${table.name}.${field.name}: sync description`);
        if (!dryRun) {
          await mb(mbSession, `/api/field/${field.id}`, {
            method: 'PUT',
            body: JSON.stringify({ ...field, description: col.description }),
          });
        }
        updatedFields += 1;
      }
    }
  }

  console.log(
    dryRun
      ? `Dry run complete. Would update ${updatedTables} tables, ${updatedFields} fields.`
      : `Synced ${updatedTables} tables, ${updatedFields} fields.`,
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
