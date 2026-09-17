import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | undefined;

export function getPostgresPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }

  if (!pool) {
    pool = new Pool({ connectionString });
  }

  return pool;
}

export async function queryPostgres(sql: string, params: unknown[] = []): Promise<{
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: string[];
}> {
  const result = await getPostgresPool().query(sql, params);
  const rows = result.rows.map(serializeRow);
  return {
    rows,
    rowCount: result.rowCount ?? rows.length,
    fields: result.fields.map(field => field.name),
  };
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
  return value;
}
