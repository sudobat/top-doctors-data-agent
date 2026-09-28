-- Seed medallion layers from a shared clinic domain snapshot.
-- Bronze retains exactly two transform batches (prev + curr).

TRUNCATE TABLE
  gold_invoices_mart,
  gold_visits_mart,
  gold_revenue_by_specialty,
  gold_patient_visit_summary,
  gold_doctor_workload,
  silver_invoices,
  silver_visits,
  silver_doctor_specialties,
  silver_doctors,
  silver_patients,
  silver_rooms,
  silver_specialties,
  bronze_invoices,
  bronze_visits,
  bronze_doctor_specialties,
  bronze_doctors,
  bronze_patients,
  bronze_rooms,
  bronze_specialties,
  copper_invoices,
  copper_visits,
  copper_doctor_specialties,
  copper_doctors,
  copper_patients,
  copper_rooms,
  copper_specialties,
  raw_billing_invoices,
  raw_ehr_visits,
  raw_ehr_rooms,
  raw_ehr_patients,
  raw_dynamics_doctor_specialties,
  raw_dynamics_doctors,
  raw_dynamics_specialties,
  ops_dbt_run_results,
  ops_transform_batches,
  ops_dbt_invocations,
  ops_airflow_task_instances,
  ops_airflow_dag_runs,
  ops_airbyte_stream_states,
  ops_airbyte_syncs,
  ops_airbyte_connections
RESTART IDENTITY CASCADE;

-- Stable IDs for the two retained executions
-- prev: 2026-09-20 batch | curr: 2026-09-27 batch
CREATE TEMP TABLE _ids AS
SELECT
  '11111111-1111-4111-8111-111111111101'::uuid AS exec_prev,
  '11111111-1111-4111-8111-111111111102'::uuid AS exec_curr,
  '22222222-2222-4222-8222-222222222201'::uuid AS sync_dynamics_prev,
  '22222222-2222-4222-8222-222222222202'::uuid AS sync_dynamics_curr,
  '22222222-2222-4222-8222-222222222211'::uuid AS sync_ehr_prev,
  '22222222-2222-4222-8222-222222222212'::uuid AS sync_ehr_curr,
  '22222222-2222-4222-8222-222222222221'::uuid AS sync_billing_prev,
  '22222222-2222-4222-8222-222222222222'::uuid AS sync_billing_curr,
  '33333333-3333-4333-8333-333333333301'::uuid AS conn_dynamics,
  '33333333-3333-4333-8333-333333333302'::uuid AS conn_ehr,
  '33333333-3333-4333-8333-333333333303'::uuid AS conn_billing,
  '44444444-4444-4444-8444-444444444401'::uuid AS dbt_prev,
  '44444444-4444-4444-8444-444444444402'::uuid AS dbt_curr,
  TIMESTAMPTZ '2026-09-20 03:15:00+00' AS ts_prev,
  TIMESTAMPTZ '2026-09-27 03:15:00+00' AS ts_curr;

-- ---------------------------------------------------------------------------
-- Ops metadata
-- ---------------------------------------------------------------------------

INSERT INTO ops_airbyte_connections (connection_id, name, source_type, destination, status, created_at)
SELECT conn_dynamics, 'dynamics_to_bq', 'dynamics', 'bigquery', 'active', ts_prev - INTERVAL '90 days' FROM _ids
UNION ALL
SELECT conn_ehr, 'ehr_to_bq', 'postgres', 'bigquery', 'active', ts_prev - INTERVAL '90 days' FROM _ids
UNION ALL
SELECT conn_billing, 'billing_to_bq', 'stripe_export', 'bigquery', 'active', ts_prev - INTERVAL '60 days' FROM _ids;

INSERT INTO ops_airbyte_syncs (
  sync_id, connection_id, status, started_at, ended_at,
  records_emitted, records_committed, bytes_committed, attempt_number
)
SELECT sync_dynamics_prev, conn_dynamics, 'succeeded', ts_prev, ts_prev + INTERVAL '8 minutes', 35, 35, 120000, 1 FROM _ids
UNION ALL
SELECT sync_dynamics_curr, conn_dynamics, 'succeeded', ts_curr, ts_curr + INTERVAL '7 minutes', 35, 35, 121500, 1 FROM _ids
UNION ALL
SELECT sync_ehr_prev, conn_ehr, 'succeeded', ts_prev + INTERVAL '10 minutes', ts_prev + INTERVAL '25 minutes', 93, 93, 890000, 1 FROM _ids
UNION ALL
SELECT sync_ehr_curr, conn_ehr, 'succeeded', ts_curr + INTERVAL '10 minutes', ts_curr + INTERVAL '28 minutes', 103, 103, 960000, 1 FROM _ids
UNION ALL
SELECT sync_billing_prev, conn_billing, 'succeeded', ts_prev + INTERVAL '30 minutes', ts_prev + INTERVAL '36 minutes', 60, 60, 210000, 1 FROM _ids
UNION ALL
SELECT sync_billing_curr, conn_billing, 'succeeded', ts_curr + INTERVAL '30 minutes', ts_curr + INTERVAL '37 minutes', 70, 70, 245000, 1 FROM _ids;

INSERT INTO ops_airbyte_stream_states (connection_id, stream_name, namespace, state_json, updated_at)
SELECT conn_dynamics, 'specialties', 'dynamics', jsonb_build_object('cursor', '2026-09-27T03:15:00Z'), ts_curr FROM _ids
UNION ALL
SELECT conn_dynamics, 'doctors', 'dynamics', jsonb_build_object('cursor', '2026-09-27T03:15:00Z'), ts_curr FROM _ids
UNION ALL
SELECT conn_dynamics, 'doctor_specialties', 'dynamics', jsonb_build_object('cursor', '2026-09-27T03:15:00Z'), ts_curr FROM _ids
UNION ALL
SELECT conn_ehr, 'patients', 'ehr', jsonb_build_object('cdc', jsonb_build_object('lsn', '0/2A1B0F0')), ts_curr FROM _ids
UNION ALL
SELECT conn_ehr, 'rooms', 'ehr', jsonb_build_object('cdc', jsonb_build_object('lsn', '0/2A1B0F0')), ts_curr FROM _ids
UNION ALL
SELECT conn_ehr, 'visits', 'ehr', jsonb_build_object('cdc', jsonb_build_object('lsn', '0/2A1C440')), ts_curr FROM _ids
UNION ALL
SELECT conn_billing, 'invoices', 'billing', jsonb_build_object('updated_at', '2026-09-27T03:45:00Z'), ts_curr FROM _ids;

INSERT INTO ops_dbt_invocations (invocation_id, dbt_version, project_name, target_name, started_at, ended_at, status, command, args)
SELECT dbt_prev, '1.8.7', 'clinic_medallion', 'prod', ts_prev + INTERVAL '45 minutes', ts_prev + INTERVAL '62 minutes', 'success', 'build', '["--select","copper+","bronze+","silver+","gold+"]'::jsonb FROM _ids
UNION ALL
SELECT dbt_curr, '1.8.7', 'clinic_medallion', 'prod', ts_curr + INTERVAL '45 minutes', ts_curr + INTERVAL '64 minutes', 'success', 'build', '["--select","copper+","bronze+","silver+","gold+"]'::jsonb FROM _ids;

INSERT INTO ops_airflow_dag_runs (dag_id, run_id, execution_date, state, start_date, end_date, external_trigger, conf)
SELECT 'clinic_medallion_daily', 'scheduled__2026-09-20T03:00:00+00:00', ts_prev - INTERVAL '15 minutes', 'success',
       ts_prev - INTERVAL '10 minutes', ts_prev + INTERVAL '70 minutes', false,
       jsonb_build_object('execution_id', exec_prev) FROM _ids
UNION ALL
SELECT 'clinic_medallion_daily', 'scheduled__2026-09-27T03:00:00+00:00', ts_curr - INTERVAL '15 minutes', 'success',
       ts_curr - INTERVAL '10 minutes', ts_curr + INTERVAL '72 minutes', false,
       jsonb_build_object('execution_id', exec_curr) FROM _ids;

INSERT INTO ops_airflow_task_instances (dag_id, run_id, task_id, try_number, state, start_date, end_date, duration_seconds, operator)
SELECT * FROM (
  SELECT 'clinic_medallion_daily' AS dag_id,
         'scheduled__2026-09-20T03:00:00+00:00' AS run_id,
         t.task_id,
         1 AS try_number,
         'success' AS state,
         i.ts_prev + t.offset_start AS start_date,
         i.ts_prev + t.offset_end AS end_date,
         EXTRACT(EPOCH FROM t.offset_end - t.offset_start)::numeric(10, 3) AS duration_seconds,
         t.operator
  FROM _ids i
  CROSS JOIN (VALUES
    ('wait_airbyte_syncs', INTERVAL '0 minutes', INTERVAL '36 minutes', 'ExternalTaskSensor'),
    ('dbt_copper', INTERVAL '40 minutes', INTERVAL '48 minutes', 'BashOperator'),
    ('dbt_bronze', INTERVAL '48 minutes', INTERVAL '54 minutes', 'BashOperator'),
    ('dbt_silver', INTERVAL '54 minutes', INTERVAL '60 minutes', 'BashOperator'),
    ('dbt_gold', INTERVAL '60 minutes', INTERVAL '68 minutes', 'BashOperator')
  ) AS t(task_id, offset_start, offset_end, operator)
) prev
UNION ALL
SELECT * FROM (
  SELECT 'clinic_medallion_daily',
         'scheduled__2026-09-27T03:00:00+00:00',
         t.task_id,
         1,
         'success',
         i.ts_curr + t.offset_start,
         i.ts_curr + t.offset_end,
         EXTRACT(EPOCH FROM t.offset_end - t.offset_start)::numeric(10, 3),
         t.operator
  FROM _ids i
  CROSS JOIN (VALUES
    ('wait_airbyte_syncs', INTERVAL '0 minutes', INTERVAL '37 minutes', 'ExternalTaskSensor'),
    ('dbt_copper', INTERVAL '40 minutes', INTERVAL '49 minutes', 'BashOperator'),
    ('dbt_bronze', INTERVAL '49 minutes', INTERVAL '55 minutes', 'BashOperator'),
    ('dbt_silver', INTERVAL '55 minutes', INTERVAL '61 minutes', 'BashOperator'),
    ('dbt_gold', INTERVAL '61 minutes', INTERVAL '70 minutes', 'BashOperator')
  ) AS t(task_id, offset_start, offset_end, operator)
) curr;

INSERT INTO ops_transform_batches (
  execution_id, batch_label, layer_from, layer_to, started_at, ended_at, status,
  airbyte_sync_id, airflow_run_id, dbt_invocation_id
)
SELECT exec_prev, 'batch_2026_09_20', 'raw', 'gold', ts_prev + INTERVAL '40 minutes', ts_prev + INTERVAL '68 minutes', 'succeeded',
       sync_ehr_prev, 'scheduled__2026-09-20T03:00:00+00:00', dbt_prev FROM _ids
UNION ALL
SELECT exec_curr, 'batch_2026_09_27', 'raw', 'gold', ts_curr + INTERVAL '40 minutes', ts_curr + INTERVAL '70 minutes', 'succeeded',
       sync_ehr_curr, 'scheduled__2026-09-27T03:00:00+00:00', dbt_curr FROM _ids;

INSERT INTO ops_dbt_run_results (invocation_id, unique_id, name, resource_type, status, execution_time, rows_affected, message, materialized)
SELECT dbt_curr, 'model.clinic_medallion.copper_doctors', 'copper_doctors', 'model', 'success', 1.2, 10, NULL, 'table' FROM _ids
UNION ALL
SELECT dbt_curr, 'model.clinic_medallion.bronze_doctors', 'bronze_doctors', 'model', 'success', 0.8, 20, NULL, 'table' FROM _ids
UNION ALL
SELECT dbt_curr, 'model.clinic_medallion.silver_doctors', 'silver_doctors', 'model', 'success', 0.6, 10, NULL, 'table' FROM _ids
UNION ALL
SELECT dbt_curr, 'model.clinic_medallion.silver_visits', 'silver_visits', 'model', 'success', 2.4, 70, NULL, 'table' FROM _ids
UNION ALL
SELECT dbt_curr, 'model.clinic_medallion.gold_visits_mart', 'gold_visits_mart', 'model', 'success', 3.1, 70, NULL, 'table' FROM _ids
UNION ALL
SELECT dbt_curr, 'model.clinic_medallion.gold_revenue_by_specialty', 'gold_revenue_by_specialty', 'model', 'success', 1.0, 12, NULL, 'table' FROM _ids
UNION ALL
SELECT dbt_curr, 'test.clinic_medallion.unique_silver_doctors_doctor_id', 'unique_silver_doctors_doctor_id', 'test', 'pass', 0.2, NULL, NULL, NULL FROM _ids
UNION ALL
SELECT dbt_prev, 'model.clinic_medallion.silver_visits', 'silver_visits', 'model', 'success', 2.1, 60, NULL, 'table' FROM _ids
UNION ALL
SELECT dbt_prev, 'model.clinic_medallion.gold_visits_mart', 'gold_visits_mart', 'model', 'success', 2.8, 60, NULL, 'table' FROM _ids;

-- ---------------------------------------------------------------------------
-- Silver current-state clinic domain
-- ---------------------------------------------------------------------------

INSERT INTO silver_specialties (specialty_id, name, description, _execution_id, _updated_at)
SELECT s.id, s.name, s.description, i.exec_curr, i.ts_curr
FROM _ids i
CROSS JOIN (VALUES
  (1,  'Cardiology', 'Heart and vascular conditions'),
  (2,  'Dermatology', 'Skin, hair, and nail disorders'),
  (3,  'Endocrinology', 'Hormonal and metabolic diseases'),
  (4,  'Gastroenterology', 'Digestive system disorders'),
  (5,  'Gynecology', 'Women''s reproductive health'),
  (6,  'Neurology', 'Brain, spine, and nerve disorders'),
  (7,  'Ophthalmology', 'Eye care and surgery'),
  (8,  'Orthopedics', 'Bones, joints, and sports injuries'),
  (9,  'Pediatrics', 'Medical care for children and adolescents'),
  (10, 'Psychiatry', 'Mental health diagnosis and treatment'),
  (11, 'Pulmonology', 'Lungs and respiratory system'),
  (12, 'Urology', 'Urinary tract and male reproductive health')
) AS s(id, name, description);

INSERT INTO silver_doctors (
  doctor_id, first_name, last_name, email, phone, license_number,
  employment_status, hired_at, _execution_id, _updated_at
)
SELECT d.id, d.first_name, d.last_name, d.email, d.phone, d.license_number,
       d.employment_status, d.hired_at::date, i.exec_curr, i.ts_curr
FROM _ids i
CROSS JOIN (VALUES
  (1,  'Elena',    'Vargas',     'elena.vargas@clinic.example',     '+34 611 100 001', 'COL-MD-1001', 'active',   '2016-03-12'),
  (2,  'Marc',     'Solé',       'marc.sole@clinic.example',        '+34 611 100 002', 'COL-MD-1002', 'active',   '2018-09-01'),
  (3,  'Amina',    'Benali',     'amina.benali@clinic.example',     '+34 611 100 003', 'COL-MD-1003', 'active',   '2019-01-15'),
  (4,  'Jordi',    'Puig',       'jordi.puig@clinic.example',       '+34 611 100 004', 'COL-MD-1004', 'active',   '2014-06-20'),
  (5,  'Sofía',    'Herrera',    'sofia.herrera@clinic.example',    '+34 611 100 005', 'COL-MD-1005', 'active',   '2021-04-08'),
  (6,  'Lukas',    'Meyer',      'lukas.meyer@clinic.example',      '+34 611 100 006', 'COL-MD-1006', 'active',   '2017-11-03'),
  (7,  'Clara',    'Navarro',    'clara.navarro@clinic.example',    '+34 611 100 007', 'COL-MD-1007', 'on_leave', '2020-02-17'),
  (8,  'Daniel',   'Okoro',      'daniel.okoro@clinic.example',     '+34 611 100 008', 'COL-MD-1008', 'active',   '2015-08-24'),
  (9,  'Inés',     'Romero',     'ines.romero@clinic.example',      '+34 611 100 009', 'COL-MD-1009', 'active',   '2022-10-01'),
  (10, 'Pau',      'Ferrer',     'pau.ferrer@clinic.example',       '+34 611 100 010', 'COL-MD-1010', 'inactive', '2012-05-09')
) AS d(id, first_name, last_name, email, phone, license_number, employment_status, hired_at);

INSERT INTO silver_doctor_specialties (doctor_id, specialty_id, is_primary, _execution_id, _updated_at)
SELECT x.doctor_id, x.specialty_id, x.is_primary, i.exec_curr, i.ts_curr
FROM _ids i
CROSS JOIN (VALUES
  (1,  1,  true),
  (1,  11, false),
  (2,  8,  true),
  (3,  2,  true),
  (4,  4,  true),
  (5,  5,  true),
  (6,  6,  true),
  (6,  10, false),
  (7,  7,  true),
  (8,  9,  true),
  (9,  10, true),
  (10, 12, true),
  (10, 3,  false)
) AS x(doctor_id, specialty_id, is_primary);

INSERT INTO silver_rooms (room_id, name, floor, room_type, _execution_id, _updated_at)
SELECT r.id, r.name, r.floor, r.room_type, i.exec_curr, i.ts_curr
FROM _ids i
CROSS JOIN (VALUES
  (1, 'Consult 1A', 1, 'consult'),
  (2, 'Consult 1B', 1, 'consult'),
  (3, 'Consult 2A', 2, 'consult'),
  (4, 'Consult 2B', 2, 'consult'),
  (5, 'Procedure 1', 1, 'procedure'),
  (6, 'Procedure 2', 2, 'procedure'),
  (7, 'Waiting A', 1, 'waiting'),
  (8, 'Waiting B', 2, 'waiting')
) AS r(id, name, floor, room_type);

INSERT INTO silver_patients (
  patient_id, first_name, last_name, date_of_birth, sex, email, phone,
  insurance_provider, _execution_id, _updated_at
)
SELECT p.id, p.first_name, p.last_name, p.date_of_birth::date, p.sex, p.email, p.phone,
       p.insurance_provider, i.exec_curr, i.ts_curr
FROM _ids i
CROSS JOIN (VALUES
  (1,  'Laura',    'Gómez',      '1984-02-11', 'female', 'laura.gomez@mail.example',      '+34 600 200 001', 'Sanitas'),
  (2,  'Andreu',   'Martí',      '1976-07-23', 'male',   'andreu.marti@mail.example',      '+34 600 200 002', 'Adeslas'),
  (3,  'Núria',    'Costa',      '1991-11-04', 'female', 'nuria.costa@mail.example',       '+34 600 200 003', 'DKV'),
  (4,  'Hugo',     'Sanz',       '2015-03-19', 'male',   'hugo.sanz.guardian@mail.example','+34 600 200 004', 'Mapfre'),
  (5,  'Marta',    'Rius',       '1968-09-30', 'female', 'marta.rius@mail.example',        '+34 600 200 005', 'Sanitas'),
  (6,  'Omar',     'Khalil',     '1988-01-14', 'male',   'omar.khalil@mail.example',       '+34 600 200 006', NULL),
  (7,  'Eva',      'Pujol',      '1959-12-02', 'female', 'eva.pujol@mail.example',         '+34 600 200 007', 'Adeslas'),
  (8,  'Nil',      'Serra',      '2012-06-08', 'male',   'nil.serra.guardian@mail.example','+34 600 200 008', 'DKV'),
  (9,  'Carmen',   'Ortiz',      '1972-04-21', 'female', 'carmen.ortiz@mail.example',      '+34 600 200 009', 'Asisa'),
  (10, 'Joan',     'Vidal',      '1995-08-16', 'male',   'joan.vidal@mail.example',        '+34 600 200 010', 'Sanitas'),
  (11, 'Fatima',   'El Idrissi', '1981-10-27', 'female', 'fatima.elidrissi@mail.example',  '+34 600 200 011', 'Adeslas'),
  (12, 'Pol',      'Bosch',      '2001-05-03', 'male',   'pol.bosch@mail.example',         '+34 600 200 012', NULL),
  (13, 'Anna',     'López',      '1964-01-09', 'female', 'anna.lopez@mail.example',        '+34 600 200 013', 'Mapfre'),
  (14, 'David',    'Chen',       '1979-03-28', 'male',   'david.chen@mail.example',        '+34 600 200 014', 'DKV'),
  (15, 'Irene',    'Molina',     '1998-12-12', 'female', 'irene.molina@mail.example',      '+34 600 200 015', 'Sanitas'),
  (16, 'Xavier',   'Roca',       '1955-07-07', 'male',   'xavier.roca@mail.example',       '+34 600 200 016', 'Adeslas'),
  (17, 'Lia',      'Fernández',  '2018-09-01', 'female', 'lia.fernandez.guardian@mail.example', '+34 600 200 017', 'Asisa'),
  (18, 'Bruno',    'Alves',      '1986-02-18', 'male',   'bruno.alves@mail.example',       '+34 600 200 018', 'Sanitas'),
  (19, 'Helena',   'Díaz',       '1974-11-22', 'female', 'helena.diaz@mail.example',       '+34 600 200 019', 'DKV'),
  (20, 'Eric',     'Navas',      '1990-06-25', 'male',   'eric.navas@mail.example',        '+34 600 200 020', 'Mapfre'),
  (21, 'Paula',    'Gil',        '2004-04-14', 'female', 'paula.gil@mail.example',         '+34 600 200 021', 'Adeslas'),
  (22, 'Toni',     'Mas',        '1961-08-05', 'male',   'toni.mas@mail.example',          '+34 600 200 022', 'Sanitas'),
  (23, 'Sara',     'Quintana',   '1983-01-31', 'female', 'sara.quintana@mail.example',     '+34 600 200 023', NULL),
  (24, 'Leo',      'Ibáñez',     '2010-10-10', 'male',   'leo.ibanez.guardian@mail.example','+34 600 200 024', 'DKV'),
  (25, 'Rosa',     'Camps',      '1949-03-03', 'female', 'rosa.camps@mail.example',        '+34 600 200 025', 'Adeslas')
) AS p(id, first_name, last_name, date_of_birth, sex, email, phone, insurance_provider);

INSERT INTO silver_visits (
  visit_id, patient_id, doctor_id, room_id, scheduled_at, duration_minutes,
  visit_type, status, reason, notes, _execution_id, _updated_at
)
SELECT v.id, v.patient_id, v.doctor_id, v.room_id, v.scheduled_at::timestamptz,
       v.duration_minutes, v.visit_type, v.status, v.reason, v.notes,
       i.exec_curr, i.ts_curr
FROM _ids i
CROSS JOIN (VALUES
  (1,  5,  1, 1, '2026-03-04 09:00:00+01', 30, 'follow_up',     'completed', 'Hypertension review', 'BP 138/84. Continue ACE inhibitor.'),
  (2,  7,  1, 1, '2026-03-04 09:40:00+01', 45, 'first_consult', 'completed', 'Chest discomfort', 'ECG normal. Stress test ordered.'),
  (3,  2,  2, 3, '2026-03-05 10:00:00+01', 30, 'follow_up',     'completed', 'Knee osteoarthritis', 'Hyaluronic acid discussed.'),
  (4,  4,  8, 2, '2026-03-05 11:00:00+01', 20, 'follow_up',     'completed', 'Asthma check', 'Inhaler technique reviewed.'),
  (5,  8,  8, 2, '2026-03-05 11:30:00+01', 20, 'first_consult', 'completed', 'Recurrent otitis', 'Referred ENT if another episode.'),
  (6,  3,  3, 4, '2026-03-06 12:00:00+01', 25, 'procedure',     'completed', 'Mole removal', 'Lesion sent to pathology.'),
  (7,  11, 5, 3, '2026-03-09 16:00:00+01', 30, 'first_consult', 'completed', 'Irregular cycles', 'Ultrasound scheduled.'),
  (8,  14, 6, 1, '2026-03-10 08:30:00+01', 40, 'first_consult', 'completed', 'Migraine', 'Started preventive medication.'),
  (9,  16, 4, 5, '2026-03-11 09:15:00+01', 45, 'procedure',     'completed', 'Colonoscopy', 'Two polyps removed, benign pending.'),
  (10, 9,  9, 4, '2026-03-12 15:00:00+01', 50, 'first_consult', 'completed', 'Anxiety', 'CBT referral and SSRI trial.'),
  (11, 1,  3, 2, '2026-04-02 10:20:00+02', 20, 'follow_up',     'completed', 'Acne follow-up', 'Isotretinoin labs OK.'),
  (12, 13, 1, 1, '2026-04-03 09:00:00+02', 30, 'follow_up',     'no_show',   'Heart failure review', NULL),
  (13, 22, 1, 1, '2026-04-03 09:40:00+02', 30, 'follow_up',     'completed', 'Atrial fibrillation', 'INR in range.'),
  (14, 18, 2, 6, '2026-04-07 08:00:00+02', 60, 'procedure',     'completed', 'Shoulder arthroscopy', 'Uneventful. Physio in 10 days.'),
  (15, 6,  4, 3, '2026-04-08 11:10:00+02', 25, 'first_consult', 'completed', 'GERD', 'PPI 8 weeks, diet advice.'),
  (16, 20, 6, 1, '2026-04-09 14:00:00+02', 30, 'follow_up',     'cancelled', 'Migraine follow-up', 'Patient rescheduled.'),
  (17, 15, 9, 4, '2026-04-14 17:00:00+02', 45, 'telehealth',    'completed', 'Sleep issues', 'Sleep hygiene plan.'),
  (18, 24, 8, 2, '2026-04-15 09:30:00+02', 20, 'follow_up',     'completed', 'ADHD review', 'Dose stable, school report good.'),
  (19, 17, 8, 2, '2026-04-15 10:00:00+02', 20, 'first_consult', 'completed', 'Vaccination catch-up', 'Schedule completed.'),
  (20, 19, 5, 3, '2026-04-16 12:30:00+02', 30, 'follow_up',     'completed', 'Menopause symptoms', 'HRT started.'),
  (21, 25, 7, 4, '2026-04-20 11:00:00+02', 25, 'first_consult', 'cancelled', 'Cataract evaluation', 'Doctor on leave.'),
  (22, 10, 2, 3, '2026-05-04 18:00:00+02', 30, 'first_consult', 'completed', 'Ankle sprain', 'RICE, brace 2 weeks.'),
  (23, 12, 9, 1, '2026-05-05 16:20:00+02', 50, 'first_consult', 'completed', 'Depression screen', 'PHQ-9 = 14. Therapy first line.'),
  (24, 7,  1, 1, '2026-05-06 09:00:00+02', 30, 'follow_up',     'completed', 'Chest pain follow-up', 'Stress test negative.'),
  (25, 5,  1, 1, '2026-05-06 09:40:00+02', 20, 'follow_up',     'completed', 'BP check', 'Target reached.'),
  (26, 21, 3, 2, '2026-05-12 13:00:00+02', 20, 'first_consult', 'completed', 'Eczema', 'Topical steroid course.'),
  (27, 23, 5, 3, '2026-05-13 10:45:00+02', 30, 'first_consult', 'completed', 'Contraception consult', 'IUD planned.'),
  (28, 2,  2, 3, '2026-05-19 10:00:00+02', 25, 'follow_up',     'completed', 'Knee review', 'Pain reduced, continue physio.'),
  (29, 16, 4, 3, '2026-05-20 09:00:00+02', 20, 'follow_up',     'completed', 'Post-colonoscopy', 'Pathology benign.'),
  (30, 11, 5, 5, '2026-05-21 08:30:00+02', 40, 'procedure',     'completed', 'Pelvic ultrasound', 'No structural findings.'),
  (31, 14, 6, 1, '2026-06-02 08:30:00+02', 30, 'follow_up',     'completed', 'Migraine review', 'Attack frequency down 40%.'),
  (32, 9,  9, 4, '2026-06-03 15:00:00+02', 45, 'follow_up',     'completed', 'Anxiety follow-up', 'GAD-7 improved.'),
  (33, 1,  3, 2, '2026-06-09 10:20:00+02', 20, 'follow_up',     'no_show',   'Acne labs', NULL),
  (34, 13, 1, 1, '2026-06-10 09:00:00+02', 30, 'follow_up',     'completed', 'Heart failure (rescheduled)', 'Diuretic adjusted.'),
  (35, 8,  8, 2, '2026-06-11 11:30:00+02', 20, 'follow_up',     'completed', 'Ear check', 'Clear. Hearing normal.'),
  (36, 6,  4, 3, '2026-06-16 11:10:00+02', 20, 'follow_up',     'completed', 'GERD review', 'Symptoms controlled.'),
  (37, 18, 2, 3, '2026-06-18 16:00:00+02', 30, 'follow_up',     'completed', 'Post-op shoulder', 'ROM improving.'),
  (38, 22, 1, 1, '2026-06-24 09:40:00+02', 25, 'follow_up',     'completed', 'AF review', 'No new events.'),
  (39, 20, 6, 1, '2026-06-25 14:00:00+02', 30, 'follow_up',     'completed', 'Migraine (rescheduled)', 'Add magnesium trial.'),
  (40, 3,  3, 4, '2026-07-01 12:00:00+02', 20, 'follow_up',     'completed', 'Pathology result', 'Benign nevus.'),
  (41, 25, 1, 1, '2026-07-07 08:50:00+02', 30, 'first_consult', 'completed', 'Palpitations', 'Holter ordered.'),
  (42, 4,  8, 2, '2026-07-08 11:00:00+02', 20, 'follow_up',     'cancelled', 'Asthma check', 'Family travelling.'),
  (43, 15, 9, 4, '2026-07-14 17:00:00+02', 40, 'follow_up',     'completed', 'Insomnia', 'Sleep much improved.'),
  (44, 19, 5, 3, '2026-07-16 12:30:00+02', 25, 'follow_up',     'completed', 'HRT review', 'Symptoms better, continue.'),
  (45, 12, 9, 1, '2026-07-21 16:20:00+02', 45, 'follow_up',     'completed', 'Depression follow-up', 'PHQ-9 = 8.'),
  (46, 10, 2, 3, '2026-07-22 18:00:00+02', 20, 'follow_up',     'completed', 'Ankle review', 'Cleared for sport.'),
  (47, 21, 3, 2, '2026-08-04 13:00:00+02', 15, 'follow_up',     'completed', 'Eczema review', 'Maintenance emollients.'),
  (48, 23, 5, 5, '2026-08-05 09:00:00+02', 30, 'procedure',     'completed', 'IUD insertion', 'Successful, no complications.'),
  (49, 7,  1, 1, '2026-08-11 09:00:00+02', 30, 'follow_up',     'completed', 'Cardiology annual', 'Echo pending.'),
  (50, 5,  1, 1, '2026-08-11 09:40:00+02', 20, 'follow_up',     'completed', 'BP annual', 'Lifestyle reinforcement.'),
  (51, 14, 6, 4, '2026-08-18 08:30:00+02', 40, 'follow_up',     'no_show',   'Neurology review', NULL),
  (52, 2,  2, 6, '2026-08-19 08:00:00+02', 45, 'procedure',     'completed', 'Knee injection', 'Steroid injected.'),
  (53, 16, 1, 3, '2026-08-25 10:15:00+02', 30, 'first_consult', 'completed', 'COPD suspicion', 'Spirometry ordered.'),
  (54, 11, 5, 3, '2026-08-26 16:00:00+02', 25, 'follow_up',     'completed', 'Cycle review', 'Conservative management.'),
  (55, 1,  3, 2, '2026-09-01 10:20:00+02', 20, 'follow_up',     'completed', 'Acne (rescheduled)', 'Course completed.'),
  (56, 9,  9, 4, '2026-09-02 15:00:00+02', 45, 'follow_up',     'completed', 'Anxiety 3-month', 'Taper plan discussed.'),
  (57, 24, 8, 2, '2026-09-08 09:30:00+02', 20, 'follow_up',     'completed', 'ADHD 6-month', 'Continue current dose.'),
  (58, 6,  4, 3, '2026-09-09 11:10:00+02', 20, 'follow_up',     'completed', 'GERD stop PPI trial', 'Rebound advice given.'),
  (59, 18, 2, 3, '2026-09-10 16:00:00+02', 25, 'follow_up',     'completed', 'Shoulder 5-month', 'Near full function.'),
  (60, 22, 1, 1, '2026-09-15 09:40:00+02', 25, 'follow_up',     'completed', 'AF 3-month', 'Continue anticoagulation.'),
  (61, 13, 1, 1, '2026-09-22 09:00:00+02', 30, 'follow_up',     'scheduled', 'Heart failure review', NULL),
  (62, 25, 1, 1, '2026-09-22 09:40:00+02', 30, 'follow_up',     'scheduled', 'Holter results', NULL),
  (63, 8,  8, 2, '2026-09-23 11:30:00+02', 20, 'follow_up',     'scheduled', 'Pediatric check', NULL),
  (64, 3,  3, 4, '2026-09-24 12:00:00+02', 20, 'follow_up',     'scheduled', 'Skin check', NULL),
  (65, 20, 6, 1, '2026-09-25 14:00:00+02', 30, 'follow_up',     'scheduled', 'Migraine 3-month', NULL),
  (66, 17, 8, 2, '2026-09-29 10:00:00+02', 20, 'follow_up',     'scheduled', 'Well-child visit', NULL),
  (67, 19, 5, 3, '2026-10-01 12:30:00+02', 25, 'follow_up',     'scheduled', 'HRT 3-month', NULL),
  (68, 12, 9, 1, '2026-10-06 16:20:00+02', 45, 'follow_up',     'scheduled', 'Depression 3-month', NULL),
  (69, 4,  8, 2, '2026-10-07 11:00:00+02', 20, 'follow_up',     'scheduled', 'Asthma (rescheduled)', NULL),
  (70, 16, 1, 5, '2026-10-08 09:15:00+02', 40, 'procedure',     'scheduled', 'Spirometry / cardiology', NULL)
) AS v(id, patient_id, doctor_id, room_id, scheduled_at, duration_minutes, visit_type, status, reason, notes);

INSERT INTO silver_invoices (
  invoice_id, visit_id, patient_id, amount_cents, currency, status,
  issued_at, due_at, paid_at, _execution_id, _updated_at
)
SELECT
  v.visit_id,
  v.visit_id,
  v.patient_id,
  CASE v.visit_type
    WHEN 'first_consult' THEN 12000
    WHEN 'follow_up' THEN 7500
    WHEN 'procedure' THEN 28000
    WHEN 'telehealth' THEN 6000
  END + (v.duration_minutes * 50),
  'EUR',
  CASE
    WHEN v.status IN ('cancelled', 'no_show') THEN 'void'
    WHEN v.status = 'scheduled' THEN 'draft'
    WHEN v.visit_id % 9 = 0 THEN 'overdue'
    WHEN v.visit_id % 5 = 0 THEN 'issued'
    ELSE 'paid'
  END,
  CASE WHEN v.status IN ('completed', 'cancelled', 'no_show') THEN v.scheduled_at::date ELSE NULL END,
  CASE WHEN v.status = 'completed' THEN (v.scheduled_at::date + 14) ELSE NULL END,
  CASE
    WHEN v.status = 'completed' AND v.visit_id % 9 <> 0 AND v.visit_id % 5 <> 0 THEN v.scheduled_at::date + 3
    ELSE NULL
  END,
  i.exec_curr,
  i.ts_curr
FROM silver_visits v
CROSS JOIN _ids i;

-- ---------------------------------------------------------------------------
-- Bronze: exactly two executions (prev snapshot differs slightly from curr)
-- ---------------------------------------------------------------------------

INSERT INTO bronze_specialties
SELECT specialty_id, name, description, i.exec_prev, i.ts_prev, 'dynamics'
FROM silver_specialties CROSS JOIN _ids i
UNION ALL
SELECT specialty_id, name, description, i.exec_curr, i.ts_curr, 'dynamics'
FROM silver_specialties CROSS JOIN _ids i;

INSERT INTO bronze_rooms
SELECT room_id, name, floor, room_type, i.exec_prev, i.ts_prev, 'ehr'
FROM silver_rooms CROSS JOIN _ids i
UNION ALL
SELECT room_id, name, floor, room_type, i.exec_curr, i.ts_curr, 'ehr'
FROM silver_rooms CROSS JOIN _ids i;

INSERT INTO bronze_doctor_specialties
SELECT doctor_id, specialty_id, is_primary, i.exec_prev, i.ts_prev, 'dynamics'
FROM silver_doctor_specialties CROSS JOIN _ids i
UNION ALL
SELECT doctor_id, specialty_id, is_primary, i.exec_curr, i.ts_curr, 'dynamics'
FROM silver_doctor_specialties CROSS JOIN _ids i;

-- Prev batch: Clara still active, Pau still active
INSERT INTO bronze_doctors
SELECT
  doctor_id, first_name, last_name, email, phone, license_number,
  CASE doctor_id
    WHEN 7 THEN 'active'
    WHEN 10 THEN 'active'
    ELSE employment_status
  END,
  hired_at, i.exec_prev, i.ts_prev, 'dynamics'
FROM silver_doctors CROSS JOIN _ids i
UNION ALL
SELECT
  doctor_id, first_name, last_name, email, phone, license_number,
  employment_status, hired_at, i.exec_curr, i.ts_curr, 'dynamics'
FROM silver_doctors CROSS JOIN _ids i;

-- Prev batch: Omar still on Sanitas
INSERT INTO bronze_patients
SELECT
  patient_id, first_name, last_name, date_of_birth, sex, email, phone,
  CASE WHEN patient_id = 6 THEN 'Sanitas' ELSE insurance_provider END,
  i.exec_prev, i.ts_prev, 'ehr'
FROM silver_patients CROSS JOIN _ids i
UNION ALL
SELECT
  patient_id, first_name, last_name, date_of_birth, sex, email, phone,
  insurance_provider, i.exec_curr, i.ts_curr, 'ehr'
FROM silver_patients CROSS JOIN _ids i;

-- Prev batch only had visits 1..60 (future schedule not yet booked)
INSERT INTO bronze_visits
SELECT
  visit_id, patient_id, doctor_id, room_id, scheduled_at, duration_minutes,
  visit_type, status, reason, notes, i.exec_prev, i.ts_prev, 'ehr'
FROM silver_visits CROSS JOIN _ids i
WHERE visit_id <= 60
UNION ALL
SELECT
  visit_id, patient_id, doctor_id, room_id, scheduled_at, duration_minutes,
  visit_type, status, reason, notes, i.exec_curr, i.ts_curr, 'ehr'
FROM silver_visits CROSS JOIN _ids i;

INSERT INTO bronze_invoices
SELECT
  invoice_id, visit_id, patient_id, amount_cents, currency, status,
  issued_at, due_at, paid_at, i.exec_prev, i.ts_prev, 'billing'
FROM silver_invoices CROSS JOIN _ids i
WHERE visit_id <= 60
UNION ALL
SELECT
  invoice_id, visit_id, patient_id, amount_cents, currency, status,
  issued_at, due_at, paid_at, i.exec_curr, i.ts_curr, 'billing'
FROM silver_invoices CROSS JOIN _ids i;

-- ---------------------------------------------------------------------------
-- Copper: typed cleaned rows for the latest execution only
-- ---------------------------------------------------------------------------

INSERT INTO copper_specialties
SELECT specialty_id, name, description, _execution_id, _loaded_at, _source_system
FROM bronze_specialties WHERE _execution_id = (SELECT exec_curr FROM _ids);

INSERT INTO copper_doctors
SELECT doctor_id, first_name, last_name, email, phone, license_number,
       employment_status, hired_at, _execution_id, _loaded_at, _source_system
FROM bronze_doctors WHERE _execution_id = (SELECT exec_curr FROM _ids);

INSERT INTO copper_doctor_specialties
SELECT doctor_id, specialty_id, is_primary, _execution_id, _loaded_at, _source_system
FROM bronze_doctor_specialties WHERE _execution_id = (SELECT exec_curr FROM _ids);

INSERT INTO copper_patients
SELECT patient_id, first_name, last_name, date_of_birth, sex, email, phone,
       insurance_provider, _execution_id, _loaded_at, _source_system
FROM bronze_patients WHERE _execution_id = (SELECT exec_curr FROM _ids);

INSERT INTO copper_rooms
SELECT room_id, name, floor, room_type, _execution_id, _loaded_at, _source_system
FROM bronze_rooms WHERE _execution_id = (SELECT exec_curr FROM _ids);

INSERT INTO copper_visits
SELECT visit_id, patient_id, doctor_id, room_id, scheduled_at, duration_minutes,
       visit_type, status, reason, notes, _execution_id, _loaded_at, _source_system
FROM bronze_visits WHERE _execution_id = (SELECT exec_curr FROM _ids);

INSERT INTO copper_invoices
SELECT invoice_id, visit_id, patient_id, amount_cents, currency, status,
       issued_at, due_at, paid_at, _execution_id, _loaded_at, _source_system
FROM bronze_invoices WHERE _execution_id = (SELECT exec_curr FROM _ids);

-- ---------------------------------------------------------------------------
-- Raw: Airbyte-style JSON payloads for both retained sync generations
-- ---------------------------------------------------------------------------

INSERT INTO raw_dynamics_specialties (
  _airbyte_raw_id, _airbyte_extracted_at, _airbyte_loaded_at, _airbyte_meta,
  _airbyte_generation_id, _airbyte_data
)
SELECT
  gen_random_uuid(),
  b._loaded_at,
  b._loaded_at + INTERVAL '30 seconds',
  jsonb_build_object('sync_id', CASE WHEN b._execution_id = i.exec_prev THEN i.sync_dynamics_prev ELSE i.sync_dynamics_curr END),
  CASE WHEN b._execution_id = i.exec_prev THEN 1 ELSE 2 END,
  jsonb_build_object(
    'specialtyid', b.specialty_id,
    'name', b.name,
    'description', b.description
  )
FROM bronze_specialties b
CROSS JOIN _ids i;

INSERT INTO raw_dynamics_doctors (
  _airbyte_raw_id, _airbyte_extracted_at, _airbyte_loaded_at, _airbyte_meta,
  _airbyte_generation_id, _airbyte_data
)
SELECT
  gen_random_uuid(),
  b._loaded_at,
  b._loaded_at + INTERVAL '30 seconds',
  jsonb_build_object('sync_id', CASE WHEN b._execution_id = i.exec_prev THEN i.sync_dynamics_prev ELSE i.sync_dynamics_curr END),
  CASE WHEN b._execution_id = i.exec_prev THEN 1 ELSE 2 END,
  jsonb_build_object(
    'contactid', b.doctor_id,
    'firstname', b.first_name,
    'lastname', b.last_name,
    'emailaddress1', b.email,
    'mobilephone', b.phone,
    'new_licensenumber', b.license_number,
    'new_employmentstatus', b.employment_status,
    'new_hireddate', b.hired_at
  )
FROM bronze_doctors b
CROSS JOIN _ids i;

INSERT INTO raw_dynamics_doctor_specialties (
  _airbyte_raw_id, _airbyte_extracted_at, _airbyte_loaded_at, _airbyte_meta,
  _airbyte_generation_id, _airbyte_data
)
SELECT
  gen_random_uuid(),
  b._loaded_at,
  b._loaded_at + INTERVAL '30 seconds',
  jsonb_build_object('sync_id', CASE WHEN b._execution_id = i.exec_prev THEN i.sync_dynamics_prev ELSE i.sync_dynamics_curr END),
  CASE WHEN b._execution_id = i.exec_prev THEN 1 ELSE 2 END,
  jsonb_build_object(
    'doctorid', b.doctor_id,
    'specialtyid', b.specialty_id,
    'isprimary', b.is_primary
  )
FROM bronze_doctor_specialties b
CROSS JOIN _ids i;

INSERT INTO raw_ehr_patients (
  _airbyte_raw_id, _airbyte_extracted_at, _airbyte_loaded_at, _airbyte_meta,
  _airbyte_generation_id, _airbyte_data
)
SELECT
  gen_random_uuid(),
  b._loaded_at,
  b._loaded_at + INTERVAL '45 seconds',
  jsonb_build_object('sync_id', CASE WHEN b._execution_id = i.exec_prev THEN i.sync_ehr_prev ELSE i.sync_ehr_curr END),
  CASE WHEN b._execution_id = i.exec_prev THEN 1 ELSE 2 END,
  jsonb_build_object(
    'patient_id', b.patient_id,
    'first_name', b.first_name,
    'last_name', b.last_name,
    'dob', b.date_of_birth,
    'sex', b.sex,
    'email', b.email,
    'phone', b.phone,
    'insurance_provider', b.insurance_provider
  )
FROM bronze_patients b
CROSS JOIN _ids i;

INSERT INTO raw_ehr_rooms (
  _airbyte_raw_id, _airbyte_extracted_at, _airbyte_loaded_at, _airbyte_meta,
  _airbyte_generation_id, _airbyte_data
)
SELECT
  gen_random_uuid(),
  b._loaded_at,
  b._loaded_at + INTERVAL '45 seconds',
  jsonb_build_object('sync_id', CASE WHEN b._execution_id = i.exec_prev THEN i.sync_ehr_prev ELSE i.sync_ehr_curr END),
  CASE WHEN b._execution_id = i.exec_prev THEN 1 ELSE 2 END,
  jsonb_build_object(
    'room_id', b.room_id,
    'name', b.name,
    'floor', b.floor,
    'room_type', b.room_type
  )
FROM bronze_rooms b
CROSS JOIN _ids i;

INSERT INTO raw_ehr_visits (
  _airbyte_raw_id, _airbyte_extracted_at, _airbyte_loaded_at, _airbyte_meta,
  _airbyte_generation_id, _airbyte_data
)
SELECT
  gen_random_uuid(),
  b._loaded_at,
  b._loaded_at + INTERVAL '45 seconds',
  jsonb_build_object('sync_id', CASE WHEN b._execution_id = i.exec_prev THEN i.sync_ehr_prev ELSE i.sync_ehr_curr END),
  CASE WHEN b._execution_id = i.exec_prev THEN 1 ELSE 2 END,
  jsonb_build_object(
    'visit_id', b.visit_id,
    'patient_id', b.patient_id,
    'doctor_id', b.doctor_id,
    'room_id', b.room_id,
    'scheduled_at', b.scheduled_at,
    'duration_minutes', b.duration_minutes,
    'visit_type', b.visit_type,
    'status', b.status,
    'reason', b.reason,
    'notes', b.notes
  )
FROM bronze_visits b
CROSS JOIN _ids i;

INSERT INTO raw_billing_invoices (
  _airbyte_raw_id, _airbyte_extracted_at, _airbyte_loaded_at, _airbyte_meta,
  _airbyte_generation_id, _airbyte_data
)
SELECT
  gen_random_uuid(),
  b._loaded_at,
  b._loaded_at + INTERVAL '20 seconds',
  jsonb_build_object('sync_id', CASE WHEN b._execution_id = i.exec_prev THEN i.sync_billing_prev ELSE i.sync_billing_curr END),
  CASE WHEN b._execution_id = i.exec_prev THEN 1 ELSE 2 END,
  jsonb_build_object(
    'invoice_id', b.invoice_id,
    'visit_id', b.visit_id,
    'patient_id', b.patient_id,
    'amount_cents', b.amount_cents,
    'currency', b.currency,
    'status', b.status,
    'issued_at', b.issued_at,
    'due_at', b.due_at,
    'paid_at', b.paid_at
  )
FROM bronze_invoices b
CROSS JOIN _ids i;

-- ---------------------------------------------------------------------------
-- Gold marts from silver
-- ---------------------------------------------------------------------------

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
  i.ts_curr
FROM silver_doctors d
CROSS JOIN _ids i
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
  i.ts_curr
FROM silver_patients p
CROSS JOIN _ids i
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
  i.ts_curr
FROM silver_specialties sp
CROSS JOIN _ids i
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
  i.ts_curr
FROM silver_visits v
CROSS JOIN _ids i
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
  i.ts_curr
FROM silver_invoices inv
CROSS JOIN _ids i
JOIN silver_visits v ON v.visit_id = inv.visit_id
JOIN silver_patients p ON p.patient_id = inv.patient_id
JOIN silver_doctors d ON d.doctor_id = v.doctor_id
LEFT JOIN silver_doctor_specialties ds ON ds.doctor_id = d.doctor_id AND ds.is_primary
LEFT JOIN silver_specialties sp ON sp.specialty_id = ds.specialty_id;
