import pg from 'pg';

// Dates stay 'YYYY-MM-DD' strings. Turned into a Date they would shift by the
// server's timezone, and a day off would move.
pg.types.setTypeParser(1082, (value) => value);

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/** Tables, created on start. */
export async function setup() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      company_name TEXT NOT NULL DEFAULT 'Your company',
      timezone TEXT NOT NULL DEFAULT 'America/New_York',
      seeded BOOLEAN NOT NULL DEFAULT false,
      digest_day DATE
    );
    INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING;

    CREATE TABLE IF NOT EXISTS people (
      email TEXT PRIMARY KEY,
      name TEXT,
      admin BOOLEAN NOT NULL DEFAULT false,
      example BOOLEAN NOT NULL DEFAULT false,
      last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- person '' is the company default; days NULL means "not counted against a balance".
    CREATE TABLE IF NOT EXISTS allowances (
      person TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL CHECK (kind IN ('vacation','sick','personal','other')),
      days NUMERIC(5,1) CHECK (days IS NULL OR days BETWEEN 0 AND 365),
      PRIMARY KEY (person, kind)
    );

    CREATE TABLE IF NOT EXISTS holidays (
      day DATE PRIMARY KEY,
      name TEXT NOT NULL,
      example BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS requests (
      id BIGSERIAL PRIMARY KEY,
      person TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('vacation','sick','personal','other')),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL CHECK (end_date >= start_date),
      half_start BOOLEAN NOT NULL DEFAULT false,
      half_end BOOLEAN NOT NULL DEFAULT false,
      days NUMERIC(5,1) NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','cancelled')),
      decided_by TEXT,
      decided_at TIMESTAMPTZ,
      reason TEXT NOT NULL DEFAULT '',
      self_approved BOOLEAN NOT NULL DEFAULT false,
      example BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS requests_by_dates ON requests (start_date, end_date);
    CREATE INDEX IF NOT EXISTS requests_by_person ON requests (person, start_date);

    CREATE TABLE IF NOT EXISTS events (
      id BIGSERIAL PRIMARY KEY,
      request_id BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      actor TEXT NOT NULL,
      kind TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS events_by_request ON events (request_id, created_at);

    INSERT INTO allowances (person, kind, days) VALUES
      ('', 'vacation', 20), ('', 'sick', 10), ('', 'personal', 3), ('', 'other', NULL)
    ON CONFLICT DO NOTHING;

    -- What the app has emailed, so it stays inside Spryloom's 5 a day (counted per UTC day).
    CREATE TABLE IF NOT EXISTS emails (
      id BIGSERIAL PRIMARY KEY,
      day DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      purpose TEXT NOT NULL,
      outcome TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

/** Remember who has visited and whether Spryloom says they are an admin, for approvers and the digest. */
export const seen = (viewer) =>
  pool.query(
    `INSERT INTO people (email, admin) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET admin = EXCLUDED.admin, last_seen = now()`,
    [viewer.email, viewer.admin],
  );

export const record = (requestId, actor, kind, note = '') =>
  pool.query('INSERT INTO events (request_id, actor, kind, note) VALUES ($1, $2, $3, $4)', [requestId, actor, kind, note]);

export const settingsOf = async () => (await pool.query('SELECT * FROM settings WHERE id = 1')).rows[0];

export const holidaySet = async () => new Set((await pool.query('SELECT day FROM holidays')).rows.map((h) => h.day));
