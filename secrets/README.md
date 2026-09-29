# Secrets (local only)

Copy your GCP service-account JSON here as `gcp-sa.json` so the OpenMetadata ingestion container can run BigQuery metadata ingest:

```bash
cp "$GOOGLE_APPLICATION_CREDENTIALS" secrets/gcp-sa.json
```

Or point `GOOGLE_APPLICATION_CREDENTIALS` in `.env` at an existing JSON file; `docker-compose.openmetadata.yml` mounts that path into the ingestion container.

Never commit real credential files.
