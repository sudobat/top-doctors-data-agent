-- Overlay on top of the healthy seed: two realistic pipeline failure modes.
--
-- 1) Duplicate job runs (Cardiology / doctor_id = 1):
--    Same logical 2026-09-27 batch was cleared/retried twice more (3 total).
--    Incremental silver_visits appended Cardiology rows again with offset IDs
--    (+1000, +2000), so group-bys for Cardiology / Elena Vargas run high.
--
-- 2) Transform error (Neurology / doctor_id = 6):
--    dbt silver_visits failed mid-merge on Neurology rows; a follow-up run
--    "succeeded" after an incorrect exclude, leaving Neurology missing from
--    silver/gold while bronze/copper/raw still hold the full set.
--
-- Ops tables retain the failed invocation, retries, and extra syncs for diagnosis.

CREATE TEMP TABLE _err_ids AS
SELECT
  '11111111-1111-4111-8111-111111111101'::uuid AS exec_prev,
  '11111111-1111-4111-8111-111111111102'::uuid AS exec_curr,
  -- Intermediate clear/rerun that bronze already pruned (ops only)
  '11111111-1111-4111-8111-111111111103'::uuid AS exec_dup_mid,
  '22222222-2222-4222-8222-222222222212'::uuid AS sync_ehr_curr,
  '22222222-2222-4222-8222-222222222213'::uuid AS sync_ehr_dup2,
  '22222222-2222-4222-8222-222222222214'::uuid AS sync_ehr_dup3,
  '22222222-2222-4222-8222-222222222222'::uuid AS sync_billing_curr,
  '33333333-3333-4333-8333-333333333302'::uuid AS conn_ehr,
  '44444444-4444-4444-8444-444444444402'::uuid AS dbt_curr,
  '44444444-4444-4444-8444-444444444403'::uuid AS dbt_dup_mid,
  '44444444-4444-4444-8444-444444444404'::uuid AS dbt_fail_neuro,
  '44444444-4444-4444-8444-444444444405'::uuid AS dbt_partial_neuro,
  TIMESTAMPTZ '2026-09-27 03:15:00+00' AS ts_curr;

-- ---------------------------------------------------------------------------
-- Ops: duplicate EHR syncs + Airflow clear/reruns for the same logical day
-- ---------------------------------------------------------------------------

INSERT INTO ops_airbyte_syncs (
  sync_id, connection_id, status, started_at, ended_at,
  records_emitted, records_committed, bytes_committed, attempt_number, failure_reason
)
SELECT sync_ehr_dup2, conn_ehr, 'succeeded',
       ts_curr + INTERVAL '10 minutes' + INTERVAL '45 minutes',
       ts_curr + INTERVAL '28 minutes' + INTERVAL '45 minutes',
       103, 103, 960000, 1, NULL
FROM _err_ids
UNION ALL
SELECT sync_ehr_dup3, conn_ehr, 'succeeded',
       ts_curr + INTERVAL '10 minutes' + INTERVAL '95 minutes',
       ts_curr + INTERVAL '29 minutes' + INTERVAL '95 minutes',
       103, 103, 962400, 1, NULL
FROM _err_ids;

-- Keep stream state pointing at the latest (third) sync wall-clock
UPDATE ops_airbyte_stream_states s
SET state_json = jsonb_build_object('cdc', jsonb_build_object('lsn', '0/2A1D880')),
    updated_at = i.ts_curr + INTERVAL '125 minutes'
FROM _err_ids i
WHERE s.connection_id = i.conn_ehr
  AND s.stream_name = 'visits';

INSERT INTO ops_dbt_invocations (
  invocation_id, dbt_version, project_name, target_name,
  started_at, ended_at, status, command, args
)
SELECT dbt_dup_mid, '1.8.7', 'clinic_medallion', 'prod',
       ts_curr + INTERVAL '90 minutes', ts_curr + INTERVAL '108 minutes',
       'success', 'build',
       '["--select","copper+","bronze+","silver+","gold+"]'::jsonb
FROM _err_ids
UNION ALL
SELECT dbt_fail_neuro, '1.8.7', 'clinic_medallion', 'prod',
       ts_curr + INTERVAL '140 minutes', ts_curr + INTERVAL '147 minutes',
       'error', 'build',
       '["--select","silver_visits","silver_invoices","gold+"]'::jsonb
FROM _err_ids
UNION ALL
SELECT dbt_partial_neuro, '1.8.7', 'clinic_medallion', 'prod',
       ts_curr + INTERVAL '155 minutes', ts_curr + INTERVAL '172 minutes',
       'partial', 'build',
       '["--select","silver_visits","silver_invoices","gold+","--exclude","tag:neurology"]'::jsonb
FROM _err_ids;

INSERT INTO ops_airflow_dag_runs (
  dag_id, run_id, execution_date, state, start_date, end_date, external_trigger, conf
)
SELECT 'clinic_medallion_daily',
       'manual__2026-09-27T04:00:00+00:00',
       ts_curr - INTERVAL '15 minutes',
       'success',
       ts_curr + INTERVAL '80 minutes',
       ts_curr + INTERVAL '115 minutes',
       true,
       jsonb_build_object(
         'execution_id', exec_dup_mid,
         'note', 'Clear + rerun after on-call suspected stale Airbyte cursor'
       )
FROM _err_ids
UNION ALL
SELECT 'clinic_medallion_daily',
       'manual__2026-09-27T05:30:00+00:00',
       ts_curr - INTERVAL '15 minutes',
       'failed',
       ts_curr + INTERVAL '130 minutes',
       ts_curr + INTERVAL '150 minutes',
       true,
       jsonb_build_object(
         'execution_id', exec_curr,
         'note', 'Second clear/rerun; silver_visits errored on Neurology merge'
       )
FROM _err_ids
UNION ALL
SELECT 'clinic_medallion_daily',
       'manual__2026-09-27T05:55:00+00:00',
       ts_curr - INTERVAL '15 minutes',
       'success',
       ts_curr + INTERVAL '152 minutes',
       ts_curr + INTERVAL '178 minutes',
       true,
       jsonb_build_object(
         'execution_id', exec_curr,
         'note', 'Hotfix rerun with --exclude tag:neurology; marked success incorrectly'
       )
FROM _err_ids;

INSERT INTO ops_airflow_task_instances (
  dag_id, run_id, task_id, try_number, state, start_date, end_date, duration_seconds, operator
)
SELECT * FROM (
  SELECT 'clinic_medallion_daily' AS dag_id,
         r.run_id,
         t.task_id,
         1 AS try_number,
         t.state,
         i.ts_curr + r.base_offset + t.offset_start AS start_date,
         i.ts_curr + r.base_offset + t.offset_end AS end_date,
         EXTRACT(EPOCH FROM t.offset_end - t.offset_start)::numeric(10, 3) AS duration_seconds,
         t.operator
  FROM _err_ids i
  CROSS JOIN (VALUES
    ('manual__2026-09-27T04:00:00+00:00', INTERVAL '80 minutes'),
    ('manual__2026-09-27T05:55:00+00:00', INTERVAL '152 minutes')
  ) AS r(run_id, base_offset)
  CROSS JOIN (VALUES
    ('wait_airbyte_syncs', INTERVAL '0 minutes', INTERVAL '20 minutes', 'success', 'ExternalTaskSensor'),
    ('dbt_copper', INTERVAL '22 minutes', INTERVAL '26 minutes', 'success', 'BashOperator'),
    ('dbt_bronze', INTERVAL '26 minutes', INTERVAL '29 minutes', 'success', 'BashOperator'),
    ('dbt_silver', INTERVAL '29 minutes', INTERVAL '33 minutes', 'success', 'BashOperator'),
    ('dbt_gold', INTERVAL '33 minutes', INTERVAL '36 minutes', 'success', 'BashOperator')
  ) AS t(task_id, offset_start, offset_end, state, operator)
) ok_runs
UNION ALL
SELECT * FROM (
  SELECT 'clinic_medallion_daily',
         'manual__2026-09-27T05:30:00+00:00',
         t.task_id,
         t.try_number,
         t.state,
         i.ts_curr + INTERVAL '130 minutes' + t.offset_start,
         i.ts_curr + INTERVAL '130 minutes' + t.offset_end,
         EXTRACT(EPOCH FROM t.offset_end - t.offset_start)::numeric(10, 3),
         t.operator
  FROM _err_ids i
  CROSS JOIN (VALUES
    ('wait_airbyte_syncs', 1, INTERVAL '0 minutes', INTERVAL '8 minutes', 'success', 'ExternalTaskSensor'),
    ('dbt_copper', 1, INTERVAL '10 minutes', INTERVAL '12 minutes', 'success', 'BashOperator'),
    ('dbt_bronze', 1, INTERVAL '12 minutes', INTERVAL '14 minutes', 'success', 'BashOperator'),
    ('dbt_silver', 1, INTERVAL '14 minutes', INTERVAL '17 minutes', 'failed', 'BashOperator'),
    ('dbt_silver', 2, INTERVAL '18 minutes', INTERVAL '19 minutes', 'failed', 'BashOperator'),
    ('dbt_gold', 1, INTERVAL '19 minutes', INTERVAL '19 minutes', 'skipped', 'BashOperator')
  ) AS t(task_id, try_number, offset_start, offset_end, state, operator)
) failed_run;

INSERT INTO ops_transform_batches (
  execution_id, batch_label, layer_from, layer_to, started_at, ended_at, status,
  airbyte_sync_id, airflow_run_id, dbt_invocation_id
)
SELECT exec_dup_mid, 'batch_2026_09_27_rerun1', 'raw', 'gold',
       ts_curr + INTERVAL '100 minutes', ts_curr + INTERVAL '115 minutes', 'succeeded',
       sync_ehr_dup2, 'manual__2026-09-27T04:00:00+00:00', dbt_dup_mid
FROM _err_ids;

-- Point the retained curr batch at the last (buggy) partial invocation + third sync
UPDATE ops_transform_batches b
SET ended_at = i.ts_curr + INTERVAL '178 minutes',
    status = 'succeeded',
    airbyte_sync_id = i.sync_ehr_dup3,
    airflow_run_id = 'manual__2026-09-27T05:55:00+00:00',
    dbt_invocation_id = i.dbt_partial_neuro
FROM _err_ids i
WHERE b.execution_id = i.exec_curr;

INSERT INTO ops_dbt_run_results (
  invocation_id, unique_id, name, resource_type, status,
  execution_time, rows_affected, message, materialized
)
SELECT dbt_dup_mid, 'model.clinic_medallion.silver_visits', 'silver_visits', 'model', 'success',
       2.6, 86, 'Incremental append; Cardiology visit_ids offset +1000 re-inserted', 'table'
FROM _err_ids
UNION ALL
SELECT dbt_dup_mid, 'model.clinic_medallion.gold_revenue_by_specialty', 'gold_revenue_by_specialty', 'model', 'success',
       1.1, 12, NULL, 'table'
FROM _err_ids
UNION ALL
SELECT dbt_fail_neuro, 'model.clinic_medallion.silver_visits', 'silver_visits', 'model', 'error',
       1.4, NULL,
       'Database Error in model silver_visits (models/silver/visits.sql) line 88: null value in column "duration_minutes" of relation "silver_visits" violates not-null constraint. Failing rows were Neurology visits for doctor_id=6 (Lukas Meyer) after join to stg_neurology_overrides.',
       'table'
FROM _err_ids
UNION ALL
SELECT dbt_fail_neuro, 'model.clinic_medallion.silver_invoices', 'silver_invoices', 'model', 'skipped',
       0.0, NULL, 'Skipped due to upstream silver_visits error', 'table'
FROM _err_ids
UNION ALL
SELECT dbt_fail_neuro, 'model.clinic_medallion.gold_visits_mart', 'gold_visits_mart', 'model', 'skipped',
       0.0, NULL, 'Skipped due to upstream silver_visits error', 'table'
FROM _err_ids
UNION ALL
SELECT dbt_partial_neuro, 'model.clinic_medallion.silver_visits', 'silver_visits', 'model', 'success',
       2.0, 64,
       'Completed with --exclude tag:neurology. Neurology rows removed from silver to unblock DAG; bronze/copper unchanged.',
       'table'
FROM _err_ids
UNION ALL
SELECT dbt_partial_neuro, 'model.clinic_medallion.silver_invoices', 'silver_invoices', 'model', 'success',
       1.1, 64, NULL, 'table'
FROM _err_ids
UNION ALL
SELECT dbt_partial_neuro, 'model.clinic_medallion.gold_doctor_workload', 'gold_doctor_workload', 'model', 'success',
       0.9, 10, NULL, 'table'
FROM _err_ids
UNION ALL
SELECT dbt_partial_neuro, 'model.clinic_medallion.gold_revenue_by_specialty', 'gold_revenue_by_specialty', 'model', 'success',
       1.0, 12, NULL, 'table'
FROM _err_ids
UNION ALL
SELECT dbt_partial_neuro, 'test.clinic_medallion.unique_silver_doctors_doctor_id', 'unique_silver_doctors_doctor_id', 'test', 'pass',
       0.2, NULL, NULL, NULL
FROM _err_ids;

-- Mark the original healthy curr invocation as superseded in messaging
UPDATE ops_dbt_run_results r
SET message = 'Superseded by later clear/reruns on 2026-09-27; see invocations 44444444-...404 / ...405'
FROM _err_ids i
WHERE r.invocation_id = i.dbt_curr
  AND r.name = 'silver_visits';

-- ---------------------------------------------------------------------------
-- Failure 1 data: duplicate Cardiology visits (doctor_id = 1) x2 extra copies
-- ---------------------------------------------------------------------------

INSERT INTO silver_visits (
  visit_id, patient_id, doctor_id, room_id, scheduled_at, duration_minutes,
  visit_type, status, reason, notes, _execution_id, _updated_at
)
SELECT
  v.visit_id + off.offset_id,
  v.patient_id,
  v.doctor_id,
  v.room_id,
  v.scheduled_at,
  v.duration_minutes,
  v.visit_type,
  v.status,
  v.reason,
  COALESCE(v.notes, '') || ' [dup pipeline rerun offset ' || off.offset_id || ']',
  i.exec_curr,
  i.ts_curr + INTERVAL '178 minutes'
FROM silver_visits v
CROSS JOIN _err_ids i
CROSS JOIN (VALUES (1000), (2000)) AS off(offset_id)
WHERE v.doctor_id = 1
  AND v.visit_id < 1000;

INSERT INTO silver_invoices (
  invoice_id, visit_id, patient_id, amount_cents, currency, status,
  issued_at, due_at, paid_at, _execution_id, _updated_at
)
SELECT
  inv.invoice_id + off.offset_id,
  inv.visit_id + off.offset_id,
  inv.patient_id,
  inv.amount_cents,
  inv.currency,
  inv.status,
  inv.issued_at,
  inv.due_at,
  inv.paid_at,
  i.exec_curr,
  i.ts_curr + INTERVAL '178 minutes'
FROM silver_invoices inv
CROSS JOIN _err_ids i
CROSS JOIN (VALUES (1000), (2000)) AS off(offset_id)
WHERE inv.visit_id IN (SELECT visit_id FROM silver_visits WHERE doctor_id = 1 AND visit_id < 1000);

INSERT INTO bronze_visits (
  visit_id, patient_id, doctor_id, room_id, scheduled_at, duration_minutes,
  visit_type, status, reason, notes, _execution_id, _loaded_at, _source_system
)
SELECT
  v.visit_id, v.patient_id, v.doctor_id, v.room_id, v.scheduled_at, v.duration_minutes,
  v.visit_type, v.status, v.reason, v.notes, v._execution_id,
  i.ts_curr + INTERVAL '178 minutes', 'ehr'
FROM silver_visits v
CROSS JOIN _err_ids i
WHERE v.doctor_id = 1
  AND v.visit_id >= 1000;

INSERT INTO bronze_invoices (
  invoice_id, visit_id, patient_id, amount_cents, currency, status,
  issued_at, due_at, paid_at, _execution_id, _loaded_at, _source_system
)
SELECT
  inv.invoice_id, inv.visit_id, inv.patient_id, inv.amount_cents, inv.currency, inv.status,
  inv.issued_at, inv.due_at, inv.paid_at, inv._execution_id,
  i.ts_curr + INTERVAL '178 minutes', 'billing'
FROM silver_invoices inv
CROSS JOIN _err_ids i
WHERE inv.visit_id >= 1000;

INSERT INTO copper_visits (
  visit_id, patient_id, doctor_id, room_id, scheduled_at, duration_minutes,
  visit_type, status, reason, notes, _execution_id, _loaded_at, _source_system
)
SELECT
  visit_id, patient_id, doctor_id, room_id, scheduled_at, duration_minutes,
  visit_type, status, reason, notes, _execution_id, _loaded_at, _source_system
FROM bronze_visits
WHERE visit_id >= 1000
  AND _execution_id = (SELECT exec_curr FROM _err_ids);

INSERT INTO copper_invoices (
  invoice_id, visit_id, patient_id, amount_cents, currency, status,
  issued_at, due_at, paid_at, _execution_id, _loaded_at, _source_system
)
SELECT
  invoice_id, visit_id, patient_id, amount_cents, currency, status,
  issued_at, due_at, paid_at, _execution_id, _loaded_at, _source_system
FROM bronze_invoices
WHERE visit_id >= 1000
  AND _execution_id = (SELECT exec_curr FROM _err_ids);

-- Raw: same Cardiology business keys landed three times (original + 2 sync reruns)
INSERT INTO raw_ehr_visits (
  _airbyte_raw_id, _airbyte_extracted_at, _airbyte_loaded_at, _airbyte_meta,
  _airbyte_generation_id, _airbyte_data
)
SELECT
  gen_random_uuid(),
  i.ts_curr + CASE s.sync_n WHEN 2 THEN INTERVAL '55 minutes' ELSE INTERVAL '105 minutes' END,
  i.ts_curr + CASE s.sync_n WHEN 2 THEN INTERVAL '56 minutes' ELSE INTERVAL '106 minutes' END,
  jsonb_build_object(
    'sync_id', CASE s.sync_n WHEN 2 THEN i.sync_ehr_dup2 ELSE i.sync_ehr_dup3 END,
    'duplicate_of_visit_id', v.visit_id,
    'pipeline_anomaly', 'airbyte_full_refresh_append'
  ),
  CASE s.sync_n WHEN 2 THEN 3 ELSE 4 END,
  jsonb_build_object(
    'visit_id', v.visit_id,
    'patient_id', v.patient_id,
    'doctor_id', v.doctor_id,
    'room_id', v.room_id,
    'scheduled_at', v.scheduled_at,
    'duration_minutes', v.duration_minutes,
    'visit_type', v.visit_type,
    'status', v.status,
    'reason', v.reason,
    'notes', v.notes
  )
FROM silver_visits v
CROSS JOIN _err_ids i
CROSS JOIN (VALUES (2), (3)) AS s(sync_n)
WHERE v.doctor_id = 1
  AND v.visit_id < 1000;

INSERT INTO raw_billing_invoices (
  _airbyte_raw_id, _airbyte_extracted_at, _airbyte_loaded_at, _airbyte_meta,
  _airbyte_generation_id, _airbyte_data
)
SELECT
  gen_random_uuid(),
  i.ts_curr + INTERVAL '110 minutes',
  i.ts_curr + INTERVAL '111 minutes',
  jsonb_build_object(
    'sync_id', i.sync_billing_curr,
    'duplicate_of_invoice_id', inv.invoice_id,
    'pipeline_anomaly', 'downstream_of_ehr_rerun'
  ),
  3,
  jsonb_build_object(
    'invoice_id', inv.invoice_id,
    'visit_id', inv.visit_id,
    'patient_id', inv.patient_id,
    'amount_cents', inv.amount_cents,
    'currency', inv.currency,
    'status', inv.status,
    'issued_at', inv.issued_at,
    'due_at', inv.due_at,
    'paid_at', inv.paid_at
  )
FROM silver_invoices inv
JOIN silver_visits v ON v.visit_id = inv.visit_id
CROSS JOIN _err_ids i
WHERE v.doctor_id = 1
  AND inv.visit_id < 1000;

-- ---------------------------------------------------------------------------
-- Failure 2 data: drop Neurology (doctor_id = 6) from silver only
-- bronze / copper / raw retain the rows for layer comparison
-- ---------------------------------------------------------------------------

DELETE FROM silver_invoices
WHERE visit_id IN (SELECT visit_id FROM silver_visits WHERE doctor_id = 6);

DELETE FROM silver_visits
WHERE doctor_id = 6;

-- ---------------------------------------------------------------------------
-- Rebuild gold marts from the corrupted silver current state
-- ---------------------------------------------------------------------------

TRUNCATE TABLE
  gold_invoices_mart,
  gold_visits_mart,
  gold_revenue_by_specialty,
  gold_patient_visit_summary,
  gold_doctor_workload;

INSERT INTO gold_doctor_workload (
  doctor_id, doctor_name, primary_specialty, employment_status,
  total_visits, completed_visits, cancelled_visits, no_show_visits, scheduled_visits,
  total_duration_minutes, _refreshed_at
)
SELECT
  d.doctor_id,
  d.first_name || ' ' || d.last_name,
  sp.name,
  d.employment_status,
  COUNT(v.visit_id)::int,
  COUNT(*) FILTER (WHERE v.status = 'completed')::int,
  COUNT(*) FILTER (WHERE v.status = 'cancelled')::int,
  COUNT(*) FILTER (WHERE v.status = 'no_show')::int,
  COUNT(*) FILTER (WHERE v.status = 'scheduled')::int,
  COALESCE(SUM(v.duration_minutes), 0)::int,
  i.ts_curr + INTERVAL '178 minutes'
FROM silver_doctors d
CROSS JOIN _err_ids i
LEFT JOIN silver_visits v ON v.doctor_id = d.doctor_id
LEFT JOIN silver_doctor_specialties ds ON ds.doctor_id = d.doctor_id AND ds.is_primary
LEFT JOIN silver_specialties sp ON sp.specialty_id = ds.specialty_id
GROUP BY d.doctor_id, d.first_name, d.last_name, sp.name, d.employment_status, i.ts_curr;

INSERT INTO gold_patient_visit_summary (
  patient_id, patient_name, insurance_provider, total_visits, completed_visits,
  last_visit_at, next_scheduled_at, lifetime_spend_cents, _refreshed_at
)
SELECT
  p.patient_id,
  p.first_name || ' ' || p.last_name,
  p.insurance_provider,
  COUNT(v.visit_id)::int,
  COUNT(*) FILTER (WHERE v.status = 'completed')::int,
  MAX(v.scheduled_at) FILTER (WHERE v.status = 'completed'),
  MIN(v.scheduled_at) FILTER (WHERE v.status = 'scheduled'),
  COALESCE(SUM(inv.amount_cents) FILTER (WHERE inv.status = 'paid'), 0)::int,
  i.ts_curr + INTERVAL '178 minutes'
FROM silver_patients p
CROSS JOIN _err_ids i
LEFT JOIN silver_visits v ON v.patient_id = p.patient_id
LEFT JOIN silver_invoices inv ON inv.patient_id = p.patient_id
GROUP BY p.patient_id, p.first_name, p.last_name, p.insurance_provider, i.ts_curr;

INSERT INTO gold_revenue_by_specialty (
  specialty_id, specialty_name, invoice_count, paid_amount_cents,
  outstanding_cents, void_amount_cents, _refreshed_at
)
SELECT
  sp.specialty_id,
  sp.name,
  COUNT(inv.invoice_id)::int,
  COALESCE(SUM(inv.amount_cents) FILTER (WHERE inv.status = 'paid'), 0)::int,
  COALESCE(SUM(inv.amount_cents) FILTER (WHERE inv.status IN ('issued', 'overdue')), 0)::int,
  COALESCE(SUM(inv.amount_cents) FILTER (WHERE inv.status = 'void'), 0)::int,
  i.ts_curr + INTERVAL '178 minutes'
FROM silver_specialties sp
CROSS JOIN _err_ids i
LEFT JOIN silver_doctor_specialties ds ON ds.specialty_id = sp.specialty_id AND ds.is_primary
LEFT JOIN silver_visits v ON v.doctor_id = ds.doctor_id
LEFT JOIN silver_invoices inv ON inv.visit_id = v.visit_id
GROUP BY sp.specialty_id, sp.name, i.ts_curr;

INSERT INTO gold_visits_mart (
  visit_id, scheduled_at, duration_minutes, visit_type, visit_status, reason,
  patient_id, patient_name, patient_dob, patient_insurance,
  doctor_id, doctor_name, doctor_status, primary_specialty,
  room_id, room_name, room_type,
  invoice_id, invoice_status, amount_cents, currency, _refreshed_at
)
SELECT
  v.visit_id,
  v.scheduled_at,
  v.duration_minutes,
  v.visit_type,
  v.status,
  v.reason,
  p.patient_id,
  p.first_name || ' ' || p.last_name,
  p.date_of_birth,
  p.insurance_provider,
  d.doctor_id,
  d.first_name || ' ' || d.last_name,
  d.employment_status,
  sp.name,
  r.room_id,
  r.name,
  r.room_type,
  inv.invoice_id,
  inv.status,
  inv.amount_cents,
  inv.currency,
  i.ts_curr + INTERVAL '178 minutes'
FROM silver_visits v
CROSS JOIN _err_ids i
JOIN silver_patients p ON p.patient_id = v.patient_id
JOIN silver_doctors d ON d.doctor_id = v.doctor_id
LEFT JOIN silver_rooms r ON r.room_id = v.room_id
LEFT JOIN silver_doctor_specialties ds ON ds.doctor_id = d.doctor_id AND ds.is_primary
LEFT JOIN silver_specialties sp ON sp.specialty_id = ds.specialty_id
LEFT JOIN silver_invoices inv ON inv.visit_id = v.visit_id;

INSERT INTO gold_invoices_mart (
  invoice_id, invoice_status, amount_cents, currency, issued_at, due_at, paid_at,
  visit_id, visit_type, visit_status, scheduled_at,
  patient_id, patient_name, doctor_id, doctor_name, primary_specialty, _refreshed_at
)
SELECT
  inv.invoice_id,
  inv.status,
  inv.amount_cents,
  inv.currency,
  inv.issued_at,
  inv.due_at,
  inv.paid_at,
  v.visit_id,
  v.visit_type,
  v.status,
  v.scheduled_at,
  p.patient_id,
  p.first_name || ' ' || p.last_name,
  d.doctor_id,
  d.first_name || ' ' || d.last_name,
  sp.name,
  i.ts_curr + INTERVAL '178 minutes'
FROM silver_invoices inv
CROSS JOIN _err_ids i
JOIN silver_visits v ON v.visit_id = inv.visit_id
JOIN silver_patients p ON p.patient_id = inv.patient_id
JOIN silver_doctors d ON d.doctor_id = v.doctor_id
LEFT JOIN silver_doctor_specialties ds ON ds.doctor_id = d.doctor_id AND ds.is_primary
LEFT JOIN silver_specialties sp ON sp.specialty_id = ds.specialty_id;
