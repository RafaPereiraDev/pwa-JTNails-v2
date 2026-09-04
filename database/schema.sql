-- ============================================================
-- Tainara Nails — Schema PostgreSQL
-- Execute este arquivo no banco de produção (Render / Railway)
-- antes do primeiro deploy:
--   psql $DATABASE_URL -f database/schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS professionals (
  id         SERIAL PRIMARY KEY,
  name       TEXT    NOT NULL,
  phone      TEXT,
  email      TEXT,
  active     BOOLEAN DEFAULT TRUE,
  color      TEXT    DEFAULT '#e91e8c',
  photo      TEXT,
  bio        TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            TEXT    NOT NULL,
  email           TEXT    UNIQUE NOT NULL,
  password        TEXT    NOT NULL,
  role            TEXT    NOT NULL CHECK(role IN ('master','admin','professional')),
  professional_id INTEGER REFERENCES professionals(id),
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  email       TEXT,
  birth_date  TEXT,
  notes       TEXT,
  reliability TEXT DEFAULT 'new'
              CHECK(reliability IN ('new','good','irregular','unreliable')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id          SERIAL PRIMARY KEY,
  name        TEXT    NOT NULL,
  description TEXT,
  price       NUMERIC(10,2) NOT NULL,
  duration    INTEGER DEFAULT 60,
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER NOT NULL REFERENCES clients(id),
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  service_id      INTEGER NOT NULL REFERENCES services(id),
  date            DATE    NOT NULL,
  start_time      TIME    NOT NULL,
  end_time        TIME    NOT NULL,
  price           NUMERIC(10,2) NOT NULL,
  status          TEXT DEFAULT 'scheduled'
                  CHECK(status IN ('scheduled','confirmed','in_progress','completed','cancelled','no_show')),
  payment_method  TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id              SERIAL PRIMARY KEY,
  type            TEXT NOT NULL CHECK(type IN ('income','expense')),
  appointment_id  INTEGER REFERENCES appointments(id),
  professional_id INTEGER REFERENCES professionals(id),
  description     TEXT NOT NULL,
  category        TEXT,
  amount          NUMERIC(10,2) NOT NULL,
  payment_method  TEXT,
  date            DATE NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blocked_times (
  id              SERIAL PRIMARY KEY,
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  date            DATE NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_appointments_date       ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_prof       ON appointments(professional_id);
CREATE INDEX IF NOT EXISTS idx_appointments_client     ON appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status     ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_transactions_date       ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_prof       ON transactions(professional_id);
CREATE INDEX IF NOT EXISTS idx_blocked_times_prof_date ON blocked_times(professional_id, date);
