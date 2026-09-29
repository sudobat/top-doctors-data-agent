---
name: Metabase Description Sync
description: Push OpenMetadata certified table/column descriptions into Metabase
targets:
  - ../scripts/sync-metabase-descriptions.mjs
---

# Metabase Description Sync

## Flow

1. Authenticate to OpenMetadata (JWT or login) and Metabase session
2. Load certified `silver_` / `gold_` tables from OM (search size 200) with columns
3. For each Metabase database metadata tree, match table/field names case-insensitively
4. `PUT` table/field descriptions only when OM has text and it differs
5. `--dry-run` logs intended updates without writing

## Env

- OM: `OPENMETADATA_URL`, email/password or `OPENMETADATA_JWT_TOKEN`
- Metabase: `METABASE_URL` (default localhost:3000), `METABASE_USERNAME` or `METABASE_EMAIL`, `METABASE_PASSWORD` (required)

## npm

- `npm run semantic:sync-metabase`
- `npm run semantic:sync-metabase -- --dry-run`

## Verification

- npm script `semantic:sync-metabase` is defined
  `[@test] ../tests/package-scripts.test.ts`
