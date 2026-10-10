import pg from 'pg';
import { seedExamples } from './examples.js';
import { localDay, validTimeZone } from './rules.js';

// Weeks are calendar dates. Keep them as 'YYYY-MM-DD' rather than a Date at
// midnight in the server's time zone.
pg.types.setTypeParser(1082, (value) => value);

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/** Tables, created on start. An app that has never had any projects gets example data once. */
export async function setup() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      team_name TEXT NOT NULL DEFAULT 'Your team',
      time_zone TEXT NOT NULL DEFAULT 'America/New_York',
      examples_added BOOLEAN NOT NULL DEFAULT false
    );
    INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING;

    CREATE TABLE IF NOT EXISTS people (
      email TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      admin BOOLEAN NOT NULL DEFAULT false,
      example BOOLEAN NOT NULL DEFAULT false,
      last_seen TIMESTAMPTZ,
      added_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS projects (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      lead TEXT,
      archived BOOLEAN NOT NULL DEFAULT false,
      example BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS members (
      project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (project_id, email)
    );

    CREATE TABLE IF NOT EXISTS updates (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      week DATE NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('on_track','at_risk','blocked')),
      moved TEXT NOT NULL DEFAULT '',
      blockers TEXT NOT NULL DEFAULT '',
      next TEXT NOT NULL DEFAULT '',
      handled_by TEXT,
      handled_at TIMESTAMPTZ,
      example BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (project_id, email, week)
    );
    CREATE INDEX IF NOT EXISTS updates_by_week ON updates (week);
  `);
  const settings = await settingsOf();
  if (!settings.examples_added) {
    const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM projects');
    if (n === 0) await seedExamples(pool, localDay(new Date(), settings.time_zone));
    await pool.query('UPDATE settings SET examples_added = true WHERE id = 1');
  }
}

export async function settingsOf() {
  const row = (await pool.query('SELECT * FROM settings WHERE id = 1')).rows[0];
  return { ...row, time_zone: validTimeZone(row.time_zone) ? row.time_zone : 'UTC' };
}

/** Remember who has visited and whether Spryloom says they are an admin, for the Monday summary. */
export const seen = (viewer) =>
  pool.query(
    `INSERT INTO people (email, admin, last_seen) VALUES ($1, $2, now())
     ON CONFLICT (email) DO UPDATE SET admin = EXCLUDED.admin, last_seen = now()`,
    [viewer.email, viewer.admin],
  );

/** Everything a week page needs, for one week and the one before it. */
export async function loadWeek(week, previousWeek, stripFrom) {
  const [projects, members, updates, previous, history] = await Promise.all([
    pool.query('SELECT * FROM projects WHERE NOT archived ORDER BY name'),
    pool.query('SELECT m.project_id, m.email, m.added_at FROM members m JOIN projects p ON p.id = m.project_id WHERE NOT p.archived'),
    pool.query('SELECT * FROM updates WHERE week = $1', [week]),
    pool.query('SELECT project_id, email, status, blockers FROM updates WHERE week = $1', [previousWeek]),
    pool.query('SELECT project_id, week, status FROM updates WHERE week BETWEEN $1 AND $2', [stripFrom, week]),
  ]);
  return { projects: projects.rows, members: members.rows, updates: updates.rows, previous: previous.rows, history: history.rows };
}

/** Names for addresses, from the people table, as a Map. */
export async function namesOf() {
  return new Map((await pool.query('SELECT email, name FROM people')).rows.map((r) => [r.email, r.name]));
}

/** Delete everything the app added as an example. What people wrote themselves stays. */
export async function removeExamples() {
  await pool.query('DELETE FROM updates WHERE example');
  await pool.query('DELETE FROM projects WHERE example AND NOT EXISTS (SELECT 1 FROM updates u WHERE u.project_id = projects.id)');
  await pool.query('DELETE FROM members WHERE email IN (SELECT email FROM people WHERE example)');
  await pool.query('DELETE FROM people WHERE example');
  await pool.query('UPDATE projects SET example = false WHERE example');
}
