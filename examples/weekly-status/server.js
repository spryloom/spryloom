import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadWeek, namesOf, pool, removeExamples, seen, settingsOf, setup } from './lib/db.js';
import {
  addWeeks, buildBoard, canHandle, canWrite, checkUpdate, isOpen, isWeek, localDay, parseEmails, reportingWeek, rollup,
  shortDay, validTimeZone, viewerOf, weekName, weekOf,
} from './lib/rules.js';
import { checkinPage, layout, notFound, projectForm, projectPage, projectsPage, teamPage, weekPage } from './lib/views.js';
import { emailTimes } from './lib/schedule.js';

const here = dirname(fileURLToPath(import.meta.url));
// When the emails go out, as spryloom.yaml schedules them (read once; publishing again restarts the app).
const EMAIL_TIMES = emailTimes(join(here, 'spryloom.yaml'));
const port = Number(process.env.PORT ?? 8080);
const ASSETS = { '/assets/app.css': 'text/css; charset=utf-8', '/assets/app.js': 'text/javascript; charset=utf-8' };

const send = (res, status, body, type = 'text/html; charset=utf-8', extra = {}) => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...extra });
  res.end(body);
};
const redirect = (res, location) => { res.writeHead(303, { location }); res.end(); };

const readForm = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; if (body.length > 200_000) reject(new Error('too large')); });
  req.on('end', () => resolve(new URLSearchParams(body)));
  req.on('error', reject);
});

/** Short-lived message shown once after a redirect, carried in the query string. */
const withFlash = (path, message) => `${path}${path.includes('?') ? '&' : '?'}m=${encodeURIComponent(message)}`;
/** Only a path inside this app, never another site. */
const localPath = (value, fallback = '/') => (typeof value === 'string' && /^\/(?!\/)[\w\-/?=&.%]*$/.test(value) ? value : fallback);
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

const hasExamples = async () =>
  (await pool.query('SELECT EXISTS (SELECT 1 FROM projects WHERE example) OR EXISTS (SELECT 1 FROM people WHERE example) AS e')).rows[0].e;

/** Projects the viewer checks in on, active ones only. */
const projectsOf = async (email) =>
  (await pool.query('SELECT p.* FROM projects p JOIN members m ON m.project_id = p.id WHERE m.email = $1 AND NOT p.archived ORDER BY p.name', [email])).rows;

async function pendingFor(email, week) {
  const { rows: [r] } = await pool.query(
    `SELECT count(*)::int AS n FROM members m JOIN projects p ON p.id = m.project_id
     WHERE m.email = $1 AND NOT p.archived AND p.created_at < ($2::date + 7) AND m.added_at < ($2::date + 7)
       AND NOT EXISTS (SELECT 1 FROM updates u WHERE u.project_id = m.project_id AND u.email = m.email AND u.week = $2)`,
    [email, week],
  );
  return r.n;
}

async function loadProject(id) {
  if (!/^\d+$/.test(id)) return undefined;
  return (await pool.query('SELECT * FROM projects WHERE id = $1', [id])).rows[0];
}

/** Read the project form. Returns the cleaned project or why it can't be saved. */
function readProjectForm(form) {
  const name = String(form.get('name') ?? '').trim().slice(0, 80);
  const summary = String(form.get('summary') ?? '').trim().slice(0, 200);
  const leadRaw = String(form.get('lead') ?? '').trim();
  const lead = leadRaw ? parseEmails(leadRaw) : { good: [], bad: [] };
  const members = parseEmails(form.get('members'));
  const project = { name, summary, lead: lead.good[0] ?? null, members: members.good, membersText: String(form.get('members') ?? '').slice(0, 10_000) };
  if (!name) return { project, error: 'Give the project a name.' };
  if (lead.bad.length || lead.good.length > 1) return { project: { ...project, lead: leadRaw }, error: "The lead isn't an email address. Use one address, like maya@yourcompany.com." };
  if (members.bad.length) return { project, error: `${plural(members.bad.length, 'line')} in People isn't an email address: ${members.bad.slice(0, 3).join(', ')}.` };
  if (members.good.length > 100) return { project, error: 'A project can have at most 100 people.' };
  return { project };
}

async function saveMembers(projectId, project) {
  const everyone = [...new Set([...project.members, ...(project.lead ? [project.lead] : [])])];
  for (const email of everyone) await pool.query('INSERT INTO people (email) VALUES ($1) ON CONFLICT DO NOTHING', [email]);
  await pool.query('DELETE FROM members WHERE project_id = $1 AND NOT (email = ANY($2::text[]))', [projectId, project.members]);
  for (const email of project.members) await pool.query('INSERT INTO members (project_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING', [projectId, email]);
}

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
    const settings = await settingsOf();
    const today = localDay(new Date(), settings.time_zone);
    const reporting = reportingWeek(today);
    const path = url.pathname;

    const page = async (title, active, body, { status = 200, error } = {}) => send(res, status, layout({
      title, viewer, active, body, error, settings,
      flash: url.searchParams.get('m'),
      examples: await hasExamples(),
      pending: await pendingFor(viewer.email, reporting),
    }));
    const missingPage = async (what) => page('Not found', '', notFound(what), { status: 404 });
    const adminOnly = (back) => redirect(res, withFlash(back, 'Only admins change projects and settings. Ask an admin listed in spryloom.yaml.'));

    /* ----- This week ----- */
    if (req.method === 'GET' && path === '/') {
      const asked = url.searchParams.get('week');
      const week = isWeek(asked) && asked <= weekOf(today) ? asked : reporting;
      const data = await loadWeek(week, addWeeks(week, -1), addWeeks(week, -7));
      const board = buildBoard({ ...data, week });
      const mineIds = data.members.filter((m) => m.email === viewer.email).map((m) => String(m.project_id));
      const liveIds = new Set(board.projects.map((p) => String(p.id)));
      const total = mineIds.filter((id) => liveIds.has(id)).length;
      const done = data.updates.filter((u) => u.email === viewer.email && liveIds.has(String(u.project_id))).length;
      const isLead = data.projects.some((p) => p.lead === viewer.email);
      return page(week === reporting ? 'This week' : `Week of ${shortDay(week)}`, 'week',
        weekPage({ viewer, board, week, today, reporting, names: await namesOf(), mine: { total, done }, isLead, emails: EMAIL_TIMES }));
    }

    /* ----- My check-in ----- */
    if (path === '/checkin') {
      const form = req.method === 'POST' ? await readForm(req) : undefined;
      const asked = form ? form.get('week') : url.searchParams.get('week');
      const week = isWeek(asked) && isOpen(asked, today) ? asked : reporting;
      if (form && asked !== week) return redirect(res, withFlash('/checkin', `The week of ${shortDay(asked ?? today)} is closed. Check-ins can be changed until the end of the week after.`));
      const projects = (await projectsOf(viewer.email)).filter((p) => weekOf(new Date(p.created_at).toISOString().slice(0, 10)) <= week);
      const mineRows = (await pool.query('SELECT * FROM updates WHERE email = $1 AND week IN ($2, $3)', [viewer.email, week, addWeeks(week, -1)])).rows;
      const existing = new Map(mineRows.filter((u) => u.week === week).map((u) => [String(u.project_id), u]));
      const lastWeek = new Map(mineRows.filter((u) => u.week !== week).map((u) => [String(u.project_id), u]));
      const names = await namesOf();

      if (req.method === 'GET') {
        return page('My check-in', 'checkin', checkinPage({ viewer, week, today, projects, existing, lastWeek, names }));
      }
      if (req.method !== 'POST') return missingPage('Page');

      const values = {};
      const errors = {};
      const ready = [];
      for (const p of projects) {
        const input = { status: form.get(`p${p.id}_status`), moved: form.get(`p${p.id}_moved`), blockers: form.get(`p${p.id}_blockers`), next: form.get(`p${p.id}_next`) };
        values[p.id] = input;
        if (!canWrite(viewer, { memberOf: [viewer.email], week, today })) continue;
        const checked = checkUpdate(input);
        if (checked.error) errors[p.id] = checked.error;
        else if (checked.update) ready.push([p, checked.update]);
      }
      if (Object.keys(errors).length) {
        return page('My check-in', 'checkin', checkinPage({ viewer, week, today, projects, existing, lastWeek, values, errors, names }),
          { status: 400, error: `Nothing is saved yet. Fix ${plural(Object.keys(errors).length, 'project')} marked below, then save again.` });
      }
      if (!ready.length) return redirect(res, withFlash(`/checkin?week=${week}`, 'Nothing to save yet. Choose a status and write a line for at least one project.'));
      for (const [p, u] of ready) {
        await pool.query(
          `INSERT INTO updates (project_id, email, week, status, moved, blockers, next) VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (project_id, email, week) DO UPDATE SET
             status = EXCLUDED.status, moved = EXCLUDED.moved, next = EXCLUDED.next, blockers = EXCLUDED.blockers,
             handled_by = CASE WHEN updates.blockers = EXCLUDED.blockers THEN updates.handled_by END,
             handled_at = CASE WHEN updates.blockers = EXCLUDED.blockers THEN updates.handled_at END,
             example = false, updated_at = now()`,
          [p.id, viewer.email, week, u.status, u.moved, u.blockers, u.next],
        );
      }
      const left = projects.length - new Set([...existing.keys(), ...ready.map(([p]) => String(p.id))]).size;
      return redirect(res, withFlash(`/checkin?week=${week}`, `Saved ${plural(ready.length, 'update')} for ${weekName(week, today)}.${left ? ` ${plural(left, 'project')} still to write.` : ' Your check-in is complete.'}`));
    }

    /* ----- Blockers ----- */
    const h = path.match(/^\/updates\/(\d+)\/handled$/);
    if (h && req.method === 'POST') {
      const form = await readForm(req);
      const back = localPath(form.get('back'));
      const u = (await pool.query('SELECT * FROM updates WHERE id = $1', [h[1]])).rows[0];
      const project = u && await loadProject(String(u.project_id));
      if (!u || !project) return redirect(res, withFlash(back, 'That update no longer exists.'));
      if (!canHandle(viewer, project)) return redirect(res, withFlash(back, `Only admins and the project's lead mark blockers handled.`));
      if (form.get('intent') === 'undo') {
        await pool.query('UPDATE updates SET handled_by = NULL, handled_at = NULL WHERE id = $1', [u.id]);
        return redirect(res, withFlash(back, 'Marked as not handled. It is back at the top.'));
      }
      await pool.query('UPDATE updates SET handled_by = $2, handled_at = now() WHERE id = $1', [u.id, viewer.email]);
      return redirect(res, withFlash(back, `Blocker on ${project.name} marked handled.`));
    }

    /* ----- Projects ----- */
    if (req.method === 'GET' && path === '/projects') {
      const all = (await pool.query('SELECT * FROM projects ORDER BY name')).rows;
      const members = (await pool.query('SELECT project_id, email FROM members ORDER BY added_at, email')).rows;
      const history = (await pool.query('SELECT project_id, week, status FROM updates WHERE week BETWEEN $1 AND $2', [addWeeks(reporting, -7), reporting])).rows;
      const active = all.filter((p) => !p.archived).map((p) => {
        const strip = history.filter((r) => String(r.project_id) === String(p.id));
        return {
          ...p,
          people: members.filter((m) => String(m.project_id) === String(p.id)).map((m) => m.email),
          strip,
          status: rollup(strip.filter((r) => r.week === reporting).map((r) => r.status)),
        };
      });
      const rank = { blocked: 0, at_risk: 1, none: 2, on_track: 3 };
      active.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
      return page('Projects', 'projects', projectsPage({ viewer, projects: active, archived: all.filter((p) => p.archived), reporting, names: await namesOf() }));
    }

    if (path === '/projects/new') {
      if (!viewer.admin) return adminOnly('/projects');
      const people = (await pool.query('SELECT email FROM people ORDER BY email')).rows.map((r) => r.email);
      if (req.method === 'GET') {
        return page('New project', 'projects', projectForm({ project: { name: '', summary: '', lead: viewer.email, membersText: '' }, people, names: await namesOf() }));
      }
      const { project, error } = readProjectForm(await readForm(req));
      if (error) return page('New project', 'projects', projectForm({ project, people, error, names: await namesOf() }), { status: 400 });
      const { rows: [created] } = await pool.query('INSERT INTO projects (name, summary, lead) VALUES ($1, $2, $3) RETURNING id', [project.name, project.summary, project.lead]);
      await saveMembers(created.id, project);
      return redirect(res, withFlash(`/projects/${created.id}`, `${project.name} created. ${project.members.length ? `${plural(project.members.length, 'person', 'people')} will be asked to check in each week.` : 'Add people so they are asked to check in.'}`));
    }

    const pm = path.match(/^\/projects\/(\d+)(\/edit)?$/);
    if (pm) {
      const project = await loadProject(pm[1]);
      if (!project) return missingPage('Project');
      const people = (await pool.query('SELECT email FROM members WHERE project_id = $1 ORDER BY added_at, email', [project.id])).rows.map((r) => r.email);

      if (!pm[2] && req.method === 'GET') {
        const rows = (await pool.query('SELECT * FROM updates WHERE project_id = $1 AND week >= $2 ORDER BY week DESC, status, email', [project.id, addWeeks(reporting, -11)])).rows;
        const weeks = [];
        const openNow = project.archived || !people.length ? [] : [weekOf(today), addWeeks(weekOf(today), -1)]
          .filter((w) => weekOf(new Date(project.created_at).toISOString().slice(0, 10)) <= w);
        const allWeeks = [...new Set([...openNow, ...rows.map((r) => r.week)])].sort().reverse();
        const rank = { blocked: 0, at_risk: 1, on_track: 2 };
        for (const w of allWeeks) weeks.push({ week: w, updates: rows.filter((r) => r.week === w).sort((a, b) => rank[a.status] - rank[b.status]) });
        const status = rollup(rows.filter((r) => r.week === reporting).map((r) => r.status));
        return page(project.name, 'projects', projectPage({ viewer, project: { ...project, status }, people, weeks, today, reporting, names: await namesOf(), history: rows }));
      }
      if (pm[2]) {
        if (!viewer.admin) return adminOnly(`/projects/${project.id}`);
        const known = (await pool.query('SELECT email FROM people ORDER BY email')).rows.map((r) => r.email);
        if (req.method === 'GET') {
          return page(`Edit ${project.name}`, 'projects', projectForm({ project: { ...project, membersText: people.join('\n') }, people: known, names: await namesOf() }));
        }
        const form = await readForm(req);
        const intent = form.get('intent');
        if (intent === 'archive' || intent === 'restore') {
          await pool.query('UPDATE projects SET archived = $2, updated_at = now() WHERE id = $1', [project.id, intent === 'archive']);
          return redirect(res, withFlash(intent === 'archive' ? '/projects' : `/projects/${project.id}`,
            intent === 'archive' ? `${project.name} archived. Its history stays; nobody is asked to check in on it.` : `${project.name} restored.`));
        }
        const { project: draft, error } = readProjectForm(form);
        if (error) return page(`Edit ${project.name}`, 'projects', projectForm({ project: { ...project, ...draft }, people: known, error, names: await namesOf() }), { status: 400 });
        await pool.query('UPDATE projects SET name = $2, summary = $3, lead = $4, updated_at = now() WHERE id = $1', [project.id, draft.name, draft.summary, draft.lead]);
        await saveMembers(project.id, draft);
        return redirect(res, withFlash(`/projects/${project.id}`, `${draft.name} saved.`));
      }
    }

    /* ----- Team and settings ----- */
    if (req.method === 'GET' && path === '/team') {
      const people = (await pool.query(`
        SELECT p.email, p.name, p.admin, p.example, p.last_seen,
          COALESCE(array_agg(pr.name ORDER BY pr.name) FILTER (WHERE pr.id IS NOT NULL), '{}') AS projects,
          (SELECT max(week) FROM updates u WHERE u.email = p.email) AS last_week
        FROM people p
        LEFT JOIN members m ON m.email = p.email
        LEFT JOIN projects pr ON pr.id = m.project_id AND NOT pr.archived
        GROUP BY p.email
        ORDER BY p.admin DESC, lower(COALESCE(NULLIF(p.name, ''), p.email))`)).rows;
      return page('Team', 'team', teamPage({ viewer, people, settings, examples: await hasExamples(), names: await namesOf(), reporting }));
    }
    if (req.method === 'POST' && path === '/settings') {
      if (!viewer.admin) return adminOnly('/team');
      const form = await readForm(req);
      const name = String(form.get('team_name') ?? '').trim().slice(0, 60);
      const zone = String(form.get('time_zone') ?? '');
      if (!name) return redirect(res, withFlash('/team', 'Give the team a name.'));
      if (!validTimeZone(zone)) return redirect(res, withFlash('/team', `"${zone.slice(0, 40)}" isn't a time zone this app knows.`));
      await pool.query('UPDATE settings SET team_name = $1, time_zone = $2 WHERE id = 1', [name, zone]);
      return redirect(res, withFlash('/team', 'Settings saved.'));
    }
    if (req.method === 'POST' && path === '/examples/remove') {
      if (!viewer.admin) return adminOnly('/');
      await removeExamples();
      return redirect(res, withFlash('/', 'Example data removed. Add your first project to get the team checking in.'));
    }

    return missingPage('Page');
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    send(res, 500, 'Weekly Status is having trouble. Try again in a moment.', 'text/plain; charset=utf-8');
  }
});

setup().then(() => server.listen(port, '0.0.0.0', () => console.log(`weekly status listening on ${port}`)))
  .catch((error) => { console.error(error); process.exit(1); });
