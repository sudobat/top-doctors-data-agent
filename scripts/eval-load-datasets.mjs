/**
 * Load/upsert repo eval datasets under evals/datasets/ into Mastra storage.
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

/**
 * Upsert all repo datasets into Mastra via mastra.datasets.create / addItems.
 * @param {{ mastra?: { datasets?: { create: Function; list?: Function; get?: Function } } }} [opts]
 */
export async function loadDatasetsIntoMastra(opts = {}) {
  const datasets = listRepoDatasets();
  const results = [];

  for (const entry of datasets) {
    const { dataset, agentId, path } = entry;
    if (!dataset?.name) {
      throw new Error(`Dataset at ${path} is missing name`);
    }

    const created = opts.mastra?.datasets?.create
      ? await upsertDatasetEntry(opts.mastra.datasets, entry)
      : // Offline / unit path: report planned upsert without live Mastra.
        { id: `local:${dataset.name}`, name: dataset.name };

    results.push({
      agentId,
      datasetName: dataset.name,
      itemCount: dataset.items?.length ?? 0,
      datasetId: created?.id ?? created?.name,
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
        note: 'Ensure BigQuery clinic seed (npm run db:seed:bq) before live eval runs.',
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
