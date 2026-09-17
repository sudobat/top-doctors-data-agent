TRUNCATE TABLE
  invoices,
  visits,
  doctor_specialties,
  doctors,
  patients,
  rooms,
  specialties
RESTART IDENTITY CASCADE;

INSERT INTO specialties (id, name, description) OVERRIDING SYSTEM VALUE VALUES
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
  (12, 'Urology', 'Urinary tract and male reproductive health');

INSERT INTO doctors (id, first_name, last_name, email, phone, license_number, employment_status, hired_at) OVERRIDING SYSTEM VALUE VALUES
  (1,  'Elena',    'Vargas',     'elena.vargas@clinic.example',     '+34 611 100 001', 'COL-MD-1001', 'active',   '2016-03-12'),
  (2,  'Marc',     'Solé',       'marc.sole@clinic.example',        '+34 611 100 002', 'COL-MD-1002', 'active',   '2018-09-01'),
  (3,  'Amina',    'Benali',     'amina.benali@clinic.example',     '+34 611 100 003', 'COL-MD-1003', 'active',   '2019-01-15'),
  (4,  'Jordi',    'Puig',       'jordi.puig@clinic.example',       '+34 611 100 004', 'COL-MD-1004', 'active',   '2014-06-20'),
  (5,  'Sofía',    'Herrera',    'sofia.herrera@clinic.example',    '+34 611 100 005', 'COL-MD-1005', 'active',   '2021-04-08'),
  (6,  'Lukas',    'Meyer',      'lukas.meyer@clinic.example',      '+34 611 100 006', 'COL-MD-1006', 'active',   '2017-11-03'),
  (7,  'Clara',    'Navarro',    'clara.navarro@clinic.example',    '+34 611 100 007', 'COL-MD-1007', 'on_leave', '2020-02-17'),
  (8,  'Daniel',   'Okoro',      'daniel.okoro@clinic.example',     '+34 611 100 008', 'COL-MD-1008', 'active',   '2015-08-24'),
  (9,  'Inés',     'Romero',     'ines.romero@clinic.example',      '+34 611 100 009', 'COL-MD-1009', 'active',   '2022-10-01'),
  (10, 'Pau',      'Ferrer',     'pau.ferrer@clinic.example',       '+34 611 100 010', 'COL-MD-1010', 'inactive', '2012-05-09');

INSERT INTO doctor_specialties (doctor_id, specialty_id, is_primary) VALUES
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
  (10, 3,  false);

INSERT INTO rooms (id, name, floor, room_type) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Consult 1A', 1, 'consult'),
  (2, 'Consult 1B', 1, 'consult'),
  (3, 'Consult 2A', 2, 'consult'),
  (4, 'Consult 2B', 2, 'consult'),
  (5, 'Procedure 1', 1, 'procedure'),
  (6, 'Procedure 2', 2, 'procedure'),
  (7, 'Waiting A', 1, 'waiting'),
  (8, 'Waiting B', 2, 'waiting');

INSERT INTO patients (id, first_name, last_name, date_of_birth, sex, email, phone, insurance_provider) OVERRIDING SYSTEM VALUE VALUES
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
  (25, 'Rosa',     'Camps',      '1949-03-03', 'female', 'rosa.camps@mail.example',        '+34 600 200 025', 'Adeslas');

INSERT INTO visits (id, patient_id, doctor_id, room_id, scheduled_at, duration_minutes, visit_type, status, reason, notes) OVERRIDING SYSTEM VALUE VALUES
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
  (70, 16, 1, 5, '2026-10-08 09:15:00+02', 40, 'procedure',     'scheduled', 'Spirometry / cardiology', NULL);

INSERT INTO invoices (visit_id, patient_id, amount_cents, currency, status, issued_at, due_at, paid_at)
SELECT
  v.id,
  v.patient_id,
  CASE v.visit_type
    WHEN 'first_consult' THEN 12000
    WHEN 'follow_up' THEN 7500
    WHEN 'procedure' THEN 28000
    WHEN 'telehealth' THEN 6000
  END
  + (v.duration_minutes * 50),
  'EUR',
  CASE
    WHEN v.status IN ('cancelled', 'no_show') THEN 'void'
    WHEN v.status = 'scheduled' THEN 'draft'
    WHEN v.id % 9 = 0 THEN 'overdue'
    WHEN v.id % 5 = 0 THEN 'issued'
    ELSE 'paid'
  END,
  CASE WHEN v.status IN ('completed', 'cancelled', 'no_show') THEN v.scheduled_at::date ELSE NULL END,
  CASE WHEN v.status = 'completed' THEN (v.scheduled_at::date + 14) ELSE NULL END,
  CASE
    WHEN v.status = 'completed' AND v.id % 9 <> 0 AND v.id % 5 <> 0 THEN v.scheduled_at::date + 3
    ELSE NULL
  END
FROM visits v;

SELECT setval(pg_get_serial_sequence('specialties', 'id'), (SELECT MAX(id) FROM specialties));
SELECT setval(pg_get_serial_sequence('doctors', 'id'), (SELECT MAX(id) FROM doctors));
SELECT setval(pg_get_serial_sequence('rooms', 'id'), (SELECT MAX(id) FROM rooms));
SELECT setval(pg_get_serial_sequence('patients', 'id'), (SELECT MAX(id) FROM patients));
SELECT setval(pg_get_serial_sequence('visits', 'id'), (SELECT MAX(id) FROM visits));
SELECT setval(pg_get_serial_sequence('invoices', 'id'), (SELECT COALESCE(MAX(id), 1) FROM invoices));
