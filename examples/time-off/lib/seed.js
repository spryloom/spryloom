/**
 * Example data for a brand-new app, so the first thing anyone sees is a team
 * using it rather than an empty page. Added once, on the first start of an
 * empty app; every row is marked `example` and an admin removes them all with
 * one button. Dates are worked out from today, so the example never goes stale.
 */
import { pool } from './db.js';
import { addDays, isWorkingDay, todayIn, workingDayFrom, workingDays } from './days.js';

const PEOPLE = [
  ['maya.chen', 'Maya Chen'],
  ['jonah.ellis', 'Jonah Ellis'],
  ['priya.raman', 'Priya Raman'],
  ['tomas.ortega', 'Tomás Ortega'],
  ['grace.okafor', 'Grace Okafor'],
  ['leo.brandt', 'Leo Brandt'],
  ['hana.sato', 'Hana Sato'],
  ['sam.whitfield', 'Sam Whitfield', true],
  ['nadia.haddad', 'Nadia Haddad'],
  ['owen.price', 'Owen Price'],
];
const at = (user) => `${user}@example.com`;
const APPROVER = at('sam.whitfield');

/**
 * Each request: who, kind, first working day (offset from today, in working
 * days), length in working days, status, and the details that make it real.
 */
const REQUESTS = [
  ['maya.chen', 'vacation', -2, 5, 'approved', { note: 'Hiking in the Dolomites. Laptop stays home.', asked: 21 }],
  ['jonah.ellis', 'sick', 0, 1, 'approved', { note: 'Flu. Back tomorrow if it passes.', asked: 0, decidedSoon: true }],
  ['tomas.ortega', 'personal', 1, 1, 'approved', { halfStart: true, note: 'Signing the lease on the new flat.', asked: 6 }],
  ['priya.raman', 'vacation', 3, 5, 'approved', { note: "Sister's wedding in Chennai.", asked: 40 }],
  ['owen.price', 'personal', 4, 1, 'pending', { note: 'Moving apartments. Reachable on my phone.', asked: 1 }],
  ['leo.brandt', 'personal', 5, 1, 'declined', { note: 'Long weekend.', reason: "It's release day. Could you take the Monday after instead?", asked: 9 }],
  ['grace.okafor', 'vacation', 12, 5, 'approved', { note: 'Family visit in Lagos.', asked: 30 }],
  ['leo.brandt', 'vacation', 14, 4, 'approved', { asked: 18, halfEnd: true }],
  ['nadia.haddad', 'vacation', 13, 5, 'pending', { note: "Cousin's wedding. Booked flights already, sorry for the overlap.", asked: 2 }],
  ['hana.sato', 'vacation', 20, 10, 'pending', { note: 'Two weeks in Japan to see my grandparents.', asked: 3 }],
  ['jonah.ellis', 'vacation', 22, 2, 'pending', { asked: 0 }],
  ['hana.sato', 'sick', -8, 1, 'approved', { asked: 8, decidedSoon: true }],
  ['owen.price', 'vacation', -15, 5, 'approved', { note: 'Road trip.', asked: 45 }],
  ['priya.raman', 'other', 9, 1, 'cancelled', { note: 'Jury duty. Postponed by the court.', asked: 12 }],
];

export async function seedIfNew() {
  const settings = (await pool.query('SELECT seeded, timezone FROM settings WHERE id = 1')).rows[0];
  if (settings.seeded) return false;
  const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM requests');
  if (n > 0) {
    await pool.query('UPDATE settings SET seeded = true WHERE id = 1');
    return false;
  }

  const today = todayIn(settings.timezone);
  const holidays = [
    [workingDayFrom(today, 10), 'Company day off'],
    [workingDayFrom(today, 27), 'Founders’ Day'],
  ];
  const holidaySet = new Set(holidays.map(([day]) => day));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [day, name] of holidays) {
      await client.query('INSERT INTO holidays (day, name, example) VALUES ($1,$2,true) ON CONFLICT DO NOTHING', [day, name]);
    }
    for (const [user, name, admin] of PEOPLE) {
      await client.query(
        `INSERT INTO people (email, name, admin, example, last_seen) VALUES ($1,$2,$3,true, now() - interval '1 day')
         ON CONFLICT DO NOTHING`,
        [at(user), name, !!admin],
      );
    }
    // Hana joined mid-year, so her vacation is prorated: the pending trip takes her over.
    await client.query("INSERT INTO allowances (person, kind, days) VALUES ($1, 'vacation', 8) ON CONFLICT DO NOTHING", [at('hana.sato')]);

    for (const [user, kind, offset, length, status, extra] of REQUESTS) {
      const start = offset < 0 ? back(today, -offset, holidaySet) : workingDayFrom(today, offset, holidaySet);
      const end = workingDayFrom(start, length - 1, holidaySet);
      const span = { start, end, halfStart: !!extra.halfStart, halfEnd: !!extra.halfEnd };
      const days = workingDays(span, holidaySet);
      const created = `now() - interval '${extra.asked} days' - interval '${(length * 37) % 300} minutes'`;
      const decided = status === 'approved' || status === 'declined';
      const { rows: [r] } = await client.query(
        `INSERT INTO requests (person, kind, start_date, end_date, half_start, half_end, days, note, status, decided_by, decided_at, reason, example, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, ${decided ? `${created} + interval '${extra.decidedSoon ? 2 : 20} hours'` : 'NULL'}, $11, true, ${created}, ${created})
         RETURNING id, created_at, decided_at`,
        [at(user), kind, start, end, span.halfStart, span.halfEnd, days, extra.note ?? '', status, decided ? APPROVER : null, extra.reason ?? ''],
      );
      await client.query('INSERT INTO events (request_id, actor, kind, note, created_at) VALUES ($1,$2,$3,$4,$5)', [r.id, at(user), 'requested', extra.note ?? '', r.created_at]);
      if (decided) {
        await client.query('INSERT INTO events (request_id, actor, kind, note, created_at) VALUES ($1,$2,$3,$4,$5)', [r.id, APPROVER, status === 'approved' ? 'approve' : 'decline', extra.reason ?? '', r.decided_at]);
      }
      if (status === 'cancelled') {
        await client.query(`INSERT INTO events (request_id, actor, kind, created_at) VALUES ($1,$2,'cancel', ${created} + interval '3 days')`, [r.id, at(user)]);
      }
    }
    await client.query('UPDATE settings SET seeded = true WHERE id = 1');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return true;
}

/** The working day `n` working days before `day`. */
function back(day, n, holidays) {
  let d = day;
  for (let i = 0; i < n; i += 1) {
    d = addDays(d, -1);
    while (!isWorkingDay(d, holidays)) d = addDays(d, -1);
  }
  return d;
}

/** Everything marked as an example, and anything example people asked for. */
export async function removeExamples() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM requests WHERE example OR person IN (SELECT email FROM people WHERE example)');
    await client.query('DELETE FROM allowances WHERE person IN (SELECT email FROM people WHERE example)');
    await client.query('DELETE FROM people WHERE example');
    await client.query('DELETE FROM holidays WHERE example');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export const hasExamples = async () =>
  (await pool.query('SELECT EXISTS (SELECT 1 FROM people WHERE example) OR EXISTS (SELECT 1 FROM holidays WHERE example) AS any')).rows[0].any;
