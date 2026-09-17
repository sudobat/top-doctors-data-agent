CREATE TABLE IF NOT EXISTS specialties (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS doctors (
  id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  email              TEXT NOT NULL UNIQUE,
  phone              TEXT,
  license_number     TEXT NOT NULL UNIQUE,
  employment_status  TEXT NOT NULL CHECK (employment_status IN ('active', 'on_leave', 'inactive')),
  hired_at           DATE NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS doctor_specialties (
  doctor_id    INTEGER NOT NULL REFERENCES doctors (id) ON DELETE CASCADE,
  specialty_id INTEGER NOT NULL REFERENCES specialties (id) ON DELETE CASCADE,
  is_primary   BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (doctor_id, specialty_id)
);

CREATE TABLE IF NOT EXISTS patients (
  id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  date_of_birth      DATE NOT NULL,
  sex                TEXT CHECK (sex IN ('female', 'male', 'other')),
  email              TEXT,
  phone              TEXT,
  insurance_provider TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  floor     INTEGER NOT NULL,
  room_type TEXT NOT NULL CHECK (room_type IN ('consult', 'procedure', 'waiting'))
);

CREATE TABLE IF NOT EXISTS visits (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id        INTEGER NOT NULL REFERENCES patients (id),
  doctor_id         INTEGER NOT NULL REFERENCES doctors (id),
  room_id           INTEGER REFERENCES rooms (id),
  scheduled_at      TIMESTAMPTZ NOT NULL,
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes > 0),
  visit_type        TEXT NOT NULL CHECK (visit_type IN ('first_consult', 'follow_up', 'procedure', 'telehealth')),
  status            TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  reason            TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visit_id     INTEGER NOT NULL UNIQUE REFERENCES visits (id),
  patient_id   INTEGER NOT NULL REFERENCES patients (id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency     TEXT NOT NULL DEFAULT 'EUR',
  status       TEXT NOT NULL CHECK (status IN ('draft', 'issued', 'paid', 'void', 'overdue')),
  issued_at    DATE,
  due_at       DATE,
  paid_at      DATE
);

CREATE INDEX IF NOT EXISTS idx_visits_doctor_scheduled ON visits (doctor_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits (patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits (status);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status);
CREATE INDEX IF NOT EXISTS idx_doctor_specialties_specialty ON doctor_specialties (specialty_id);
