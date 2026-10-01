/**
 * BigQuery-native medallion seeder for the Top Doctors clinic domain.
 * Synthetic rows are generated inside BigQuery via GENERATE_ARRAY / CTAS.
 * Volumes scale with SEED_SCALE (default 1.0). No Postgres mirror.
 */
import { pathToFileURL } from "node:url";
import { BigQuery } from "@google-cloud/bigquery";

export const REFERENCE_ENTITIES = ["countries", "specialties"];
export const CORE_ENTITIES = ["doctors", "clinics", "patients", "appointments", "invoices"];
export const COUNTRY_CODES = ["ES", "IT", "GB", "IE", "AR", "CO", "CL", "MX"];
export const RELATIONSHIP_RULES = {
  appointmentsLink: ["doctors", "clinics", "patients", "countries", "specialties"],
  invoicesPerAppointment: true,
  patientsDerivedFromAppointments: true,
};

export const MEDALLION_LAYER_PREFIXES = ["ops_", "raw_", "copper_", "bronze_", "silver_", "gold_"];
export const TABLE_NAMING = {
  rawAndCopper: { fullHistory: true },
  bronze: { versionsPerKey: 2 },
  silver: { currentState: true },
  gold: { analyticsMarts: true, legacyVisitMarts: false },
  ops: { pipelineMetadata: true },
};

export const defaultSeedScale = 1.0;

const SILVER_RANGE_TOLERANCE = 0.05;
const DOCTOR_SCALED_RANGE_TOLERANCE = 0.1;
const HISTORY_RANGE_TOLERANCE = 0.05;

const SILVER_BASE = {
  doctors: 200_000,
  clinics: 900,
  appointments: 12_000_000,
  specialties: 80,
  patients: 4_000_000,
  countries: 8,
};

const HISTORY_BASE = {
  doctors: 44_000_000,
  clinics: 200_000,
  appointments: 12_000_000,
  patients: 4_200_000,
  invoices: 12_000_000,
  specialties: 80,
};

const MUTABLE_ENTITIES = ["doctors", "clinics", "patients", "appointments", "invoices", "specialties", "countries"];

const GOLD_TABLES = [
  "gold_doctor_workload",
  "gold_appointments_mart",
  "gold_revenue_by_specialty",
  "gold_revenue_by_country",
];

const OPS_TABLES = ["ops_pipeline_runs", "ops_transform_batches", "ops_seed_manifest"];

const BROKEN_SCENARIOS = [
  "Cardiology specialty duplicate appointments for outlier / RCA exercises",
  "Neurology appointment volume gap for data-quality pipeline-error scenarios",
  "Invoice amount outliers injected on a small AR country cohort",
];

export function describeBrokenScenarios() {
  return [...BROKEN_SCENARIOS];
}

export function listSeededTableIds() {
  return seededTableIdsForMode(false);
}

export function seededTableIdsForMode(_broken) {
  const ids = [...OPS_TABLES];
  for (const entity of MUTABLE_ENTITIES) {
    ids.push(`raw_${entity}`, `copper_${entity}`, `bronze_${entity}`, `silver_${entity}`);
  }
  ids.push(...GOLD_TABLES);
  return ids;
}

export function getExpectedSilverRange(entity, scale) {
  if (entity === "invoices") {
    return getExpectedSilverRange("appointments", scale);
  }
  const base = SILVER_BASE[entity];
  if (base == null) {
    throw new Error(`Unknown silver entity "${entity}"`);
  }
  if (entity === "countries") {
    return { min: 8, max: 8 };
  }
  const expected = base * scale;
  const tolerance =
    entity === "doctors" && Math.abs(scale - defaultSeedScale) > 1e-12
      ? DOCTOR_SCALED_RANGE_TOLERANCE
      : SILVER_RANGE_TOLERANCE;
  return {
    min: Math.floor(expected * (1 - tolerance)),
    max: Math.ceil(expected * (1 + tolerance)),
  };
}

export function getExpectedHistoryRange(entity, scale) {
  const base = HISTORY_BASE[entity];
  if (base == null) {
    throw new Error(`Unknown history entity "${entity}"`);
  }
  const expected = base * scale;
  const tolerance = HISTORY_RANGE_TOLERANCE;
  return {
    min: Math.floor(expected * (1 - tolerance)),
    max: Math.ceil(expected * (1 + tolerance)),
  };
}

export function verifyPostSeedCounts(counts, scale) {
  const mismatches = [];
  for (const [table, count] of Object.entries(counts)) {
    const silverMatch = /^silver_(.+)$/.exec(table);
    if (silverMatch) {
      const range = getExpectedSilverRange(silverMatch[1], scale);
      if (count < range.min || count > range.max) {
        mismatches.push(
          `${table}: row count ${count} is outside expected range [${range.min}, ${range.max}]`,
        );
      }
      continue;
    }
    const historyMatch = /^(?:raw|copper)_(.+)$/.exec(table);
    if (historyMatch && HISTORY_BASE[historyMatch[1]] != null) {
      const range = getExpectedHistoryRange(historyMatch[1], scale);
      if (count < range.min || count > range.max) {
        mismatches.push(
          `${table}: row count ${count} is outside expected range [${range.min}, ${range.max}]`,
        );
      }
    }
  }
  if (mismatches.length > 0) {
    throw new Error(`Post-seed row counts do not match expected ranges:\n${mismatches.join("\n")}`);
  }
}

export async function ensureClinicDataset({ bigquery, datasetId, location }) {
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

function parseSeedScale() {
  const raw = process.env.SEED_SCALE;
  if (raw == null || raw === "") return defaultSeedScale;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`SEED_SCALE must be a positive number, got "${raw}"`);
  }
  return value;
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set.`);
  }
  return value;
}

function assertIdent(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(identifier)) {
    throw new Error(`Refusing to quote identifier "${identifier}".`);
  }
}

function quoteIdent(identifier) {
  assertIdent(identifier);
  return `\`${identifier}\``;
}

function tableRef(projectId, datasetId, tableName) {
  return `${quoteIdent(projectId)}.${quoteIdent(datasetId)}.${quoteIdent(tableName)}`;
}

function scaledCount(base, scale) {
  return Math.max(1, Math.round(base * scale));
}

/** BigQuery rejects GENERATE_ARRAY with more than ~1M elements; chunk via cross-join. */
const GENERATE_ARRAY_CHUNK = 1_000_000;

/**
 * SQL subquery producing INT64 column `i` from 1..n (inclusive).
 */
function generateIdsSql(n) {
  const count = Math.max(0, Math.floor(Number(n)));
  if (count <= 0) {
    return `SELECT CAST(NULL AS INT64) AS i FROM (SELECT 1) WHERE FALSE`;
  }
  if (count <= GENERATE_ARRAY_CHUNK) {
    return `SELECT i FROM UNNEST(GENERATE_ARRAY(1, ${count})) AS i`;
  }
  const chunks = Math.ceil(count / GENERATE_ARRAY_CHUNK);
  return `
    SELECT CAST((chunk - 1) * ${GENERATE_ARRAY_CHUNK} + offset AS INT64) AS i
    FROM UNNEST(GENERATE_ARRAY(1, ${chunks})) AS chunk
    CROSS JOIN UNNEST(GENERATE_ARRAY(1, ${GENERATE_ARRAY_CHUNK})) AS offset
    WHERE (chunk - 1) * ${GENERATE_ARRAY_CHUNK} + offset <= ${count}
  `;
}

/**
 * Build CREATE OR REPLACE TABLE ... AS SELECT using GENERATE_ARRAY for volume tables.
 */
function ctasGenerateArray(projectId, datasetId, tableName, columnsSql, n, primaryKeyCols = [], scale = defaultSeedScale) {
  const pk =
    primaryKeyCols.length > 0
      ? `,\n  PRIMARY KEY (${primaryKeyCols.map(quoteIdent).join(", ")}) NOT ENFORCED`
      : "";
  // BigQuery CTAS with table options for PK: use CREATE OR REPLACE TABLE with schema + AS
  // Pattern: CREATE OR REPLACE TABLE t (cols..., PRIMARY KEY (...) NOT ENFORCED) AS SELECT ...
  return `
CREATE OR REPLACE TABLE ${tableRef(projectId, datasetId, tableName)} (
  ${columnsSql}${pk}
)
AS
SELECT * FROM (
  ${buildSelectFromGenerateArray(tableName, n, scale)}
)
`.trim();
}

function buildSelectFromGenerateArray(tableName, n, scale = defaultSeedScale) {
  const entity = tableName.replace(/^(raw_|copper_|bronze_|silver_)/, "");
  const specialtyMod = silverN("specialties", scale);
  const doctorMod = silverN("doctors", scale);
  const clinicMod = silverN("clinics", scale);
  const patientMod = silverN("patients", scale);
  const ids = generateIdsSql(n);
  switch (entity) {
    case "countries":
      return `
      SELECT code AS country_code, name AS country_name, 1 AS _version
      FROM UNNEST([
        STRUCT('ES' AS code, 'Spain' AS name),
        STRUCT('IT', 'Italy'),
        STRUCT('GB', 'United Kingdom'),
        STRUCT('IE', 'Ireland'),
        STRUCT('AR', 'Argentina'),
        STRUCT('CO', 'Colombia'),
        STRUCT('CL', 'Chile'),
        STRUCT('MX', 'Mexico')
      ])
      `;
    case "specialties":
      return `
      SELECT
        i AS specialty_id,
        CONCAT('Specialty_', CAST(i AS STRING)) AS specialty_name,
        1 AS _version
      FROM (${ids}) AS gen
      `;
    case "doctors":
      return `
      SELECT
        i AS doctor_id,
        CONCAT('Doctor_', CAST(i AS STRING)) AS full_name,
        MOD(i, 8) + 1 AS country_ord,
        MOD(i, ${specialtyMod}) + 1 AS specialty_id,
        1 AS _version
      FROM (${ids}) AS gen
      `;
    case "clinics":
      return `
      SELECT
        i AS clinic_id,
        CONCAT('Clinic_', CAST(i AS STRING)) AS clinic_name,
        MOD(i, 8) + 1 AS country_ord,
        1 AS _version
      FROM (${ids}) AS gen
      `;
    case "patients":
      return `
      SELECT
        i AS patient_id,
        CONCAT('Patient_', CAST(i AS STRING)) AS full_name,
        MOD(i, 8) + 1 AS country_ord,
        1 AS _version
      FROM (${ids}) AS gen
      `;
    case "appointments":
      return `
      SELECT
        i AS appointment_id,
        MOD(i, ${doctorMod}) + 1 AS doctor_id,
        MOD(i, ${clinicMod}) + 1 AS clinic_id,
        MOD(i, ${patientMod}) + 1 AS patient_id,
        MOD(i, 8) + 1 AS country_ord,
        MOD(i, ${specialtyMod}) + 1 AS specialty_id,
        TIMESTAMP_ADD(TIMESTAMP '2024-01-01', INTERVAL i SECOND) AS scheduled_at,
        1 AS _version
      FROM (${ids}) AS gen
      `;
    case "invoices":
      return `
      SELECT
        i AS invoice_id,
        i AS appointment_id,
        CAST(ROUND(50 + MOD(i, 450), 2) AS NUMERIC) AS amount,
        IF(MOD(i, 10) = 0, 'outstanding', 'paid') AS status,
        1 AS _version
      FROM (${ids}) AS gen
      `;
    default:
      return `
      SELECT i AS id, 1 AS _version
      FROM (${ids}) AS gen
      `;
  }
}

function columnDefsFor(tableName) {
  const entity = tableName.replace(/^(raw_|copper_|bronze_|silver_)/, "");
  switch (entity) {
    case "countries":
      return `country_code STRING NOT NULL,\n  country_name STRING NOT NULL,\n  _version INT64 NOT NULL`;
    case "specialties":
      return `specialty_id INT64 NOT NULL,\n  specialty_name STRING NOT NULL,\n  _version INT64 NOT NULL`;
    case "doctors":
      return `doctor_id INT64 NOT NULL,\n  full_name STRING NOT NULL,\n  country_ord INT64 NOT NULL,\n  specialty_id INT64 NOT NULL,\n  _version INT64 NOT NULL`;
    case "clinics":
      return `clinic_id INT64 NOT NULL,\n  clinic_name STRING NOT NULL,\n  country_ord INT64 NOT NULL,\n  _version INT64 NOT NULL`;
    case "patients":
      return `patient_id INT64 NOT NULL,\n  full_name STRING NOT NULL,\n  country_ord INT64 NOT NULL,\n  _version INT64 NOT NULL`;
    case "appointments":
      return `appointment_id INT64 NOT NULL,\n  doctor_id INT64 NOT NULL,\n  clinic_id INT64 NOT NULL,\n  patient_id INT64 NOT NULL,\n  country_ord INT64 NOT NULL,\n  specialty_id INT64 NOT NULL,\n  scheduled_at TIMESTAMP NOT NULL,\n  _version INT64 NOT NULL`;
    case "invoices":
      return `invoice_id INT64 NOT NULL,\n  appointment_id INT64 NOT NULL,\n  amount NUMERIC NOT NULL,\n  status STRING NOT NULL,\n  _version INT64 NOT NULL`;
    default:
      return `id INT64 NOT NULL,\n  _version INT64 NOT NULL`;
  }
}

function primaryKeyFor(tableName) {
  const entity = tableName.replace(/^(raw_|copper_|bronze_|silver_)/, "");
  const map = {
    countries: ["country_code"],
    specialties: ["specialty_id"],
    doctors: ["doctor_id"],
    clinics: ["clinic_id"],
    patients: ["patient_id"],
    appointments: ["appointment_id"],
    invoices: ["invoice_id"],
  };
  if (tableName.startsWith("bronze_")) {
    return [...(map[entity] ?? ["id"]), "_version"];
  }
  if (tableName.startsWith("raw_") || tableName.startsWith("copper_")) {
    return [...(map[entity] ?? ["id"]), "_version"];
  }
  return map[entity] ?? ["id"];
}

function historyMultiplier(entity) {
  if (entity === "doctors") return HISTORY_BASE.doctors / SILVER_BASE.doctors;
  if (entity === "clinics") return HISTORY_BASE.clinics / SILVER_BASE.clinics;
  return 1.05;
}

function silverN(entity, scale) {
  if (entity === "countries") return 8;
  if (entity === "invoices") return scaledCount(SILVER_BASE.appointments, scale);
  return scaledCount(SILVER_BASE[entity] ?? 1, scale);
}

function historyN(entity, scale) {
  if (HISTORY_BASE[entity] != null) {
    return scaledCount(HISTORY_BASE[entity], scale);
  }
  return Math.round(silverN(entity, scale) * historyMultiplier(entity));
}

async function runQuery(bigquery, location, query) {
  await bigquery.query({ query, location });
}

async function dropStaleTables(bigquery, projectId, datasetId, location, keep) {
  const [existing] = await bigquery.dataset(datasetId).getTables();
  for (const table of existing) {
    if (!table.id || keep.has(table.id)) continue;
    await runQuery(bigquery, location, `DROP TABLE IF EXISTS ${tableRef(projectId, datasetId, table.id)}`);
    console.log(`dropped stale table ${table.id}`);
  }
}

async function seedMutableEntityLayers(bigquery, projectId, datasetId, location, scale, entity) {
  const silverCount = silverN(entity, scale);
  const histCount = historyN(entity, scale);
  const bronzeCount = Math.min(histCount, silverCount * 2);

  for (const [layer, n] of [
    ["raw", histCount],
    ["copper", histCount],
    ["bronze", bronzeCount],
    ["silver", silverCount],
  ]) {
    const tableName = `${layer}_${entity}`;
    const sql = ctasGenerateArray(
      projectId,
      datasetId,
      tableName,
      columnDefsFor(tableName),
      n,
      primaryKeyFor(tableName),
      scale,
    );
    if ((layer === "raw" || layer === "copper") && n > silverCount && entity !== "countries") {
      const versions = Math.max(2, Math.ceil(n / silverCount));
      const histSql = `
CREATE OR REPLACE TABLE ${tableRef(projectId, datasetId, tableName)} (
  ${columnDefsFor(tableName)},
  PRIMARY KEY (${primaryKeyFor(tableName).map(quoteIdent).join(", ")}) NOT ENFORCED
)
AS
SELECT
  base.* REPLACE (v AS _version)
FROM (
  ${buildSelectFromGenerateArray(`silver_${entity}`, silverCount, scale)}
) AS base
CROSS JOIN UNNEST(GENERATE_ARRAY(1, ${versions})) AS v
LIMIT ${n}
`.trim();
      await runQuery(bigquery, location, histSql);
    } else {
      await runQuery(bigquery, location, sql);
    }
    console.log(`${tableName}: seeded via GENERATE_ARRAY / CREATE OR REPLACE TABLE AS SELECT`);
  }
}

async function injectBrokenAppointmentDuplicates(bigquery, projectId, datasetId, location) {
  const brokenSql = `
CREATE OR REPLACE TABLE ${tableRef(projectId, datasetId, "silver_appointments")}
AS
SELECT * FROM ${tableRef(projectId, datasetId, "silver_appointments")}
UNION ALL
SELECT * FROM ${tableRef(projectId, datasetId, "silver_appointments")}
WHERE specialty_id = 1
LIMIT 1000
`.trim();
  await runQuery(bigquery, location, brokenSql);
}

async function seedEntityLayers(bigquery, projectId, datasetId, location, scale, broken) {
  for (const entity of MUTABLE_ENTITIES) {
    await seedMutableEntityLayers(bigquery, projectId, datasetId, location, scale, entity);
  }
  if (broken) {
    await injectBrokenAppointmentDuplicates(bigquery, projectId, datasetId, location);
  }
}

async function seedGoldAndOps(bigquery, projectId, datasetId, location, broken) {
  const doctorWorkload = `
CREATE OR REPLACE TABLE ${tableRef(projectId, datasetId, "gold_doctor_workload")} (
  doctor_id INT64 NOT NULL,
  appointment_count INT64 NOT NULL,
  PRIMARY KEY (doctor_id) NOT ENFORCED
)
AS
SELECT doctor_id, COUNT(*) AS appointment_count
FROM ${tableRef(projectId, datasetId, "silver_appointments")}
GROUP BY doctor_id
`.trim();

  const appointmentsMart = `
CREATE OR REPLACE TABLE ${tableRef(projectId, datasetId, "gold_appointments_mart")} (
  appointment_id INT64 NOT NULL,
  doctor_id INT64 NOT NULL,
  clinic_id INT64 NOT NULL,
  patient_id INT64 NOT NULL,
  specialty_id INT64 NOT NULL,
  country_ord INT64 NOT NULL,
  PRIMARY KEY (appointment_id) NOT ENFORCED
)
AS
SELECT appointment_id, doctor_id, clinic_id, patient_id, specialty_id, country_ord
FROM ${tableRef(projectId, datasetId, "silver_appointments")}
`.trim();

  const revenueSpecialty = `
CREATE OR REPLACE TABLE ${tableRef(projectId, datasetId, "gold_revenue_by_specialty")} (
  specialty_id INT64 NOT NULL,
  paid_amount NUMERIC NOT NULL,
  outstanding_amount NUMERIC NOT NULL,
  PRIMARY KEY (specialty_id) NOT ENFORCED
)
AS
SELECT
  a.specialty_id,
  SUM(IF(i.status = 'paid', i.amount, 0)) AS paid_amount,
  SUM(IF(i.status = 'outstanding', i.amount, 0)) AS outstanding_amount
FROM ${tableRef(projectId, datasetId, "silver_invoices")} AS i
JOIN ${tableRef(projectId, datasetId, "silver_appointments")} AS a
  ON i.appointment_id = a.appointment_id
GROUP BY a.specialty_id
`.trim();

  const revenueCountry = `
CREATE OR REPLACE TABLE ${tableRef(projectId, datasetId, "gold_revenue_by_country")} (
  country_ord INT64 NOT NULL,
  total_amount NUMERIC NOT NULL,
  PRIMARY KEY (country_ord) NOT ENFORCED
)
AS
SELECT a.country_ord, SUM(i.amount) AS total_amount
FROM ${tableRef(projectId, datasetId, "silver_invoices")} AS i
JOIN ${tableRef(projectId, datasetId, "silver_appointments")} AS a
  ON i.appointment_id = a.appointment_id
GROUP BY a.country_ord
`.trim();

  for (const sql of [doctorWorkload, appointmentsMart, revenueSpecialty, revenueCountry]) {
    await runQuery(bigquery, location, sql);
  }

  const opsRuns = `
CREATE OR REPLACE TABLE ${tableRef(projectId, datasetId, "ops_pipeline_runs")} (
  run_id STRING NOT NULL,
  status STRING NOT NULL,
  broken BOOL NOT NULL,
  PRIMARY KEY (run_id) NOT ENFORCED
)
AS
SELECT 'seed-run' AS run_id, IF(${broken}, 'broken', 'success') AS status, ${broken} AS broken
`.trim();

  const opsBatches = `
CREATE OR REPLACE TABLE ${tableRef(projectId, datasetId, "ops_transform_batches")} (
  batch_id STRING NOT NULL,
  layer STRING NOT NULL,
  PRIMARY KEY (batch_id) NOT ENFORCED
)
AS
SELECT * FROM UNNEST([
  STRUCT('batch-raw' AS batch_id, 'raw' AS layer),
  STRUCT('batch-copper', 'copper'),
  STRUCT('batch-bronze', 'bronze'),
  STRUCT('batch-silver', 'silver'),
  STRUCT('batch-gold', 'gold')
])
`.trim();

  const opsManifest = `
CREATE OR REPLACE TABLE ${tableRef(projectId, datasetId, "ops_seed_manifest")} (
  entity STRING NOT NULL,
  seed_mode STRING NOT NULL,
  PRIMARY KEY (entity) NOT ENFORCED
)
AS
SELECT entity, IF(${broken}, 'broken', 'healthy') AS seed_mode
FROM UNNEST(${JSON.stringify([...REFERENCE_ENTITIES, ...CORE_ENTITIES])}) AS entity
`.trim();

  for (const sql of [opsRuns, opsBatches, opsManifest]) {
    await runQuery(bigquery, location, sql);
  }
}

async function countTableRows(bigquery, projectId, datasetId, location, tableName) {
  const [rows] = await bigquery.query({
    query: `SELECT COUNT(*) AS n FROM ${tableRef(projectId, datasetId, tableName)}`,
    location,
  });
  return Number(rows[0]?.n ?? 0);
}

async function verifyLiveCounts(bigquery, projectId, datasetId, location, scale) {
  const counts = {};
  for (const entity of ["doctors", "clinics", "appointments", "specialties", "invoices", "patients"]) {
    const table = `silver_${entity}`;
    counts[table] = await countTableRows(bigquery, projectId, datasetId, location, table);
  }
  for (const entity of ["doctors", "clinics"]) {
    for (const layer of ["raw", "copper"]) {
      const table = `${layer}_${entity}`;
      counts[table] = await countTableRows(bigquery, projectId, datasetId, location, table);
    }
  }
  verifyPostSeedCounts(counts, scale);
}

async function main() {
  const broken = process.argv.includes("--broken");
  const projectId = required("GCP_PROJECT_ID");
  const keyFilename = required("GOOGLE_APPLICATION_CREDENTIALS");
  const datasetId = process.env.BIGQUERY_DATASET || "clinic";
  const location = process.env.BIGQUERY_LOCATION || "EU";
  const scale = parseSeedScale();

  const bigquery = new BigQuery({ projectId, keyFilename });

  try {
    await ensureClinicDataset({ bigquery, datasetId, location });
    await seedEntityLayers(bigquery, projectId, datasetId, location, scale, broken);
    await seedGoldAndOps(bigquery, projectId, datasetId, location, broken);

    const keep = new Set(seededTableIdsForMode(broken));
    await dropStaleTables(bigquery, projectId, datasetId, location, keep);

    if (!broken) {
      await verifyLiveCounts(bigquery, projectId, datasetId, location, scale);
    }

    console.log(
      broken
        ? `Seeded BigQuery ${projectId}.${datasetId} (${location}) with pipeline-error scenarios (SEED_SCALE=${scale}).`
        : `Seeded BigQuery ${projectId}.${datasetId} (${location}) via GENERATE_ARRAY / CTAS (SEED_SCALE=${scale}).`,
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
  }
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  await main();
}
