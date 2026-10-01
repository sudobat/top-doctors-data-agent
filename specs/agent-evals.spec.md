---
name: Agent Evaluation Harness
description: Versioned eval datasets, variant configs, scorers, and npm scripts for data-engineer-agent and outlier-analysis-agent
targets:
  - ../src/mastra/index.ts
  - ../src/mastra/scorers/**
  - ../evals/datasets/**
  - ../evals/variants/**
  - ../scripts/eval-*.mjs
  - ../package.json
---

# Agent Evaluation Harness

Studio-visible Mastra datasets + experiments + scorers for the two data agents. Cases live in-repo; scripts load them into Mastra storage and run experiments against live BigQuery (and OpenMetadata when required). Cross-ref agent contracts in `data-engineer-agent.spec.md` / `outlier-analysis-agent.spec.md` — this spec does not redefine agent behavior.

## Scope

- Eval targets are **only** `data-engineer-agent` and `outlier-analysis-agent`
  `[@test] ../tests/agent-evals/scope-agents.test.ts`
- The general `agent` is out of scope and must not have datasets, variants, or eval npm scripts
  `[@test] ../tests/agent-evals/scope-agents.test.ts`

## Repo layout

```
evals/
  datasets/
    data-engineer-agent/
      v1.json
    outlier-analysis-agent/
      v1.json
  variants/
    data-engineer-agent/
      baseline.yaml
    outlier-analysis-agent/
      baseline.yaml
scripts/
  eval-load-datasets.mjs
  eval-run-experiment.mjs
src/mastra/scorers/
  *.ts
```

- One versioned dataset file per agent under `evals/datasets/<agent-id>/vN.json` (starter: `v1.json`)
  `[@test] ../tests/agent-evals/dataset-layout.test.ts`
- Variant configs under `evals/variants/<agent-id>/*.yaml` (JSON also accepted)
  `[@test] ../tests/agent-evals/variant-config-schema.test.ts`

## Dataset file format

Each `vN.json` is the source of truth authored in git. Load scripts upsert into Mastra via `mastra.datasets.create` / `addItems` (Studio-visible, versioned in Mastra storage).

```json
{
  "name": "data-engineer-agent-v1",
  "description": "Starter eval cases for data-engineer-agent",
  "agentId": "data-engineer-agent",
  "inputSchema": { "type": "string" },
  "groundTruthSchema": { "type": "object" },
  "items": [
    {
      "externalId": "de-glossary-then-sql-01",
      "input": "What does the revenue-by-specialty metric mean, and show latest paid totals?",
      "groundTruth": {
        "answerSummary": "Defines the OM metric then returns paid totals from gold_revenue_by_specialty",
        "requiredTools": ["om_search_metrics", "bq_run_sql"],
        "expectedStructure": ["definition", "sql", "results"],
        "notes": "Prefer EN glossary/metric when ES/IT disagree"
      }
    }
  ]
}
```

- `input` is a string (or message array) suitable for `agent.generate()` / experiment `targetType: 'agent'`
  `[@test] ../tests/agent-evals/dataset-schema.test.ts`
- `groundTruth` is an object with at least `answerSummary` and `requiredTools` (string tool ids)
  `[@test] ../tests/agent-evals/dataset-schema.test.ts`
- Optional `expectedStructure` (heading/section keys) and free-form `notes` for the LLM judge
  `[@test] ../tests/agent-evals/dataset-schema.test.ts`
- Starter datasets contain **5–10** realistic items per agent, drafted from suggested prompts / contracts in the agent specs
  `[@test] ../tests/agent-evals/starter-dataset-size.test.ts`
- Dataset `name` is stable and unique per agent version (e.g. `data-engineer-agent-v1`, `outlier-analysis-agent-v1`)
  `[@test] ../tests/agent-evals/dataset-schema.test.ts`

### Per-agent ground-truth emphasis

| Agent | Typical `requiredTools` | Typical `expectedStructure` / notes |
| --- | --- | --- |
| `data-engineer-agent` | OM lookup tools + `bq_run_sql` (and describe/list when needed) | Cite OM term/metric; SQL + real results; prefer certified `silver_`/`gold_` for business answers |
| `outlier-analysis-agent` | `bq_list_tables` / `bq_describe_columns` / `bq_run_sql` as needed | Sections: Scope / Outliers found / Root causes / Confidence & caveats; method + thresholds + n |

- Data-engineer starter cases require OpenMetadata tool usage where the prompt is a business/metric question
  `[@test] ../tests/agent-evals/starter-dataset-size.test.ts`
- Outlier starter cases expect the four-section answer structure from the outlier agent contract
  `[@test] ../tests/agent-evals/starter-dataset-size.test.ts`

## Variant configs

Benchmark YAML/JSON files override **model**, **instructions**, and/or **tool set** for a run without changing the registered default agent in source. Missing override fields inherit the registered agent defaults.

```yaml
id: baseline
agentId: data-engineer-agent
# Optional overrides:
# model: openai/gpt-5.6-terra
# instructions: |
#   ...full instructions...
# tools:
#   - om_search_glossary
#   - om_search_metrics
#   - bq_list_tables
#   - bq_describe_columns
#   - bq_run_sql
scorers:
  - required-tools
  - answer-structure
  - answer-similarity-judge
```

- Required fields: `id`, `agentId` (must be one of the two in-scope agents)
  `[@test] ../tests/agent-evals/variant-config-schema.test.ts`
- Optional `model` (Mastra model id string), `instructions` (string), `tools` (array of registered tool ids), `scorers` (array of registered scorer ids)
  `[@test] ../tests/agent-evals/variant-config-schema.test.ts`
- `baseline` variant exists for each agent and applies no model/instructions/tools overrides (scorers may still be listed)
  `[@test] ../tests/agent-evals/variant-config-schema.test.ts`
- Eval runner applies overrides for that experiment only (ephemeral agent config or equivalent); it must not permanently mutate agent source files
  `[@test] ../tests/agent-evals/experiment-runner.test.ts`
- `tools` override, when present, is the exact tool set for the run (subset or reordered allowlist of registered tools)
  `[@test] ../tests/agent-evals/experiment-runner.test.ts`

## Scorers

Scorers are created with `createScorer` from `@mastra/core/evals` (and/or `@mastra/evals` prebuilt helpers) and **registered** on the Mastra instance in `src/mastra/index.ts` so Studio can list them and experiments can resolve scorer ids.

- Mastra `scorers` registry includes all harness scorers below
  `[@test] ../tests/agent-evals/scorers-registration.test.ts`

### Deterministic

| Scorer id | Checks |
| --- | --- |
| `required-tools` | Every tool id in `groundTruth.requiredTools` appears in the item’s tool-call trajectory / trace |
| `answer-structure` | Output contains the sections/keys in `groundTruth.expectedStructure` (outlier four-part headings, or DE definition/sql/results keys) |

- `required-tools` scores 1 when all required tools were called, else 0, with a reason listing missing tools
  `[@test] ../tests/agent-evals/scorers-required-tools.test.ts`
- `answer-structure` is case-insensitive on heading labels and tolerates markdown formatting
  `[@test] ../tests/agent-evals/scorers-answer-structure.test.ts`

### LLM-as-judge

| Scorer id | Checks |
| --- | --- |
| `answer-similarity-judge` | Semantic quality of the agent answer vs `groundTruth.answerSummary` / notes (Mastra answer-similarity or equivalent `createScorer` judge) |

- Judge uses a configured model and returns a numeric score plus reason; requires ground truth
  `[@test] ../tests/agent-evals/scorers-llm-judge.test.ts`
- Judge is registered and selectable from Studio / experiment `scorers` lists
  `[@test] ../tests/agent-evals/scorers-registration.test.ts`

## npm scripts

Scripts use `node --env-file=.env` like other repo commands.

| Script | Behavior |
| --- | --- |
| `eval:load` | Load/upsert all repo datasets under `evals/datasets/` into Mastra storage |
| `eval:run` | Run an experiment: requires agent id + optional variant id (default `baseline`) |
| `eval:run:data-engineer` | Convenience: load if needed + run `data-engineer-agent` with `baseline` (or `--variant=`) |
| `eval:run:outlier-analysis` | Convenience: same for `outlier-analysis-agent` |

- `package.json` defines `eval:load`, `eval:run`, `eval:run:data-engineer`, and `eval:run:outlier-analysis`
  `[@test] ../tests/agent-evals/npm-scripts.test.ts`
- Scripts invoke `scripts/eval-load-datasets.mjs` / `scripts/eval-run-experiment.mjs` with `--env-file=.env`
  `[@test] ../tests/agent-evals/npm-scripts.test.ts`
- `eval:run` resolves dataset by agent, applies the chosen variant, calls `dataset.startExperiment` with `targetType: 'agent'`, `targetId` = agent id, and the variant’s scorer ids
  `[@test] ../tests/agent-evals/experiment-runner.test.ts`
- Experiments persist to Mastra storage and are visible in Studio (Datasets → Experiments / agent Evaluate tab)
  `[@test] ../tests/agent-evals/experiment-runner.test.ts`

## Quality, cost, and latency surfaces

- Quality: per-item scorer scores and reasons from the experiment summary / Studio experiment detail
  `[@test] ../tests/agent-evals/experiment-runner.test.ts`
- Cost and response time come from **existing Mastra observability traces** (MastraStorageExporter + MastraPlatformExporter already configured)—no custom cost accounting
  `[@test] ../tests/agent-evals/observability-metrics.test.ts`
- Each experiment item links to (or is inspectable via) the observability trace for that run so duration and model usage/cost attributes exposed by Mastra can be compared across variants
  `[@test] ../tests/agent-evals/observability-metrics.test.ts`
- Comparing experiments across variants is done via Studio experiment compare and/or `dataset.compareExperiments` / listed experiment results—not a separate metrics store
  `[@test] ../tests/agent-evals/experiment-runner.test.ts`

## Live dependencies

- Tool calls run **live** (default `unmockedToolPolicy: 'allow'`); mocked/recorded tool mode is out of scope
  `[@test] ../tests/agent-evals/live-deps.test.ts`
- Eval scripts expect seeded BigQuery clinic dataset (`npm run db:seed:bq` / domain in `bigquery-warehouse-seed.spec.md`)
  `[@test] ../tests/agent-evals/live-deps.test.ts`
- `data-engineer-agent` evals additionally expect OpenMetadata reachable (semantic stack up) when cases require OM tools
  `[@test] ../tests/agent-evals/live-deps.test.ts`
- Missing live deps fail the affected items (or fail fast at script start with a clear error)—they must not be silently skipped
  `[@test] ../tests/agent-evals/live-deps.test.ts`

## Failure handling

- Agent or tool errors are recorded as **failed experiment items** (`error` populated, counted in `failedCount`), not omitted from results
  `[@test] ../tests/agent-evals/error-recording.test.ts`
- Scorer failures attach to the item’s score entry with an error/reason; they do not erase the item result
  `[@test] ../tests/agent-evals/error-recording.test.ts`

## Core workflow (author → run → inspect)

1. Author cases in `evals/datasets/<agent-id>/vN.json` (`input` + `groundTruth`)
2. Pick a variant under `evals/variants/<agent-id>/` (`baseline` or override model/instructions/tools)
3. Run via Studio or `npm run eval:run:…` / `eval:run`
4. Inspect quality scores, cost, and latency; compare experiments across variants

- Documented workflow is covered by load + run scripts and Studio-visible registration above
  `[@test] ../tests/agent-evals/experiment-runner.test.ts`

## Out of scope

- Evals for the general `agent`
  `[@test] ../tests/agent-evals/scope-agents.test.ts`
- Mocked or recorded tool playback mode
  `[@test] ../tests/agent-evals/live-deps.test.ts`
- CI gating / regression score thresholds / pass-fail gates
  `[@test] ../tests/agent-evals/npm-scripts.test.ts`
- Custom cost accounting beyond Mastra observability-exposed usage/cost fields
  `[@test] ../tests/agent-evals/observability-metrics.test.ts`
