import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BigQuery } from "@google-cloud/bigquery";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const broken = process.argv.includes("--broken");

const TYPE_MAP = {
  uuid: "STRING",
  text: "STRING",
  "character varying": "STRING",
  integer: "INT64",
  bigint: "INT64",
  smallint: "INT64",
  boolean: "BOOL",
  numeric: "NUMERIC",
  real: "FLOAT64",
  "double precision": "FLOAT64",
  date: "DATE",
  "timestamp with time zone": "TIMESTAMP",
  "timestamp without time zone": "TIMESTAMP",
  jsonb: "JSON",
  json: "JSON",
};

const projectId = required("GCP_PROJECT_ID");
const keyFilename = required("GOOGLE_APPLICATION_CREDENTIALS");
const datasetId = process.env.BIGQUERY_DATASET || "clinic";
const location = process.env.BIGQUERY_LOCATION || "EU";
const databaseUrl = process.env.DATABASE_URL || "postgres://clinic:clinic@localhost:5434/clinic";

await run("docker", ["compose", "up", "-d", "--wait", "postgres"]);
await run(process.execPath, ["scripts/seed-db.mjs", ...(broken ? ["--broken"] : [])]);

const pool = new pg.Pool({ connectionString: databaseUrl });
const bigquery = new BigQuery({ projectId, keyFilename });

try {
  const tables = await readPostgresTables(pool);
  await ensureDataset(bigquery, datasetId, location);

  for (const table of tables) {
    await createTable(bigquery, table);
    await loadTable(bigquery, table);
  }

  await dropStaleTables(bigquery, new Set(tables.map((table) => table.name)));
  await verifyCounts(bigquery, tables);

  console.log(
    broken
      ? `Seeded BigQuery ${projectId}.${datasetId} (${location}) with pipeline-error scenarios.`
      : `Seeded BigQuery ${projectId}.${datasetId} (${location}) from the clinic Postgres warehouse.`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (message.includes("permission") || error?.code === 403) {
    console.error(
      "Grant roles/bigquery.dataEditor and roles/bigquery.jobUser to the service account on this project, then rerun npm run db:seed:bq.",
    );
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}

async function readPostgresTables(pool) {
  const { rows: columns } = await pool.query(`
    SELECT table_name, column_name, data_type, is_nullable, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const { rows: primaryKeys } = await pool.query(`
    SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position
  `);

  const byTable = new Map();
  for (const column of columns) {
    const bqType = TYPE_MAP[column.data_type];
    if (!bqType) {
      throw new Error(`Unsupported Postgres type "${column.data_type}" on ${column.table_name}.${column.column_name}.`);
    }
    const table = byTable.get(column.table_name) ?? { name: column.table_name, columns: [], primaryKey: [] };
    table.columns.push({
      name: column.column_name,
      pgType: column.data_type,
      bqType,
      required: column.is_nullable === "NO",
    });
    byTable.set(column.table_name, table);
  }

  for (const key of primaryKeys) {
    byTable.get(key.table_name)?.primaryKey.push(key.column_name);
  }

  const tables = [...byTable.values()];
  for (const table of tables) {
    const { rows } = await pool.query(`SELECT * FROM ${quotePgIdent(table.name)}`);
    table.rows = rows;
  }
  return tables;
}

async function ensureDataset(bigquery, datasetId, location) {
  const dataset = bigquery.dataset(datasetId);
  const [exists] = await dataset.exists();
  if (!exists) {
    await bigquery.createDataset(datasetId, { location });
    return;
  }

  const [metadata] = await dataset.getMetadata();
  if (metadata.location !== location) {
    throw new Error(
      `Dataset ${datasetId} is in ${metadata.location}, but BIGQUERY_LOCATION is ${location}.`,
    );
  }
}

async function createTable(bigquery, table) {
  const columns = table.columns
    .map((column) => `${quoteIdent(column.name)} ${column.bqType}${column.required ? " NOT NULL" : ""}`)
    .join(",\n  ");
  const primaryKey =
    table.primaryKey.length > 0
      ? `,\n  PRIMARY KEY (${table.primaryKey.map(quoteIdent).join(", ")}) NOT ENFORCED`
      : "";
  const ddl = `CREATE OR REPLACE TABLE ${tableRef(table.name)} (\n  ${columns}${primaryKey}\n)`;
  await bigquery.query({ query: ddl, location });
}

async function loadTable(bigquery, table) {
  if (table.rows.length === 0) {
    console.log(`${table.name}: 0 rows`);
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "clinic-bq-"));
  const file = join(dir, `${table.name}.ndjson`);
  try {
    const lines = table.rows.map((row) => JSON.stringify(toBqRow(row, table.columns)));
    writeFileSync(file, `${lines.join("\n")}\n`);
    const [job] = await bigquery.dataset(datasetId).table(table.name).load(file, {
      sourceFormat: "NEWLINE_DELIMITED_JSON",
      writeDisposition: "WRITE_TRUNCATE",
      location,
      schema: {
        fields: table.columns.map((column) => ({
          name: column.name,
          type: column.bqType,
          mode: column.required ? "REQUIRED" : "NULLABLE",
        })),
      },
    });
    const outputRows = job.statistics?.load?.outputRows ?? String(table.rows.length);
    console.log(`${table.name}: ${outputRows} rows`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function dropStaleTables(bigquery, keep) {
  const [existing] = await bigquery.dataset(datasetId).getTables();
  for (const table of existing) {
    if (!table.id || keep.has(table.id)) continue;
    await bigquery.query({ query: `DROP TABLE IF EXISTS ${tableRef(table.id)}`, location });
    console.log(`dropped stale table ${table.id}`);
  }
}

async function verifyCounts(bigquery, tables) {
  const mismatches = [];
  for (const table of tables) {
    const [rows] = await bigquery.query({
      query: `SELECT COUNT(*) AS n FROM ${tableRef(table.name)}`,
      location,
    });
    const count = Number(rows[0]?.n ?? 0);
    if (count !== table.rows.length) {
      mismatches.push(`${table.name}: postgres ${table.rows.length}, bigquery ${count}`);
    }
  }
  if (mismatches.length > 0) {
    throw new Error(`Row counts do not match:\n${mismatches.join("\n")}`);
  }
}

function toBqRow(row, columns) {
  const out = {};
  for (const column of columns) {
    out[column.name] = toBqValue(row[column.name], column.bqType);
  }
  return out;
}

function toBqValue(value, bqType) {
  if (value == null) return null;
  if (bqType === "TIMESTAMP") {
    const date = value instanceof Date ? value : new Date(value);
    return date.toISOString();
  }
  if (bqType === "DATE") {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }
  if (bqType === "JSON") {
    return typeof value === "string" ? JSON.parse(value) : value;
  }
  if (bqType === "INT64") return Number(value);
  if (bqType === "NUMERIC") return String(value);
  if (bqType === "BOOL") return Boolean(value);
  return value;
}

function tableRef(tableName) {
  return `${quoteIdent(projectId)}.${quoteIdent(datasetId)}.${quoteIdent(tableName)}`;
}

function quoteIdent(identifier) {
  assertIdent(identifier);
  return `\`${identifier}\``;
}

function quotePgIdent(identifier) {
  assertIdent(identifier);
  return `"${identifier}"`;
}

function assertIdent(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(identifier)) {
    throw new Error(`Refusing to quote identifier "${identifier}".`);
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set.`);
  }
  return value;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}
