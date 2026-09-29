# Top Doctors semantic layer (v1)

Approved direction: OpenMetadata-first glossary/metrics (guidance), dbt Core for executable logic, Metabase for humans, Mastra agents for guided SQL on certified `silver_` / `gold_` models.

## Bring the stack up

Clinic Postgres only:

```bash
npm run db:up
```

Semantic stack (OpenMetadata + Metabase + their dependencies — needs ~8GB RAM):

```bash
# Optional: mount real GCP creds for BigQuery ingest
cp "$GOOGLE_APPLICATION_CREDENTIALS" secrets/gcp-sa.json

npm run semantic:up
```

| Service | URL | Default login |
| --- | --- | --- |
| OpenMetadata UI | http://localhost:8585 | admin@open-metadata.org / admin |
| OpenMetadata Airflow (ingest) | http://localhost:8081 | admin / admin |
| Metabase | http://localhost:3000 | set up on first visit |
| Elasticsearch (OM) | http://localhost:9201 | — |

Stop semantic services (keeps clinic Postgres if started separately):

```bash
npm run semantic:down
```

## OpenMetadata: auto-ingest BigQuery certified models

1. Open http://localhost:8585 and sign in.
2. **Settings → Services → Databases → Add Service → BigQuery**.
3. Connection:
   - GCP project = `GCP_PROJECT_ID`
   - Credentials path inside ingestion container: `/gcp/sa.json` (mounted from `GOOGLE_APPLICATION_CREDENTIALS` or `secrets/gcp-sa.json`)
   - Dataset filter: `clinic` (or your `BIGQUERY_DATASET`)
4. Configure metadata ingestion to include tables; prefer filtering to `silver_%` and `gold_%` if the UI allows schema/table filters.
5. Optionally add a **dbt** ingestion pipeline pointing at your dbt `manifest.json` / `catalog.json` for lineage.
6. Run the pipeline from the UI (Airflow at :8081).

## Glossary, metrics, publish workflow

- Create glossaries and terms in **EN (canonical)**, plus **ES** and **IT** translations.
- Create **Metrics** with business descriptions; put calculation notes in `metricExpression` as **guidance only** (not executed by OM).
- Stewards edit; reviewers **Approve** before agents treat definitions as official.
- Agents only see **Approved** terms/metrics via Mastra tools.

## Metabase

1. Open http://localhost:3000 and complete setup.
2. Add BigQuery (or Postgres clinic for local demos) as a database; expose certified models to viewers.
3. Sync descriptions from OpenMetadata:

```bash
export METABASE_USERNAME=you@topdoctors.com
export METABASE_PASSWORD=...
npm run semantic:sync-metabase
# or: npm run semantic:sync-metabase -- --dry-run
```

## Agent behavior

`data-engineer-agent` must look up published OM glossary/metrics before business answers, then run SQL only on `silver_` / `gold_`. Env:

```bash
OPENMETADATA_URL=http://localhost:8585
OPENMETADATA_EMAIL=admin@open-metadata.org
OPENMETADATA_PASSWORD=admin
# or OPENMETADATA_JWT_TOKEN=...
```
