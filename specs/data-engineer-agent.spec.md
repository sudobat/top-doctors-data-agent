---
name: Data Engineer Agent
description: Semantic-layer-guided BigQuery Q&A agent tool bindings and contracts
targets:
  - ../src/mastra/agents/data-engineer-agent.ts
---

# Data Engineer Agent

- Agent id is `data-engineer-agent`
  `[@test] ../tests/agent-tool-bindings/data-engineer-agent.test.ts`
- Bound tools include all six OpenMetadata tools and four BigQuery tools; Postgres tools are not bound
  `[@test] ../tests/agent-tool-bindings/data-engineer-agent.test.ts`

## Behavioral contracts (prompt + tools)

- Look up published OM glossary/metrics before business answers (prompt)
- SQL only via `bq_run_sql` (read-only; any medallion layer allowed)
  `[@test] ../tests/bigquery-semantic-sql/assert-bq-guards.test.ts`
- Prefer certified `silver_`/`gold_` for business answers; other layers OK for investigation
- Metric formulas are guidance only; execute via BigQuery SQL
- Prefer EN glossary/metric definitions when ES/IT disagree
- Role working memory: ask once if unknown; emoji tone for non-technical roles
