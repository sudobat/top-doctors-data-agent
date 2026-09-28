-- Medallion warehouse emulation in public (table-name prefixes).
-- Tiers: raw_* → copper_* → bronze_* → silver_* → gold_*; ops_* for job state.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;
GRANT ALL ON SCHEMA public TO clinic;

-- ---------------------------------------------------------------------------
-- Ops / control plane (Airbyte, Airflow, dbt — simplified but recognizable)
-- ---------------------------------------------------------------------------

CREATE TABLE ops_airbyte_connections (
  connection_id   UUID PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  source_type     TEXT NOT NULL,
  destination     TEXT NOT NULL DEFAULT 'bigquery',
  status          TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'deprecated')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ops_airbyte_syncs (
  sync_id            UUID PRIMARY KEY,
  connection_id      UUID NOT NULL REFERENCES ops_airbyte_connections (connection_id),
  status             TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled', 'incomplete')),
  started_at         TIMESTAMPTZ NOT NULL,
  ended_at           TIMESTAMPTZ,
  records_emitted    INTEGER NOT NULL DEFAULT 0,
  records_committed  INTEGER NOT NULL DEFAULT 0,
  bytes_committed    BIGINT NOT NULL DEFAULT 0,
  attempt_number     INTEGER NOT NULL DEFAULT 1,
  failure_reason     TEXT
);

CREATE TABLE ops_airbyte_stream_states (
  connection_id  UUID NOT NULL REFERENCES ops_airbyte_connections (connection_id),
  stream_name    TEXT NOT NULL,
  namespace      TEXT NOT NULL DEFAULT 'clinic',
  state_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (connection_id, namespace, stream_name)
);

CREATE TABLE ops_airflow_dag_runs (
  dag_id          TEXT NOT NULL,
  run_id          TEXT NOT NULL,
  execution_date  TIMESTAMPTZ NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('queued', 'running', 'success', 'failed')),
  start_date      TIMESTAMPTZ,
  end_date        TIMESTAMPTZ,
  external_trigger BOOLEAN NOT NULL DEFAULT false,
  conf            JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (dag_id, run_id)
);

CREATE TABLE ops_airflow_task_instances (
  dag_id           TEXT NOT NULL,
  run_id           TEXT NOT NULL,
  task_id          TEXT NOT NULL,
  try_number       INTEGER NOT NULL DEFAULT 1,
  state            TEXT NOT NULL CHECK (state IN ('none', 'scheduled', 'queued', 'running', 'success', 'failed', 'skipped', 'up_for_retry')),
  start_date       TIMESTAMPTZ,
  end_date         TIMESTAMPTZ,
  duration_seconds NUMERIC(10, 3),
  operator         TEXT,
  PRIMARY KEY (dag_id, run_id, task_id, try_number),
  FOREIGN KEY (dag_id, run_id) REFERENCES ops_airflow_dag_runs (dag_id, run_id)
);

CREATE TABLE ops_dbt_invocations (
  invocation_id  UUID PRIMARY KEY,
  dbt_version    TEXT NOT NULL,
  project_name   TEXT NOT NULL,
  target_name    TEXT NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL,
  ended_at       TIMESTAMPTZ,
  status         TEXT NOT NULL CHECK (status IN ('success', 'error', 'partial')),
  command        TEXT NOT NULL,
  args           JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE ops_dbt_run_results (
  invocation_id    UUID NOT NULL REFERENCES ops_dbt_invocations (invocation_id),
  unique_id        TEXT NOT NULL,
  name             TEXT NOT NULL,
  resource_type    TEXT NOT NULL CHECK (resource_type IN ('model', 'test', 'seed', 'snapshot')),
  status           TEXT NOT NULL CHECK (status IN ('success', 'error', 'skipped', 'pass', 'fail', 'warn')),
  execution_time   NUMERIC(10, 3),
  rows_affected    INTEGER,
  message          TEXT,
  materialized     TEXT,
  PRIMARY KEY (invocation_id, unique_id)
);

CREATE TABLE ops_transform_batches (
  execution_id   UUID PRIMARY KEY,
  batch_label    TEXT NOT NULL UNIQUE,
  layer_from     TEXT NOT NULL,
  layer_to       TEXT NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL,
  ended_at       TIMESTAMPTZ,
  status         TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  airbyte_sync_id UUID REFERENCES ops_airbyte_syncs (sync_id),
  airflow_run_id  TEXT,
  dbt_invocation_id UUID REFERENCES ops_dbt_invocations (invocation_id)
);

-- ---------------------------------------------------------------------------
-- Raw (Airbyte-style landing: JSON payload + control fields)
-- ---------------------------------------------------------------------------

CREATE TABLE raw_dynamics_specialties (
  _airbyte_raw_id       UUID PRIMARY KEY,
  _airbyte_extracted_at TIMESTAMPTZ NOT NULL,
  _airbyte_loaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  _airbyte_meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  _airbyte_generation_id BIGINT NOT NULL,
  _airbyte_data         JSONB NOT NULL
);

CREATE TABLE raw_dynamics_doctors (
  _airbyte_raw_id       UUID PRIMARY KEY,
  _airbyte_extracted_at TIMESTAMPTZ NOT NULL,
  _airbyte_loaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  _airbyte_meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  _airbyte_generation_id BIGINT NOT NULL,
  _airbyte_data         JSONB NOT NULL
);

CREATE TABLE raw_dynamics_doctor_specialties (
  _airbyte_raw_id       UUID PRIMARY KEY,
  _airbyte_extracted_at TIMESTAMPTZ NOT NULL,
  _airbyte_loaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  _airbyte_meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  _airbyte_generation_id BIGINT NOT NULL,
  _airbyte_data         JSONB NOT NULL
);

CREATE TABLE raw_ehr_patients (
  _airbyte_raw_id       UUID PRIMARY KEY,
  _airbyte_extracted_at TIMESTAMPTZ NOT NULL,
  _airbyte_loaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  _airbyte_meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  _airbyte_generation_id BIGINT NOT NULL,
  _airbyte_data         JSONB NOT NULL
);

CREATE TABLE raw_ehr_rooms (
  _airbyte_raw_id       UUID PRIMARY KEY,
  _airbyte_extracted_at TIMESTAMPTZ NOT NULL,
  _airbyte_loaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  _airbyte_meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  _airbyte_generation_id BIGINT NOT NULL,
  _airbyte_data         JSONB NOT NULL
);

CREATE TABLE raw_ehr_visits (
  _airbyte_raw_id       UUID PRIMARY KEY,
  _airbyte_extracted_at TIMESTAMPTZ NOT NULL,
  _airbyte_loaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  _airbyte_meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  _airbyte_generation_id BIGINT NOT NULL,
  _airbyte_data         JSONB NOT NULL
);

CREATE TABLE raw_billing_invoices (
  _airbyte_raw_id       UUID PRIMARY KEY,
  _airbyte_extracted_at TIMESTAMPTZ NOT NULL,
  _airbyte_loaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  _airbyte_meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  _airbyte_generation_id BIGINT NOT NULL,
  _airbyte_data         JSONB NOT NULL
);

CREATE INDEX idx_raw_dynamics_doctors_extracted ON raw_dynamics_doctors (_airbyte_extracted_at);
CREATE INDEX idx_raw_ehr_visits_extracted ON raw_ehr_visits (_airbyte_extracted_at);
CREATE INDEX idx_raw_billing_invoices_extracted ON raw_billing_invoices (_airbyte_extracted_at);

-- ---------------------------------------------------------------------------
-- Copper (typed, cleaned from raw)
-- ---------------------------------------------------------------------------

CREATE TABLE copper_specialties (
  specialty_id   INTEGER NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT,
  _execution_id  UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _loaded_at     TIMESTAMPTZ NOT NULL,
  _source_system TEXT NOT NULL DEFAULT 'dynamics',
  PRIMARY KEY (specialty_id, _execution_id)
);

CREATE TABLE copper_doctors (
  doctor_id          INTEGER NOT NULL,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  email              TEXT NOT NULL,
  phone              TEXT,
  license_number     TEXT NOT NULL,
  employment_status  TEXT NOT NULL,
  hired_at           DATE NOT NULL,
  _execution_id      UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _loaded_at         TIMESTAMPTZ NOT NULL,
  _source_system     TEXT NOT NULL DEFAULT 'dynamics',
  PRIMARY KEY (doctor_id, _execution_id)
);

CREATE TABLE copper_doctor_specialties (
  doctor_id      INTEGER NOT NULL,
  specialty_id   INTEGER NOT NULL,
  is_primary     BOOLEAN NOT NULL DEFAULT false,
  _execution_id  UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _loaded_at     TIMESTAMPTZ NOT NULL,
  _source_system TEXT NOT NULL DEFAULT 'dynamics',
  PRIMARY KEY (doctor_id, specialty_id, _execution_id)
);

CREATE TABLE copper_patients (
  patient_id         INTEGER NOT NULL,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  date_of_birth      DATE NOT NULL,
  sex                TEXT,
  email              TEXT,
  phone              TEXT,
  insurance_provider TEXT,
  _execution_id      UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _loaded_at         TIMESTAMPTZ NOT NULL,
  _source_system     TEXT NOT NULL DEFAULT 'ehr',
  PRIMARY KEY (patient_id, _execution_id)
);

CREATE TABLE copper_rooms (
  room_id        INTEGER NOT NULL,
  name           TEXT NOT NULL,
  floor          INTEGER NOT NULL,
  room_type      TEXT NOT NULL,
  _execution_id  UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _loaded_at     TIMESTAMPTZ NOT NULL,
  _source_system TEXT NOT NULL DEFAULT 'ehr',
  PRIMARY KEY (room_id, _execution_id)
);

CREATE TABLE copper_visits (
  visit_id           INTEGER NOT NULL,
  patient_id         INTEGER NOT NULL,
  doctor_id          INTEGER NOT NULL,
  room_id            INTEGER,
  scheduled_at       TIMESTAMPTZ NOT NULL,
  duration_minutes   INTEGER NOT NULL,
  visit_type         TEXT NOT NULL,
  status             TEXT NOT NULL,
  reason             TEXT,
  notes              TEXT,
  _execution_id      UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _loaded_at         TIMESTAMPTZ NOT NULL,
  _source_system     TEXT NOT NULL DEFAULT 'ehr',
  PRIMARY KEY (visit_id, _execution_id)
);

CREATE TABLE copper_invoices (
  invoice_id     INTEGER NOT NULL,
  visit_id       INTEGER NOT NULL,
  patient_id     INTEGER NOT NULL,
  amount_cents   INTEGER NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'EUR',
  status         TEXT NOT NULL,
  issued_at      DATE,
  due_at         DATE,
  paid_at        DATE,
  _execution_id  UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _loaded_at     TIMESTAMPTZ NOT NULL,
  _source_system TEXT NOT NULL DEFAULT 'billing',
  PRIMARY KEY (invoice_id, _execution_id)
);

-- ---------------------------------------------------------------------------
-- Bronze (last 2 pipeline executions retained)
-- ---------------------------------------------------------------------------

CREATE TABLE bronze_specialties (
  specialty_id   INTEGER NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT,
  _execution_id  UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _loaded_at     TIMESTAMPTZ NOT NULL,
  _source_system TEXT NOT NULL DEFAULT 'dynamics',
  PRIMARY KEY (specialty_id, _execution_id)
);

CREATE TABLE bronze_doctors (
  doctor_id          INTEGER NOT NULL,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  email              TEXT NOT NULL,
  phone              TEXT,
  license_number     TEXT NOT NULL,
  employment_status  TEXT NOT NULL,
  hired_at           DATE NOT NULL,
  _execution_id      UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _loaded_at         TIMESTAMPTZ NOT NULL,
  _source_system     TEXT NOT NULL DEFAULT 'dynamics',
  PRIMARY KEY (doctor_id, _execution_id)
);

CREATE TABLE bronze_doctor_specialties (
  doctor_id      INTEGER NOT NULL,
  specialty_id   INTEGER NOT NULL,
  is_primary     BOOLEAN NOT NULL DEFAULT false,
  _execution_id  UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _loaded_at     TIMESTAMPTZ NOT NULL,
  _source_system TEXT NOT NULL DEFAULT 'dynamics',
  PRIMARY KEY (doctor_id, specialty_id, _execution_id)
);

CREATE TABLE bronze_patients (
  patient_id         INTEGER NOT NULL,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  date_of_birth      DATE NOT NULL,
  sex                TEXT,
  email              TEXT,
  phone              TEXT,
  insurance_provider TEXT,
  _execution_id      UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _loaded_at         TIMESTAMPTZ NOT NULL,
  _source_system     TEXT NOT NULL DEFAULT 'ehr',
  PRIMARY KEY (patient_id, _execution_id)
);

CREATE TABLE bronze_rooms (
  room_id        INTEGER NOT NULL,
  name           TEXT NOT NULL,
  floor          INTEGER NOT NULL,
  room_type      TEXT NOT NULL,
  _execution_id  UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _loaded_at     TIMESTAMPTZ NOT NULL,
  _source_system TEXT NOT NULL DEFAULT 'ehr',
  PRIMARY KEY (room_id, _execution_id)
);

CREATE TABLE bronze_visits (
  visit_id           INTEGER NOT NULL,
  patient_id         INTEGER NOT NULL,
  doctor_id          INTEGER NOT NULL,
  room_id            INTEGER,
  scheduled_at       TIMESTAMPTZ NOT NULL,
  duration_minutes   INTEGER NOT NULL,
  visit_type         TEXT NOT NULL,
  status             TEXT NOT NULL,
  reason             TEXT,
  notes              TEXT,
  _execution_id      UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _loaded_at         TIMESTAMPTZ NOT NULL,
  _source_system     TEXT NOT NULL DEFAULT 'ehr',
  PRIMARY KEY (visit_id, _execution_id)
);

CREATE TABLE bronze_invoices (
  invoice_id     INTEGER NOT NULL,
  visit_id       INTEGER NOT NULL,
  patient_id     INTEGER NOT NULL,
  amount_cents   INTEGER NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'EUR',
  status         TEXT NOT NULL,
  issued_at      DATE,
  due_at         DATE,
  paid_at        DATE,
  _execution_id  UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _loaded_at     TIMESTAMPTZ NOT NULL,
  _source_system TEXT NOT NULL DEFAULT 'billing',
  PRIMARY KEY (invoice_id, _execution_id)
);

CREATE INDEX idx_bronze_doctors_execution ON bronze_doctors (_execution_id);
CREATE INDEX idx_bronze_visits_execution ON bronze_visits (_execution_id);
CREATE INDEX idx_bronze_invoices_execution ON bronze_invoices (_execution_id);

-- ---------------------------------------------------------------------------
-- Silver (current state)
-- ---------------------------------------------------------------------------

CREATE TABLE silver_specialties (
  specialty_id   INTEGER PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  description    TEXT,
  _execution_id  UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _updated_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE silver_doctors (
  doctor_id          INTEGER PRIMARY KEY,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  email              TEXT NOT NULL UNIQUE,
  phone              TEXT,
  license_number     TEXT NOT NULL UNIQUE,
  employment_status  TEXT NOT NULL CHECK (employment_status IN ('active', 'on_leave', 'inactive')),
  hired_at           DATE NOT NULL,
  _execution_id      UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _updated_at        TIMESTAMPTZ NOT NULL
);

CREATE TABLE silver_doctor_specialties (
  doctor_id      INTEGER NOT NULL REFERENCES silver_doctors (doctor_id),
  specialty_id   INTEGER NOT NULL REFERENCES silver_specialties (specialty_id),
  is_primary     BOOLEAN NOT NULL DEFAULT false,
  _execution_id  UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _updated_at    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (doctor_id, specialty_id)
);

CREATE TABLE silver_patients (
  patient_id         INTEGER PRIMARY KEY,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  date_of_birth      DATE NOT NULL,
  sex                TEXT CHECK (sex IN ('female', 'male', 'other')),
  email              TEXT,
  phone              TEXT,
  insurance_provider TEXT,
  _execution_id      UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _updated_at        TIMESTAMPTZ NOT NULL
);

CREATE TABLE silver_rooms (
  room_id        INTEGER PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  floor          INTEGER NOT NULL,
  room_type      TEXT NOT NULL CHECK (room_type IN ('consult', 'procedure', 'waiting')),
  _execution_id  UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _updated_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE silver_visits (
  visit_id           INTEGER PRIMARY KEY,
  patient_id         INTEGER NOT NULL REFERENCES silver_patients (patient_id),
  doctor_id          INTEGER NOT NULL REFERENCES silver_doctors (doctor_id),
  room_id            INTEGER REFERENCES silver_rooms (room_id),
  scheduled_at       TIMESTAMPTZ NOT NULL,
  duration_minutes   INTEGER NOT NULL CHECK (duration_minutes > 0),
  visit_type         TEXT NOT NULL CHECK (visit_type IN ('first_consult', 'follow_up', 'procedure', 'telehealth')),
  status             TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  reason             TEXT,
  notes              TEXT,
  _execution_id      UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _updated_at        TIMESTAMPTZ NOT NULL
);

CREATE TABLE silver_invoices (
  invoice_id     INTEGER PRIMARY KEY,
  visit_id       INTEGER NOT NULL UNIQUE REFERENCES silver_visits (visit_id),
  patient_id     INTEGER NOT NULL REFERENCES silver_patients (patient_id),
  amount_cents   INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency       TEXT NOT NULL DEFAULT 'EUR',
  status         TEXT NOT NULL CHECK (status IN ('draft', 'issued', 'paid', 'void', 'overdue')),
  issued_at      DATE,
  due_at         DATE,
  paid_at        DATE,
  _execution_id  UUID NOT NULL REFERENCES ops_transform_batches (execution_id),
  _updated_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_silver_visits_doctor_scheduled ON silver_visits (doctor_id, scheduled_at);
CREATE INDEX idx_silver_visits_patient ON silver_visits (patient_id);
CREATE INDEX idx_silver_visits_status ON silver_visits (status);
CREATE INDEX idx_silver_invoices_status ON silver_invoices (status);

-- ---------------------------------------------------------------------------
-- Gold (query-oriented marts + wide reporting tables)
-- ---------------------------------------------------------------------------

CREATE TABLE gold_doctor_workload (
  doctor_id            INTEGER PRIMARY KEY,
  doctor_name          TEXT NOT NULL,
  primary_specialty    TEXT,
  employment_status    TEXT NOT NULL,
  total_visits         INTEGER NOT NULL,
  completed_visits     INTEGER NOT NULL,
  cancelled_visits     INTEGER NOT NULL,
  no_show_visits       INTEGER NOT NULL,
  scheduled_visits     INTEGER NOT NULL,
  total_duration_minutes INTEGER NOT NULL,
  _refreshed_at        TIMESTAMPTZ NOT NULL
);

CREATE TABLE gold_patient_visit_summary (
  patient_id           INTEGER PRIMARY KEY,
  patient_name         TEXT NOT NULL,
  insurance_provider   TEXT,
  total_visits         INTEGER NOT NULL,
  completed_visits     INTEGER NOT NULL,
  last_visit_at        TIMESTAMPTZ,
  next_scheduled_at    TIMESTAMPTZ,
  lifetime_spend_cents INTEGER NOT NULL DEFAULT 0,
  _refreshed_at        TIMESTAMPTZ NOT NULL
);

CREATE TABLE gold_revenue_by_specialty (
  specialty_id         INTEGER PRIMARY KEY,
  specialty_name       TEXT NOT NULL,
  invoice_count        INTEGER NOT NULL,
  paid_amount_cents    INTEGER NOT NULL,
  outstanding_cents    INTEGER NOT NULL,
  void_amount_cents    INTEGER NOT NULL,
  _refreshed_at        TIMESTAMPTZ NOT NULL
);

CREATE TABLE gold_visits_mart (
  visit_id             INTEGER PRIMARY KEY,
  scheduled_at         TIMESTAMPTZ NOT NULL,
  duration_minutes     INTEGER NOT NULL,
  visit_type           TEXT NOT NULL,
  visit_status         TEXT NOT NULL,
  reason               TEXT,
  patient_id           INTEGER NOT NULL,
  patient_name         TEXT NOT NULL,
  patient_dob          DATE NOT NULL,
  patient_insurance    TEXT,
  doctor_id            INTEGER NOT NULL,
  doctor_name          TEXT NOT NULL,
  doctor_status        TEXT NOT NULL,
  primary_specialty    TEXT,
  room_id              INTEGER,
  room_name            TEXT,
  room_type            TEXT,
  invoice_id           INTEGER,
  invoice_status       TEXT,
  amount_cents         INTEGER,
  currency             TEXT,
  _refreshed_at        TIMESTAMPTZ NOT NULL
);

CREATE TABLE gold_invoices_mart (
  invoice_id           INTEGER PRIMARY KEY,
  invoice_status       TEXT NOT NULL,
  amount_cents         INTEGER NOT NULL,
  currency             TEXT NOT NULL,
  issued_at            DATE,
  due_at               DATE,
  paid_at              DATE,
  visit_id             INTEGER NOT NULL,
  visit_type           TEXT NOT NULL,
  visit_status         TEXT NOT NULL,
  scheduled_at         TIMESTAMPTZ NOT NULL,
  patient_id           INTEGER NOT NULL,
  patient_name         TEXT NOT NULL,
  doctor_id            INTEGER NOT NULL,
  doctor_name          TEXT NOT NULL,
  primary_specialty    TEXT,
  _refreshed_at        TIMESTAMPTZ NOT NULL
);
