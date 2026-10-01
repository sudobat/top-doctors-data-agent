/**
 * Load/upsert repo eval datasets under evals/datasets/ into Mastra storage.
 *
 * By default talks to the running Studio / Mastra server (MASTRA_URL, default
 * http://localhost:4111) so datasets appear in Studio. Pass `{ mastra }` to use
 * an in-process DatasetsManager instead.
 *
 * Expects a seeded BigQuery clinic dataset (`npm run db:seed:bq` / seed-bigquery.mjs)
 * before running agent experiments that call BQ tools.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATASETS_ROOT = join(root, 'evals/datasets');

/**
 * @typedef {{
 *   name: string;
 *   description?: string;
 *   agentId: string;
 *   inputSchema?: unknown;
 *   groundTruthSchema?: unknown;
 *   items: Array<{ externalId?: string; input: unknown; groundTruth: unknown }>;
 * }} DatasetFile
 */

/**
 * Discover versioned dataset JSON files under evals/datasets/<agentId>/vN.json.
 * @returns {Array<{ agentId: string; versionFile: string; path: string; dataset: DatasetFile }>}
 */
export function listRepoDatasets() {
  if (!existsSync(DATASETS_ROOT)) {
    throw new Error(`Missing datasets directory: ${DATASETS_ROOT}`);
  }

  /** @type {Array<{ agentId: string; versionFile: string; path: string; dataset: DatasetFile }>} */
  const found = [];
  for (const agentId of readdirSync(DATASETS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)) {
    const dir = join(DATASETS_ROOT, agentId);
    for (const versionFile of readdirSync(dir).filter((f) => /^v\d+\.json$/.test(f))) {
      const path = join(dir, versionFile);
      const dataset = JSON.parse(readFileSync(path, 'utf8'));
      found.push({ agentId, versionFile, path, dataset });
    }
  }
  return found;
}

/**
 * @param {{ create: Function }} datasetsApi
 * @param {{ dataset: DatasetFile; agentId: string; path: string }} entry
 */
async function upsertDatasetEntry(datasetsApi, entry) {
  const { dataset, agentId, path } = entry;
  const created = await datasetsApi.create({
    name: dataset.name,
    description: dataset.description,
    metadata: { agentId, sourcePath: path },
    inputSchema: dataset.inputSchema,
    groundTruthSchema: dataset.groundTruthSchema,
    targetType: 'agent',
    targetIds: [agentId],
  });
  if (created?.addItems && Array.isArray(dataset.items)) {
    await created.addItems({
      items: dataset.items.map((item) => ({
        externalId: item.externalId,
        input: item.input,
        groundTruth: item.groundTruth,
      })),
    });
  }
  return created;
}

function mastraBaseUrl() {
  return (process.env.MASTRA_URL || 'http://localhost:4111').replace(/\/$/, '');
}

/**
 * Minimal HTTP client for the Mastra Studio /dev server datasets API.
 * @param {string} [baseUrl]
 */
export function createHttpDatasetsApi(baseUrl = mastraBaseUrl()) {
  async function request(method, path, body) {
    const url = `${baseUrl}/api${path}`;
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new Error(
        `Cannot reach Mastra at ${baseUrl} (${err instanceof Error ? err.message : err}). ` +
          `Start Studio with \`npm run dev\` then re-run eval:load.`,
      );
    }
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      throw new Error(
        `Mastra API ${method} ${path} failed (${res.status}): ${typeof json === 'object' ? JSON.stringify(json) : text}`,
      );
    }
    return json;
  }

  return {
    async list() {
      const page = await request('GET', '/datasets?perPage=100');
      return { datasets: page?.datasets ?? page?.data ?? [] };
    },
    async create(input) {
      const created = await request('POST', '/datasets', input);
      const id = created?.id;
      return {
        ...created,
        async addItems({ items }) {
          if (!id || !items?.length) return;
          return request('POST', `/datasets/${id}/items/batch`, { items });
        },
      };
    },
    async get({ name, id } = {}) {
      if (id) return request('GET', `/datasets/${id}`);
      const { datasets } = await this.list();
      return datasets.find((d) => d.name === name) ?? null;
    },
  };
}

/**
 * Find existing dataset by name or create it, then add any missing items (by externalId).
 * @param {ReturnType<typeof createHttpDatasetsApi>} datasetsApi
 * @param {{ dataset: DatasetFile; agentId: string; path: string }} entry
 */
async function upsertViaHttp(datasetsApi, entry) {
  const { dataset, agentId, path } = entry;
  const listed = await datasetsApi.list();
  let existing = listed.datasets.find((d) => d.name === dataset.name);

  if (!existing) {
    existing = await datasetsApi.create({
      name: dataset.name,
      description: dataset.description,
      metadata: { agentId, sourcePath: path },
      inputSchema: dataset.inputSchema ?? null,
      groundTruthSchema: dataset.groundTruthSchema ?? null,
      targetType: 'agent',
      targetIds: [agentId],
    });
  }

  const id = existing.id;
  const existingItemsRes = await fetch(`${mastraBaseUrl()}/api/datasets/${id}/items?perPage=200`);
  if (!existingItemsRes.ok) {
    throw new Error(`Failed to list items for dataset ${id}: ${existingItemsRes.status}`);
  }
  const existingItemsJson = await existingItemsRes.json();
  const existingItems = existingItemsJson?.items ?? existingItemsJson?.data ?? [];
  const known = new Set(
    existingItems.map((item) => item.externalId).filter((x) => typeof x === 'string' && x.length > 0),
  );

  const toAdd = (dataset.items ?? []).filter(
    (item) => !item.externalId || !known.has(item.externalId),
  );

  if (toAdd.length > 0) {
    const batchRes = await fetch(`${mastraBaseUrl()}/api/datasets/${id}/items/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: toAdd.map((item) => ({
          externalId: item.externalId ?? null,
          input: item.input,
          groundTruth: item.groundTruth,
        })),
      }),
    });
    if (!batchRes.ok) {
      const text = await batchRes.text();
      throw new Error(`Failed to add items to ${dataset.name}: ${batchRes.status} ${text}`);
    }
  }

  return {
    id,
    name: dataset.name,
    addedItemCount: toAdd.length,
    existingItemCount: existingItems.length,
  };
}

/**
 * Upsert all repo datasets into Mastra via mastra.datasets.create / addItems,
 * or via the Studio HTTP API when no in-process mastra is provided.
 * @param {{ mastra?: { datasets?: { create: Function; list?: Function; get?: Function } }; baseUrl?: string }} [opts]
 */
export async function loadDatasetsIntoMastra(opts = {}) {
  const datasets = listRepoDatasets();
  const results = [];

  const httpApi = opts.mastra?.datasets?.create
    ? null
    : createHttpDatasetsApi(opts.baseUrl || mastraBaseUrl());

  for (const entry of datasets) {
    const { dataset, agentId, path } = entry;
    if (!dataset?.name) {
      throw new Error(`Dataset at ${path} is missing name`);
    }

    const created = opts.mastra?.datasets?.create
      ? await upsertDatasetEntry(opts.mastra.datasets, entry)
      : await upsertViaHttp(httpApi, entry);

    results.push({
      agentId,
      datasetName: dataset.name,
      itemCount: dataset.items?.length ?? 0,
      datasetId: created?.id ?? created?.name,
      addedItemCount: created?.addedItemCount,
    });
  }

  return results;
}

async function main() {
  const results = await loadDatasetsIntoMastra();
  console.log(
    JSON.stringify(
      {
        loaded: results,
        mastraUrl: mastraBaseUrl(),
        note: 'Datasets are now in Mastra storage — refresh Studio. Ensure BigQuery clinic seed (npm run db:seed:bq) before live eval runs.',
      },
      null,
      2,
    ),
  );
}

const isDirect =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
