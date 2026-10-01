---
name: Semantic Stack Compose
description: Optional OpenMetadata + Metabase + dependencies under the semantic Docker profile
targets:
  - ../docker-compose.yml
  - ../docker-compose.openmetadata.yml
  - ../docs/semantic-layer.md
---

# Semantic Stack Compose

## Profile

- Services use Compose profile `semantic` so a default `docker compose up` (without `semantic`) does not start them
- `npm run semantic:up` / `semantic:down` toggle the stack (~8GB RAM)

## Isolation

- OpenMetadata uses its own `openmetadata/postgresql` app database (not clinic Postgres)
- Metabase uses dedicated `metabase-db` Postgres
- OpenMetadata stack lives in `docker-compose.openmetadata.yml`, included by the main compose file

## Published endpoints (local defaults)

| Service | URL |
| --- | --- |
| OpenMetadata UI | http://localhost:8585 |
| Airflow (ingest) | http://localhost:8081 |
| Metabase | http://localhost:3000 |
| Elasticsearch | http://localhost:9201 |

## GCP credentials for ingest

- Mount `GOOGLE_APPLICATION_CREDENTIALS` or `secrets/gcp-sa.json` into the ingestion container as `/gcp/sa.json`

## Verification

- npm scripts `semantic:up` and `semantic:down` are defined with the `semantic` profile
  `[@test] ../tests/package-scripts.test.ts`
