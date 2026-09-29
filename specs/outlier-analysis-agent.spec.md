---
name: Outlier Analysis Agent
description: Statistical/business outlier detection agent and tool bindings
targets:
  - ../src/mastra/agents/outlier-analysis-agent.ts
---

# Outlier Analysis Agent

- Agent id is `outlier-analysis-agent`
  `[@test] ../tests/agent-tool-bindings/outlier-analysis-agent.test.ts`
- Bound tools are BigQuery only: `bq_list_tables`, `bq_describe_columns`, `bq_run_sql` (no OpenMetadata tools)
  `[@test] ../tests/agent-tool-bindings/outlier-analysis-agent.test.ts`

## Analysis contract (prompt)

- Detect outliers (IQR / z-score / percentiles / bronze diffs / business rules) and state method, thresholds, n
- Root-cause toward a single most-likely cause
- Structure: Scope / Outliers found / Root causes / Confidence & caveats

## Known gap (as-built)

- Prompt mentions querying `bronze_` / `raw_` / `ops_` for RCA, but `bq_run_sql` rejects those prefixes
  `[@test] ../tests/bigquery-semantic-sql/assert-bq-guards.test.ts`
- Spec documents current tool enforcement; resolving the prompt/tool conflict is a follow-up product decision
