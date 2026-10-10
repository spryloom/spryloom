import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { alsoOut, whoIsOut } from './lib/calendar.js';
import { pool, record, seen, settingsOf, setup } from './lib/db.js';
import { addDays, daysWord, eachDay, isIsoDate, isTimeZone, isWorkingDay, todayIn, workingDayFrom, workingDays, yearOf } from './lib/days.js';
import { emailDay, sendCounted } from './lib/notify.js';
import {
  KINDS, KIND_LABEL, KIND_PHRASE, balances, canCancel, canDecide, checkRequest, decisionMessage, nameOf, overBy, requestMessage, spanOf, viewerOf,
} from './lib/rules.js';
import { hasExamples, removeExamples, seedIfNew } from './lib/seed.js';
import { approvalsPage, calendarPage, home, layout, notFound, requestForm, requestPage, settingsPage, teamPage } from './lib/views.js';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8080);
const ASSETS = { '/assets/app.css': 'text/css; charset=utf-8', '/assets/app.js': 'text/javascript; charset=utf-8' };
// Everything is served from here; nothing is loaded from anywhere else.
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

const send = (res, status, body, type = 'text/html; charset=utf-8', extra = {}) => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'content-security-policy': CSP, 'x-content-type-options': 'nosniff', ...extra });
  res.end(body);
};
const redirect = (res, location) => { res.writeHead(303, { location }); res.end(); };

const readForm = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; if (body.length > 50_000) reject(new Error('too large')); });
  req.on('end', () => resolve(new URLSearchParams(body)));
  req.on('error', reject);
});

/** A message shown once after a redirect, carried in the query string. `e=1` marks it as a problem. */
const withFlash = (path, message, error = false) => `${path}${path.includes('?') ? '&' : '?'}m=${encodeURIComponent(message)}${error ? '&e=1' : ''}`;
const safeBack = (value, fallback) => (['/', '/approvals'].includes(value) || /^\/r\/\d+$/.test(value ?? '') ? value : fallback);
const firstName = (person) => nameOf(person.email, person.name).split(' ')[0];

/** Requests that can matter to anything on screen: from the start of last year on. */
const recentRequests = async (year) =>
  (await pool.query('SELECT * FROM requests WHERE end_date >= $1 ORDER BY start_date, id', [`${year - 1}-01-01`])).rows;
const allowanceRows = async () => (await pool.query('SELECT person, kind, days FROM allowances')).rows;

/** Everything every page needs to know about who is looking and what day it is. */
async function contextFor(viewer) {
  const settings = await settingsOf();
  const today = todayIn(settings.timezone);
  const people = (await pool.query('SELECT * FROM people ORDER BY coalesce(name, email)')).rows;
  const byEmail = new Map(people.map((p) => [p.email, p]));
  const holidays = (await pool.query('SELECT * FROM holidays ORDER BY day')).rows;
  const names = new Map(holidays.map((h) => [h.day, h.name]));
  const realAdmins = people.filter((p) => p.admin && !p.example);
  return {
    viewer,
    settings,
    today,
    year: yearOf(today),
    people,
    me: byEmail.get(viewer.email) ?? { email: viewer.email, admin: viewer.admin },
    person: (email) => byEmail.get(email) ?? { email },
    otherAdmins: realAdmins.filter((p) => p.email !== viewer.email).length,
    realAdmins,
    teamSize: people.length,
    holidays,
    holidaySet: new Set(holidays.map((h) => h.day)),
    holidayName: (day) => names.get(day),
    examples: people.some((p) => p.example) || holidays.some((h) => h.example),
    waitingCount: 0,
  };
}

/** Pending requests, soonest first, with what an approver needs to decide each one. */
function queueOf(ctx, all, allowances) {
  return all.filter((r) => r.status === 'pending')
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || new Date(a.created_at) - new Date(b.created_at))
    .map((r) => describe(ctx, r, all, allowances));
}

function describe(ctx, r, all, allowances) {
  const balance = balances(r.person, yearOf(r.start_date), all, allowances)[r.kind];
  const others = alsoOut(r, all);
  let peak = 1;
  for (const day of eachDay(r.start_date, r.end_date)) {
    if (!isWorkingDay(day, ctx.holidaySet)) continue;
    const firm = others.filter((o) => o.status === 'approved' && o.start_date <= day && o.end_date >= day).map((o) => o.person);
    peak = Math.max(peak, 1 + new Set(firm).size);
  }
  return {
    r,
    balance,
    over: r.status === 'pending' ? overBy(balance, r.days, true) : 0,
    others,
    peak,
    decide: canDecide(ctx.viewer, r, ctx.otherAdmins),
  };
}

/** Recount the working days of every live request that includes `day`, after a holiday changes. */
async function recount(day) {
  const holidays = new Set((await pool.query('SELECT day FROM holidays')).rows.map((h) => h.day));
  const { rows } = await pool.query(`SELECT * FROM requests WHERE start_date <= $1 AND end_date >= $1 AND status IN ('pending','approved')`, [day]);
  for (const r of rows) {
    const days = workingDays(spanOf(r), holidays);
    await pool.query('UPDATE requests SET days = $2, updated_at = now() WHERE id = $1', [r.id, days]);
  }
  return rows.length;
}

const numberOrNull = (value) => {
  const text = String(value ?? '').trim();
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && n <= 365 ? Math.round(n * 2) / 2 : undefined;
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://app');
    if (req.method === 'GET' && ASSETS[url.pathname]) {
      const file = await readFile(join(here, 'public', url.pathname.slice('/assets/'.length)));
      return send(res, 200, file, ASSETS[url.pathname], { 'cache-control': 'public, max-age=300' });
    }

    const viewer = viewerOf(req.headers);
    if (!viewer) return send(res, 401, 'Sign in through Spryloom first.', 'text/plain; charset=utf-8');
    await seen(viewer);
    const ctx = await contextFor(viewer);
    const path = url.pathname;
    const all = await recentRequests(ctx.year);
    const allowances = await allowanceRows();
    const queue = viewer.admin ? queueOf(ctx, all, allowances) : [];
    ctx.waitingCount = queue.filter((q) => q.decide.ok).length;
    const flash = url.searchParams.get('m');
    const page = (title, active, body, status = 200) =>
      send(res, status, layout({ title, ctx, active, body, flash, flashKind: url.searchParams.get('e') ? 'error' : 'ok' }));
    const adminOnly = () => redirect(res, withFlash('/', 'Only admins can open that page.', true));

    /* ----- Home ----- */
    if (req.method === 'GET' && path === '/') {
      const mine = all.filter((r) => r.person === viewer.email);
      const next = [0, 1, 2, 3, 4].map((n) => workingDayFrom(ctx.today, n, ctx.holidaySet));
      const week = whoIsOut(all, next, ctx.holidaySet);
      return page('Home', 'home', home(ctx, { mine, balances: balances(viewer.email, ctx.year, all, allowances), queue: [...queue.filter((q) => q.decide.ok), ...queue.filter((q) => !q.decide.ok)], week }));
    }

    /* ----- Asking for time off ----- */
    if (path === '/request') {
      const formView = (values, error) => {
        const yearOfForm = values?.start && isIsoDate(values.start) ? yearOf(values.start) : ctx.year;
        const team = all.filter((r) => r.person !== viewer.email && (r.status === 'approved' || r.status === 'pending') && r.end_date >= addDays(ctx.today, -30))
          .map((r) => [nameOf(r.person, ctx.person(r.person).name), r.start_date, r.end_date, r.status === 'pending' ? 1 : 0]);
        return requestForm(ctx, { values, error, balances: balances(viewer.email, yearOfForm, all, allowances), team });
      };
      if (req.method === 'GET') {
        const start = url.searchParams.get('start');
        return page('Request time off', 'request', formView(isIsoDate(start) ? { start } : {}));
      }
      if (req.method === 'POST') {
        const form = await readForm(req);
        const values = Object.fromEntries(['kind', 'start', 'end', 'first', 'last', 'note'].map((k) => [k, String(form.get(k) ?? '')]));
        const mine = all.filter((r) => r.person === viewer.email);
        const checked = checkRequest(values, { today: ctx.today, holidays: ctx.holidaySet, mine });
        if (checked.error) return page('Request time off', 'request', formView(values, checked.error), 422);
        const v = checked.value;
        const { rows: [r] } = await pool.query(
          `INSERT INTO requests (person, kind, start_date, end_date, half_start, half_end, days, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [viewer.email, v.kind, v.start, v.end, v.halfStart, v.halfEnd, v.days, v.note],
        );
        await record(r.id, viewer.email, 'requested', v.note);
        const balance = balances(viewer.email, yearOf(v.start), [...all, r], allowances)[v.kind];
        const over = overBy(balance, v.days, true);
        const approvers = ctx.realAdmins.filter((p) => p.email !== viewer.email);
        const message = requestMessage(r, nameOf(viewer.email, ctx.me.name), ctx.year);
        for (const a of approvers) await sendCounted('request', { to: a.email, ...message, dedupeKey: `request-${r.id}-${a.email}` });
        const who = approvers.length ? 'An admin will approve or decline it' : 'You are the only admin, so you can approve it yourself';
        const overText = over ? ` It takes you ${daysWord(over)} past your ${KIND_LABEL[v.kind].toLowerCase()} allowance, which the approver will see.` : '';
        return redirect(res, withFlash(`/r/${r.id}`, `Request sent for ${daysWord(v.days)}. ${who}.${overText}`));
      }
    }

    /* ----- One request ----- */
    const m = path.match(/^\/r\/(\d+)(?:\/(approve|decline|cancel))?$/);
    if (m) {
      const r = (await pool.query('SELECT * FROM requests WHERE id = $1', [m[1]])).rows[0];
      if (!r || (!viewer.admin && r.person !== viewer.email)) {
        return page('Not found', '', notFound('This request does not exist, or it is someone else\'s. You can open your own requests; admins can open everyone\'s.'), 404);
      }
      const action = m[2];
      const item = describe(ctx, r, all.some((x) => x.id === r.id) ? all : [...all, r], allowances);
      if (req.method === 'GET' && !action) {
        const events = (await pool.query('SELECT * FROM events WHERE request_id = $1 ORDER BY created_at, id', [r.id])).rows;
        return page(`${daysWord(r.days)} off`, viewer.admin && r.person !== viewer.email ? 'approvals' : 'home', requestPage(ctx, { r, events, item, cancel: canCancel(viewer, r, ctx.today) }));
      }
      if (req.method !== 'POST') return redirect(res, `/r/${r.id}`);
      const form = await readForm(req);
      const back = safeBack(form.get('back'), `/r/${r.id}`);
      const person = ctx.person(r.person);

      if (action === 'approve' || action === 'decline') {
        const decide = canDecide(viewer, r, ctx.otherAdmins);
        if (!decide.ok) return redirect(res, withFlash(back, decide.why, true));
        const reason = String(form.get('reason') ?? '').trim().slice(0, 500);
        if (action === 'decline' && !reason) return redirect(res, withFlash(back === '/' ? `/r/${r.id}` : back, `Say why you're declining, so ${firstName(person)} can plan around it.`, true));
        const status = action === 'approve' ? 'approved' : 'declined';
        const { rows: [after] } = await pool.query(
          `UPDATE requests SET status = $2, decided_by = $3, decided_at = now(), reason = $4, self_approved = $5, updated_at = now()
           WHERE id = $1 AND status = 'pending' RETURNING *`,
          [r.id, status, viewer.email, reason, !!decide.self],
        );
        if (!after) return redirect(res, withFlash(back, 'Someone else decided this request a moment ago.', true));
        await record(r.id, viewer.email, decide.self ? 'self_approve' : action, reason);
        if (!decide.self) await sendCounted('decision', { to: r.person, ...decisionMessage(after, nameOf(viewer.email, ctx.me.name), ctx.year), dedupeKey: `decision-${r.id}` });
        const what = `${firstName(person)}'s ${daysWord(r.days)} of ${KIND_PHRASE[r.kind]}`;
        return redirect(res, withFlash(back, action === 'approve' ? `Approved ${what}.` : `Declined ${what}. They'll see your reason.`));
      }

      if (action === 'cancel') {
        if (!canCancel(viewer, r, ctx.today)) return redirect(res, withFlash(`/r/${r.id}`, 'This time off can no longer be cancelled here. Ask an admin.', true));
        await pool.query(`UPDATE requests SET status = 'cancelled', updated_at = now() WHERE id = $1`, [r.id]);
        await record(r.id, viewer.email, 'cancel');
        if (r.person !== viewer.email && r.status === 'approved') {
          await sendCounted('decision', { to: r.person, subject: 'Your approved time off was cancelled', text: `${nameOf(viewer.email, ctx.me.name)} cancelled your ${KIND_LABEL[r.kind].toLowerCase()} for ${daysWord(r.days)}. Talk to them if this is unexpected.`, button: { label: 'See your time off', path: `/r/${r.id}` }, dedupeKey: `cancel-${r.id}` });
        }
        return redirect(res, withFlash(`/r/${r.id}`, 'Cancelled. The days are back in the balance.'));
      }
    }

    /* ----- Approvals ----- */
    if (req.method === 'GET' && path === '/approvals') {
      if (!viewer.admin) return adminOnly();
      const recent = all.filter((r) => (r.status === 'approved' || r.status === 'declined') && r.decided_at && Date.now() - new Date(r.decided_at) < 30 * 86_400_000)
        .sort((a, b) => new Date(b.decided_at) - new Date(a.decided_at)).slice(0, 30);
      return page('Approvals', 'approvals', approvalsPage(ctx, { queue, recent }));
    }

    /* ----- Calendar ----- */
    if (req.method === 'GET' && path === '/calendar') {
      const view = url.searchParams.get('view') === 'week' ? 'week' : 'month';
      const anchor = isIsoDate(url.searchParams.get('d')) ? url.searchParams.get('d') : ctx.today;
      const wide = (await pool.query(
        `SELECT * FROM requests WHERE status IN ('pending','approved') AND end_date >= $1 AND start_date <= $2`,
        [addDays(anchor, -45), addDays(anchor, 45)],
      )).rows;
      return page('Calendar', 'calendar', calendarPage(ctx, { view, anchor, people: ctx.people, requests: wide }));
    }

    /* ----- Team ----- */
    if (path === '/team' || path.startsWith('/team/')) {
      if (!viewer.admin) return adminOnly();
      if (req.method === 'GET' && path === '/team') {
        const rows = ctx.people.map((person) => ({
          person,
          balances: balances(person.email, ctx.year, all, allowances),
          overrides: allowances.filter((a) => a.person === person.email),
          out: all.some((r) => r.person === person.email && r.status === 'approved' && r.start_date <= ctx.today && r.end_date >= ctx.today),
        }));
        return page('Team', 'team', teamPage(ctx, { rows, defaults: allowances.filter((a) => a.person === '') }));
      }
      if (req.method === 'POST' && (path === '/team/defaults' || path === '/team/person')) {
        const form = await readForm(req);
        const person = path === '/team/defaults' ? '' : String(form.get('email') ?? '').toLowerCase();
        if (person && !ctx.people.some((p) => p.email === person)) return redirect(res, withFlash('/team', 'That person has not opened the app yet.', true));
        const values = Object.fromEntries(KINDS.map((k) => [k, numberOrNull(form.get(k))]));
        if (Object.values(values).includes(undefined)) return redirect(res, withFlash('/team', 'Allowances are a number of days from 0 to 365, in half days at most.', true));
        for (const kind of KINDS) {
          if (person && values[kind] === null) await pool.query('DELETE FROM allowances WHERE person = $1 AND kind = $2', [person, kind]);
          else await pool.query('INSERT INTO allowances (person, kind, days) VALUES ($1,$2,$3) ON CONFLICT (person, kind) DO UPDATE SET days = EXCLUDED.days', [person, kind, values[kind]]);
        }
        return redirect(res, withFlash('/team', person ? `Saved ${firstName(ctx.person(person))}'s allowance. Empty types use the company number.` : 'Saved the company allowance. People with their own numbers keep them.'));
      }
    }

    /* ----- Settings ----- */
    if (path === '/settings' || path.startsWith('/settings/')) {
      if (!viewer.admin) return adminOnly();
      if (req.method === 'GET' && path === '/settings') {
        return page('Settings', 'settings', settingsPage(ctx, { holidays: ctx.holidays.filter((h) => yearOf(h.day) >= ctx.year), email: await emailDay(), examples: await hasExamples() }));
      }
      if (req.method === 'POST') {
        const form = await readForm(req);
        if (path === '/settings/holidays') {
          const day = String(form.get('day') ?? '');
          const name = String(form.get('name') ?? '').trim().slice(0, 80);
          if (!isIsoDate(day) || !name) return redirect(res, withFlash('/settings', 'A holiday needs a date and a name.', true));
          await pool.query('INSERT INTO holidays (day, name) VALUES ($1,$2) ON CONFLICT (day) DO UPDATE SET name = EXCLUDED.name, example = false', [day, name]);
          const n = await recount(day);
          return redirect(res, withFlash('/settings', `Added ${name}.${n ? ` ${n} ${n === 1 ? 'request that includes it was' : 'requests that include it were'} recounted.` : ''}`));
        }
        if (path === '/settings/holidays/remove') {
          const day = String(form.get('day') ?? '');
          const { rows: [h] } = await pool.query('DELETE FROM holidays WHERE day = $1 RETURNING name', [isIsoDate(day) ? day : '1900-01-01']);
          if (!h) return redirect(res, '/settings');
          const n = await recount(day);
          return redirect(res, withFlash('/settings', `Removed ${h.name}.${n ? ` ${n} ${n === 1 ? 'request was' : 'requests were'} recounted.` : ''}`));
        }
        if (path === '/settings/company') {
          const name = String(form.get('company_name') ?? '').trim().slice(0, 120);
          const zone = String(form.get('timezone') ?? '').trim();
          if (!name) return redirect(res, withFlash('/settings', 'The company needs a name.', true));
          if (!isTimeZone(zone)) return redirect(res, withFlash('/settings', `"${zone.slice(0, 60)}" is not a timezone. Use a name such as Europe/London.`, true));
          await pool.query('UPDATE settings SET company_name = $1, timezone = $2 WHERE id = 1', [name, zone]);
          return redirect(res, withFlash('/settings', 'Saved.'));
        }
        if (path === '/settings/examples') {
          await removeExamples();
          return redirect(res, withFlash('/', 'Example data removed. Everything real people did is still here.'));
        }
      }
    }

    page('Not found', '', notFound('There is no page here.'), 404);
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    send(res, 500, 'Time Off is having trouble. Try again in a moment.', 'text/plain; charset=utf-8');
  }
});

setup()
  .then(seedIfNew)
  .then((seeded) => {
    if (seeded) console.log('added example data: 10 people at example.com, removable from Settings');
    server.listen(port, '0.0.0.0', () => console.log(`time-off listening on ${port}`));
  })
  .catch((error) => { console.error(error); process.exit(1); });
