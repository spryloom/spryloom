import pg from 'pg';
import { exampleData } from './examples.js';
import { todayIso } from './rules.js';

// Dates stay as "2026-10-09" strings: no time zone, no midnight surprises.
pg.types.setTypeParser(1082, (value) => value);

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/** Tables, created on start. A brand-new app gets the example team once. */
export async function setup() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      examples_added_at TIMESTAMPTZ
    );
    INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING;

    CREATE TABLE IF NOT EXISTS people (
      email TEXT PRIMARY KEY,
      admin BOOLEAN NOT NULL DEFAULT false,
      example BOOLEAN NOT NULL DEFAULT false,
      last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS tools (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Other',
      website TEXT,
      plan TEXT NOT NULL DEFAULT '',
      owner TEXT,
      pricing TEXT NOT NULL DEFAULT 'per_seat' CHECK (pricing IN ('per_seat', 'flat')),
      price_cents BIGINT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      billing TEXT NOT NULL DEFAULT 'monthly' CHECK (billing IN ('monthly', 'annual')),
      seats_bought INT CHECK (seats_bought >= 0),
      renews_on DATE,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'cancelling')),
      trial_ends DATE,
      notes TEXT NOT NULL DEFAULT '',
      example BOOLEAN NOT NULL DEFAULT false,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS tool_users (
      tool_id INT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      since TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (tool_id, email)
    );

    CREATE TABLE IF NOT EXISTS requests (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('new', 'seat')),
      tool_id INT REFERENCES tools(id) ON DELETE SET NULL,
      tool_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Other',
      website TEXT,
      purpose TEXT NOT NULL,
      pricing TEXT NOT NULL DEFAULT 'per_seat' CHECK (pricing IN ('per_seat', 'flat')),
      price_cents BIGINT CHECK (price_cents >= 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      billing TEXT NOT NULL DEFAULT 'monthly' CHECK (billing IN ('monthly', 'annual')),
      seats INT NOT NULL DEFAULT 1 CHECK (seats >= 1),
      requester TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn')),
      decided_by TEXT,
      decided_at TIMESTAMPTZ,
      reason TEXT NOT NULL DEFAULT '',
      example BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      tool_id INT REFERENCES tools(id) ON DELETE CASCADE,
      request_id INT REFERENCES requests(id) ON DELETE CASCADE,
      actor TEXT NOT NULL,
      kind TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS events_by_tool ON events (tool_id, created_at);

    CREATE TABLE IF NOT EXISTS emails (
      id SERIAL PRIMARY KEY,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      kind TEXT NOT NULL,
      sent BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const { rows: [s] } = await pool.query('SELECT examples_added_at FROM settings WHERE id = 1');
  const { rows: [t] } = await pool.query('SELECT count(*)::int AS n FROM tools');
  if (!s.examples_added_at && t.n === 0) await addExamples();
}

/** The example team, added once to an empty app. */
async function addExamples() {
  const data = exampleData(todayIso());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const email of data.people) {
      await client.query(`INSERT INTO people (email, example, last_seen) VALUES ($1, true, now() - interval '2 days') ON CONFLICT DO NOTHING`, [email]);
    }
    const ids = new Map();
    for (const t of data.tools) {
      const { rows: [row] } = await client.query(
        `INSERT INTO tools (name, category, website, plan, owner, pricing, price_cents, currency, billing, seats_bought, renews_on, status, trial_ends, notes, example, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,'marcus.lee@example.com', now() - make_interval(days => $15), now() - make_interval(days => $15))
         RETURNING id`,
        [t.name, t.category, t.website, t.plan, t.owner, t.pricing, t.price_cents, t.currency, t.billing, t.seats_bought, t.renews_on, t.status, t.trial_ends, t.notes, t.added_days_ago],
      );
      ids.set(t.name, row.id);
      for (const email of t.users) await client.query('INSERT INTO tool_users (tool_id, email, since) VALUES ($1, $2, now() - make_interval(days => $3))', [row.id, email, t.added_days_ago]);
      await client.query(`INSERT INTO events (tool_id, actor, kind, created_at) VALUES ($1, 'marcus.lee@example.com', 'added', now() - make_interval(days => $2))`, [row.id, t.added_days_ago]);
      if (t.status === 'cancelling') await client.query(`INSERT INTO events (tool_id, actor, kind, note, created_at) VALUES ($1, $2, 'status', 'Cancelling', now() - interval '6 days')`, [row.id, t.owner]);
    }
    for (const r of data.requests) {
      const { rows: [row] } = await client.query(
        `INSERT INTO requests (kind, tool_id, tool_name, category, website, purpose, pricing, price_cents, currency, billing, seats, requester, status, decided_by, decided_at, reason, example, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, CASE WHEN $14::text IS NULL THEN NULL ELSE now() - make_interval(days => $15 - 1) END, $16, true, now() - make_interval(days => $15))
         RETURNING id`,
        [r.kind, r.tool ? ids.get(r.tool) : null, r.tool_name, r.category, r.website, r.purpose, r.pricing, r.price_cents, r.currency, r.billing, r.seats, r.requester, r.status, r.decided_by ?? null, r.days_ago, r.reason ?? ''],
      );
      if (r.status === 'approved' && r.tool) {
        await client.query(`INSERT INTO events (tool_id, request_id, actor, kind, note, created_at) VALUES ($1, $2, $3, 'seat_added', $4, now() - make_interval(days => $5 - 1))`, [ids.get(r.tool), row.id, r.decided_by, r.requester, r.days_ago]);
      }
    }
    await client.query('UPDATE settings SET examples_added_at = now() WHERE id = 1');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Everything marked as an example goes; anything people added stays. */
export async function removeExamples() {
  await pool.query(`
    DELETE FROM tool_users WHERE email IN (SELECT email FROM people WHERE example);
    DELETE FROM requests WHERE example;
    DELETE FROM tools WHERE example;
    DELETE FROM people WHERE example;
  `);
}

/** Remember who has visited and whether Spryloom says they are an admin, for owners and the morning email. */
export const seen = (viewer) =>
  pool.query(
    `INSERT INTO people (email, admin) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET admin = EXCLUDED.admin, example = false, last_seen = now()`,
    [viewer.email, viewer.admin],
  );

export const record = (toolId, actor, kind, note = '', requestId = null) =>
  pool.query('INSERT INTO events (tool_id, request_id, actor, kind, note) VALUES ($1, $2, $3, $4, $5)', [toolId, requestId, actor, kind, note]);

/** Every tool, with how many people use each, and every request. */
export async function loadAll() {
  const tools = (await pool.query('SELECT * FROM tools ORDER BY lower(name)')).rows.map(numeric);
  const counts = (await pool.query('SELECT tool_id, count(*)::int AS n FROM tool_users GROUP BY tool_id')).rows;
  const usersByTool = new Map(counts.map((r) => [r.tool_id, r.n]));
  const requests = (await pool.query('SELECT * FROM requests ORDER BY created_at DESC')).rows.map(numeric);
  return { tools, usersByTool, requests };
}

/** BIGINT arrives as a string from pg; cents are well inside a safe number. */
export function numeric(row) {
  if (row && row.price_cents !== null && row.price_cents !== undefined) row.price_cents = Number(row.price_cents);
  return row;
}

/** Real admins who have opened the app: those who can decide requests. */
export const adminCount = async () => (await pool.query('SELECT count(*)::int AS n FROM people WHERE admin AND NOT example')).rows[0].n;

/** Emails this app sent today (UTC), against Spryloom's 5 a day. */
export const sentToday = async () => (await pool.query(`SELECT count(*)::int AS n FROM emails WHERE sent AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`)).rows[0].n;
