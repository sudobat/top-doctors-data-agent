import { BigQuery } from '@google-cloud/bigquery';

const DEFAULT_MAX_ROWS = 500;
const DEFAULT_MAXIMUM_BYTES_BILLED = String(1024 ** 3);

let client: BigQuery | undefined;

export function clinicDatasetId(): string {
  return process.env.BIGQUERY_DATASET || 'clinic';
}

export function bigQueryLocation(): string {
  return process.env.BIGQUERY_LOCATION || 'EU';
}

export function getBigQuery(): BigQuery {
  const projectId = process.env.GCP_PROJECT_ID;
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!projectId) {
    throw new Error('GCP_PROJECT_ID is not set.');
  }
  if (!keyFilename) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set.');
  }

  if (!client) {
    client = new BigQuery({ projectId, keyFilename });
  }

  return client;
}

export async function listDatasets(): Promise<{
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: string[];
}> {
  const [datasets] = await getBigQuery().getDatasets();
  const rows = datasets.map(dataset => ({
    datasetId: dataset.id ?? '',
    location: (dataset.metadata?.location as string | undefined) ?? null,
  }));

  return {
    rows,
    rowCount: rows.length,
    fields: ['datasetId', 'location'],
  };
}

export async function listTables(datasetId: string): Promise<{
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: string[];
}> {
  const dataset = getBigQuery().dataset(assertIdentifier(datasetId, 'datasetId'));
  const [exists] = await dataset.exists();
  if (!exists) {
    throw new Error(`Dataset "${datasetId}" was not found in project ${process.env.GCP_PROJECT_ID}.`);
  }

  const [tables] = await dataset.getTables();
  const rows = tables.map(table => ({
    tableId: table.id ?? '',
    type: (table.metadata?.type as string | undefined) ?? null,
  }));

  return {
    rows,
    rowCount: rows.length,
    fields: ['tableId', 'type'],
  };
}

export async function describeColumns(datasetId: string, tableId: string): Promise<{
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: string[];
}> {
  const table = getBigQuery()
    .dataset(assertIdentifier(datasetId, 'datasetId'))
    .table(assertIdentifier(tableId, 'tableId'));
  const [exists] = await table.exists();
  if (!exists) {
    throw new Error(`Table "${datasetId}.${tableId}" was not found.`);
  }

  const [metadata] = await table.getMetadata();
  const fields = flattenFields(metadata.schema?.fields ?? []);
  if (fields.length === 0) {
    throw new Error(`Table "${datasetId}.${tableId}" has no columns.`);
  }

  return {
    rows: fields,
    rowCount: fields.length,
    fields: ['column_name', 'data_type', 'mode', 'description'],
  };
}

export async function queryBigQuery(sql: string, location?: string): Promise<{
  rows: Record<string, unknown>[];
  rowCount: number;
  totalRows: number;
  truncated: boolean;
  fields: string[];
  bytesProcessed: string | null;
}> {
  const jobLocation = location || bigQueryLocation();
  const [job] = await getBigQuery().createQueryJob({
    query: sql,
    location: jobLocation,
    defaultDataset: {
      datasetId: clinicDatasetId(),
      projectId: process.env.GCP_PROJECT_ID,
    },
    maximumBytesBilled: process.env.BIGQUERY_MAXIMUM_BYTES_BILLED || DEFAULT_MAXIMUM_BYTES_BILLED,
  });
  const result = await job.getQueryResults({ maxResults: DEFAULT_MAX_ROWS });
  const rows = result[0] ?? [];
  const response = result[2];
  const serialized = rows.map(row => serializeRow(row as Record<string, unknown>));
  const totalRows = Number(response?.totalRows ?? serialized.length);
  const fieldNames =
    response?.schema?.fields?.flatMap(field => (field.name ? [field.name] : [])) ??
    Object.keys(serialized[0] ?? {});

  return {
    rows: serialized,
    rowCount: serialized.length,
    totalRows,
    truncated: totalRows > serialized.length,
    fields: fieldNames,
    bytesProcessed: response?.totalBytesProcessed ?? null,
  };
}

function assertIdentifier(value: string, label: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,1023}$/.test(trimmed)) {
    throw new Error(`${label} must be a BigQuery identifier (letters, numbers, underscores).`);
  }
  return trimmed;
}

function flattenFields(
  fields: Array<{ name?: string; type?: string; mode?: string; description?: string; fields?: unknown[] }>,
  prefix = '',
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const field of fields) {
    const name = prefix ? `${prefix}.${field.name ?? ''}` : (field.name ?? '');
    rows.push({
      column_name: name,
      data_type: field.type ?? null,
      mode: field.mode ?? null,
      description: field.description ?? null,
    });
    if (Array.isArray(field.fields) && field.fields.length > 0) {
      rows.push(...flattenFields(field.fields as typeof fields, name));
    }
  }
  return rows;
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const serialized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    serialized[key] = serializeValue(value);
  }
  return serialized;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('base64');
  }
  if (Array.isArray(value)) {
    return value.map(item => serializeValue(item));
  }
  if (value && typeof value === 'object' && 'value' in value && Object.keys(value).length === 1) {
    return serializeValue((value as { value: unknown }).value);
  }
  if (value && typeof value === 'object') {
    return serializeRow(value as Record<string, unknown>);
  }
  return value;
}
