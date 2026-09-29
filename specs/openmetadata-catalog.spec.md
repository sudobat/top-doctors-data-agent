---
name: OpenMetadata Catalog Client
description: Auth, published-only glossary/metrics, and certified silver_/gold_ table catalog
targets:
  - ../src/mastra/db/openmetadata.ts
  - ../src/mastra/tools/openmetadata-tools.ts
---

# OpenMetadata Catalog Client

## Auth

- Prefer `OPENMETADATA_JWT_TOKEN` when set; otherwise login with email/password (password base64-encoded) and cache token ~50 minutes
- Default base URL `http://localhost:8585`

## Published status

- Published means `entityStatus === "Approved"` (or status omitted)
  `[@test] ../tests/openmetadata-catalog/published-and-certified.test.ts`
- Draft/unpublished glossary terms and metrics must not be returned as published
  `[@test] ../tests/openmetadata-catalog/published-and-certified.test.ts`

## Certified tables

- Certified table names start with `silver_` or `gold_`
  `[@test] ../tests/openmetadata-catalog/published-and-certified.test.ts`
- `getCertifiedTable` returns `null` for non-certified names even if OM has the entity
  `[@test] ../tests/openmetadata-catalog/published-and-certified.test.ts`

## Tools

| Tool id | Contract |
| --- | --- |
| `om_search_glossary` / `om_get_glossary_term` | `publishedOnly: true`; missing → `found: false` |
| `om_search_metrics` / `om_get_metric` | `formulasAreGuidanceOnly: true` |
| `om_list_certified_assets` | `certifiedPrefixes: ['silver_','gold_']` |
| `om_describe_certified_table` | Soft-fail with reason when not certified/found |
