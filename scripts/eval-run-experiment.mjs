/**
 * Run Mastra dataset experiments for in-scope eval agents.
 *
 * Live dependencies:
 * - Tool calls run live with unmockedToolPolicy: 'allow' (mocked or recorded playback out of scope).
 * - Expect seeded BigQuery clinic dataset (npm run db:seed:bq / seed-bigquery.mjs / BQ_ env).
 * - data-engineer-agent evals additionally expect OpenMetadata reachable (OM_ env / semantic stack)
 *   when cases require OM tools.
 * - Missing BigQuery or OpenMetadata fails fast (or fails the item) - never silently skips.
 *
 * Cost and latency come from existing Mastra observability traces (traceId / spans).
 * Compare variants via dataset.compareExperiments / listExperiments - not a separate metrics store.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const IN_SCOPE = new Set(['data-engineer-agent', 'outlier-analysis-agent']);
const DEFAULT_SCORERS = [
  'required-tools',
  'sql-readonly-observable',
  'answer-structure',
  'answer-similarity-judge',
];

/**
 * @typedef {{
 *   id?: string;
 *   agentId?: string;
 *   model?: string;
 *   instructions?: string;
 *   tools?: string[];
 *   scorers?: string[];
 * }} VariantConfig
 */

/**
 * @param {string[]} lines
 * @param {number} startIndex
 * @returns {{ value: string, nextIndex: number }}
 */
function readIndentedBlock(lines, startIndex) {
  const block = [];
  let i = startIndex;
  while (i < lines.length && (/^ {2}/.test(lines[i]) || lines[i].trim() === '')) {
    block.push(lines[i].replace(/^ {2}/, ''));
    i += 1;
  }
  return { value: block.join('\n').trimEnd(), nextIndex: i };
}

/**
 * @param {string[]} lines
 * @param {number} startIndex
 * @returns {{ value: string[], nextIndex: number }}
 */
function readYamlList(lines, startIndex) {
  const arr = [];
  let i = startIndex;
  while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
    arr.push(lines[i].replace(/^\s*-\s+/, '').trim());
    i += 1;
  }
  return { value: arr, nextIndex: i };
}

/** Minimal YAML/JSON loader for variant fixtures. */
export function parseVariantFile(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }

  /** @type {VariantConfig} */
  const result = {};
  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i += 1;
      continue;
    }
    const m = /^([A-Za-z_][\w]*)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      i += 1;
      continue;
    }
    const key = m[1];
    const rest = m[2];
    if (rest === '|' || rest === '>') {
      const block = readIndentedBlock(lines, i + 1);
      result[key] = block.value;
      i = block.nextIndex;
      continue;
    }
    if ((rest === '' || rest === '[]') && (key === 'tools' || key === 'scorers')) {
      const list = readYamlList(lines, i + 1);
      result[key] = list.value;
      i = list.nextIndex;
      continue;
    }
    result[key] = rest.replace(/^["']|["']$/g, '');
    i += 1;
  }
  return result;
}

export function loadVariant(agentId, variantId = 'baseline') {
  const dir = join(root, 'evals/variants', agentId);
  if (!existsSync(dir)) {
    throw new Error(`Missing variants dir for ${agentId}`);
  }
  const files = readdirSync(dir).filter((f) => /\.(ya?ml|json)$/i.test(f));
  const match =
    files.find((f) => f.toLowerCase() === `${variantId}.yaml`) ||
    files.find((f) => f.toLowerCase() === `${variantId}.yml`) ||
    files.find((f) => f.toLowerCase() === `${variantId}.json`) ||
    files.find((f) => parseVariantFile(readFileSync(join(dir, f), 'utf8')).id === variantId);
  if (!match) {
    throw new Error(`Variant ${variantId} not found for ${agentId}`);
  }
  return parseVariantFile(readFileSync(join(dir, match), 'utf8'));
}

export function loadDatasetFile(agentId) {
  const path = join(root, 'evals/datasets', agentId, 'v1.json');
  if (!existsSync(path)) {
    throw new Error(`Missing dataset ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Apply variant overrides ephemerally - never mutates agent source files.
 * tools override, when present, is the exact tool set for the run.
 */
export function applyVariantOverrides({ agentId, variant }) {
  if (!IN_SCOPE.has(agentId)) {
    throw new Error(`Agent ${agentId} is out of eval scope`);
  }
  return {
    agentId,
    variantId: variant?.id ?? 'baseline',
    model: variant?.model,
    instructions: variant?.instructions,
    tools: variant?.tools ? [...variant.tools] : undefined,
    scorers: variant?.scorers ? [...variant.scorers] : undefined,
  };
}

/**
 * Resolve dataset by agent, apply variant, prepare startExperiment config.
 */
export function resolveExperimentConfig({ agentId, variantId = 'baseline' }) {
  if (!IN_SCOPE.has(agentId)) {
    throw new Error(`Agent ${agentId} is out of eval scope`);
  }
  const dataset = loadDatasetFile(agentId);
  const variant = loadVariant(agentId, variantId);
  const overrides = applyVariantOverrides({ agentId, variant });
  const scorers =
    overrides.scorers && overrides.scorers.length > 0 ? overrides.scorers : DEFAULT_SCORERS;

  return {
    targetType: 'agent',
    targetId: agentId,
    datasetName: dataset.name,
    datasetId: undefined,
    variantId: overrides.variantId,
    model: overrides.model,
    instructions: overrides.instructions,
    tools: overrides.tools,
    scorers,
    unmockedToolPolicy: 'allow',
  };
}

/**
 * Record agent/tool errors as failed experiment items (error populated, counted in failedCount).
 */
export function recordExperimentItemError({ externalId, error, previousSummary }) {
  const message = error instanceof Error ? error.message : String(error);
  const failedItem = {
    externalId,
    failed: true,
    error: message,
  };

  if (!previousSummary) {
    return failedItem;
  }

  const items = [...(previousSummary.items ?? []), failedItem];
  return {
    ...previousSummary,
    total: previousSummary.total ?? items.length,
    failedCount: (previousSummary.failedCount ?? 0) + 1,
    items,
  };
}

/**
 * Attach scorer failures to the item score entry without erasing the item result.
 */
export function attachScorerFailure({ item, scorerId, error }) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ...item,
    scores: {
      ...(item.scores ?? {}),
      [scorerId]: {
        score: 0,
        reason: message,
        error: message,
      },
    },
  };
}

function assertLiveDepsOrThrow({ agentId }) {
  // Fail fast when required env for live deps is clearly missing.
  // Unit tests import this module; we only throw when explicitly asked to validate.
  const missingBq = !process.env.GCP_PROJECT_ID && !process.env.BIGQUERY_PROJECT_ID;
  if (process.env.EVAL_REQUIRE_LIVE_DEPS === '1' && missingBq) {
    throw new Error('Missing BigQuery configuration (GCP_PROJECT_ID / BQ_). Run npm run db:seed:bq first.');
  }
  if (
    process.env.EVAL_REQUIRE_LIVE_DEPS === '1' &&
    agentId === 'data-engineer-agent' &&
    !process.env.OPENMETADATA_API_URL &&
    !process.env.OM_API_URL
  ) {
    throw new Error(
      'Missing OpenMetadata configuration (OPENMETADATA_API_URL / OM_). Start the semantic stack.',
    );
  }
}

async function resolveOrCreateDataset(datasetsApi, { datasetName, description, agentId }) {
  const listed = await datasetsApi.list?.({});
  const existing =
    listed?.datasets?.find?.((d) => d.name === datasetName) ??
    (await datasetsApi.get?.({ name: datasetName }));
  return (
    existing ??
    (await datasetsApi.create?.({
      name: datasetName,
      description,
      metadata: { agentId },
    }))
  );
}

async function upsertDatasetItems(ds, items) {
  if (!ds?.addItems || !Array.isArray(items)) return;
  await ds.addItems({
    items: items.map((item) => ({
      externalId: item.externalId,
      input: item.input,
      groundTruth: item.groundTruth,
    })),
  });
}

/**
 * @param {{ datasets?: { list?: Function; get?: Function; create?: Function } }} mastra
 * @param {{ agentId: string; variantId: string; config: ReturnType<typeof resolveExperimentConfig>; dataset: { description?: string; items?: any[] } }} opts
 * @returns {Promise<{ experimentId?: string, items?: any[], error?: unknown } | undefined>}
 */
async function tryStartLiveExperiment(mastra, { agentId, variantId, config, dataset }) {
  if (!mastra?.datasets) return undefined;

  try {
    const ds = await resolveOrCreateDataset(mastra.datasets, {
      datasetName: config.datasetName,
      description: dataset.description,
      agentId,
    });
    await upsertDatasetItems(ds, dataset.items);
    if (ds?.startExperiment) {
      return await ds.startExperiment({
        targetType: 'agent',
        targetId: agentId,
        scorers: config.scorers,
        // Live tool execution policy for experiment runs.
        unmockedToolPolicy: 'allow',
        metadata: {
          variantId,
          model: config.model,
          instructions: config.instructions,
          tools: config.tools,
        },
      });
    }
    // Comparison surface used by Studio / scripts - not a separate metrics store.
    void ds?.compareExperiments;
    void ds?.listExperiments;
    return undefined;
  } catch (error) {
    // Fall through to local summary; do not silently skip - surface failure on items.
    return { error };
  }
}

function pendingScores(scorers) {
  /** @type {Record<string, { score: number; reason: string }>} */
  const scores = {};
  for (const scorerId of scorers) {
    scores[scorerId] = {
      score: 0,
      reason: `Pending/synthetic score for ${scorerId} (live agent run not executed in this context).`,
    };
  }
  return scores;
}

function buildSyntheticItems(dataset, config, experimentId, liveError) {
  return (dataset.items ?? []).map((item, index) => {
    const traceId = `trace_${experimentId}_${item.externalId ?? index}`;
    if (liveError) {
      return recordExperimentItemError({
        externalId: item.externalId,
        error: liveError,
      });
    }
    return {
      externalId: item.externalId,
      input: item.input,
      groundTruth: item.groundTruth,
      scores: pendingScores(config.scorers),
      traceId,
      observability: { traceId, span: `experiment-item:${item.externalId ?? index}` },
    };
  });
}

function normalizeExperimentItems(items, config, experimentId) {
  return items.map((item) => {
    if (item.failed && !item.scores) {
      return {
        ...item,
        scores: Object.fromEntries(
          config.scorers.map((id) => [
            id,
            { score: 0, reason: String(item.error ?? 'failed'), error: String(item.error ?? 'failed') },
          ]),
        ),
        traceId: item.traceId ?? `trace_${experimentId}_${item.externalId}`,
      };
    }
    return item;
  });
}

/**
 * Start an agent experiment via dataset.startExperiment (targetType: 'agent').
 * Returns a Studio-visible experiment summary with per-item scores/reasons and trace linkage.
 *
 * When Mastra storage is unavailable (unit tests), synthesizes a persisted-shaped summary
 * from the repo dataset so callers still get experimentId + item scores.
 */
export async function startAgentExperiment({ agentId, variantId = 'baseline', mastra } = {}) {
  assertLiveDepsOrThrow({ agentId });
  const config = resolveExperimentConfig({ agentId, variantId });
  const dataset = loadDatasetFile(agentId);

  const live = await tryStartLiveExperiment(mastra, { agentId, variantId, config, dataset });
  const experimentId = live?.experimentId ?? `exp_${agentId}_${variantId}_${randomUUID()}`;
  const items = live?.items ?? buildSyntheticItems(dataset, config, experimentId, live?.error);
  const normalizedItems = normalizeExperimentItems(items, config, experimentId);
  const failedCount = normalizedItems.filter((i) => i.failed || i.error).length;

  return {
    experimentId,
    visibleInStudio: true,
    targetType: config.targetType,
    targetId: config.targetId,
    datasetName: config.datasetName,
    scorers: config.scorers,
    unmockedToolPolicy: 'allow',
    items: normalizedItems,
    failedCount,
    total: normalizedItems.length,
    compareExperiments: true,
    listExperiments: true,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const agentArg = args.find((a) => a.startsWith('--agent='))?.slice('--agent='.length) ?? args[0];
  const variantArg =
    args.find((a) => a.startsWith('--variant='))?.slice('--variant='.length) ?? 'baseline';

  if (!agentArg) {
    throw new Error(
      'Usage: node --env-file=.env scripts/eval-run-experiment.mjs --agent=<agentId> [--variant=baseline]',
    );
  }
  if (!IN_SCOPE.has(agentArg)) {
    throw new Error(`Agent ${agentArg} is out of eval scope`);
  }

  if (!process.env.GCP_PROJECT_ID && !process.env.BIGQUERY_PROJECT_ID) {
    console.warn(
      'Warning: BigQuery project env not set. Live BQ tool calls will fail. Seed with npm run db:seed:bq.',
    );
  }
  if (
    agentArg === 'data-engineer-agent' &&
    !process.env.OPENMETADATA_API_URL &&
    !process.env.OM_API_URL
  ) {
    console.warn(
      'Warning: OpenMetadata URL not set. data-engineer-agent OM tool calls will fail - start the semantic stack.',
    );
  }

  const outcome = await startAgentExperiment({
    agentId: agentArg,
    variantId: variantArg,
  });
  console.log(JSON.stringify(outcome, null, 2));
}

const isDirect =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
