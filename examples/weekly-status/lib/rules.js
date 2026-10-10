/**
 * Weeks, statuses, who is missing, and who may do what.
 *
 * Identity comes from the headers Spryloom sets after stripping any a caller
 * sent, so these rules can trust them. Everything here is plain functions over
 * plain data, so it can be tested without a database.
 */

export const STATUSES = ['on_track', 'at_risk', 'blocked'];

export const STATUS_LABEL = {
  on_track: 'On track',
  at_risk: 'At risk',
  blocked: 'Blocked',
  none: 'No updates',
};

const RANK = { blocked: 3, at_risk: 2, none: 1.5, on_track: 1 };

/** The longest a written answer may be. */
export const MAX_TEXT = 2000;

export const viewerOf = (headers) => {
  const raw = headers['x-spryloom-email'];
  const email = typeof raw === 'string' && raw.trim() !== '' ? raw.trim().toLowerCase() : undefined;
  return email === undefined ? undefined : { email, admin: headers['x-spryloom-role'] === 'admin' };
};

/* ---------- Weeks ----------
 * A week is named by its Monday, as YYYY-MM-DD. "Today" is the date in the
 * team's time zone, so a Sunday-evening check-in in New York is still Sunday.
 */

const DAY = 86_400_000;
const toDate = (day) => new Date(`${day}T00:00:00Z`);
const fromDate = (date) => date.toISOString().slice(0, 10);

export const validTimeZone = (zone) => {
  if (typeof zone !== 'string' || zone === '') return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; }
};

/** The calendar date at `now` in `timeZone`, as YYYY-MM-DD. */
export function localDay(now, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: validTimeZone(timeZone) ? timeZone : 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export const addDays = (day, n) => fromDate(new Date(toDate(day).getTime() + n * DAY));
export const addWeeks = (week, n) => addDays(week, 7 * n);

/** 0 for Monday through 6 for Sunday. */
const weekday = (day) => (toDate(day).getUTCDay() + 6) % 7;

/** The Monday of the week `day` falls in. */
export const weekOf = (day) => addDays(day, -weekday(day));

export const isWeek = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toDate(value).getTime()) && weekOf(value) === value;

/**
 * The week the team is reporting on. Check-ins are written at the end of the
 * week and read on Monday, so from Monday to Wednesday the week that matters
 * is the one that just finished; from Thursday it is the current one.
 */
export const reportingWeek = (today) => (weekday(today) <= 2 ? addWeeks(weekOf(today), -1) : weekOf(today));

/** Weeks a person may still write or change: this one and the one before. */
export const openWeeks = (today) => [weekOf(today), addWeeks(weekOf(today), -1)];
export const isOpen = (week, today) => openWeeks(today).includes(week);

/** ISO 8601 week number. */
export function weekNumber(week) {
  const thursday = toDate(addDays(week, 3));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - yearStart) / DAY / 7) + 1;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Oct 5 – 11" or "Sep 28 – Oct 4". */
export function weekRange(week) {
  const a = toDate(week);
  const b = toDate(addDays(week, 6));
  const start = `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()}`;
  return a.getUTCMonth() === b.getUTCMonth() ? `${start} – ${b.getUTCDate()}` : `${start} – ${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}`;
}

/** "October 5". */
export const longDay = (day) => `${MONTHS_LONG[toDate(day).getUTCMonth()]} ${toDate(day).getUTCDate()}`;
/** "Oct 12". */
export const shortDay = (day) => `${MONTHS[toDate(day).getUTCMonth()]} ${toDate(day).getUTCDate()}`;
/** The Monday a week's check-ins are read: the day after it ends. */
export const dueDay = (week) => addWeeks(week, 1);

/** "this week", "last week", or "the week of Sep 21". */
export function weekName(week, today) {
  if (week === weekOf(today)) return 'this week';
  if (week === addWeeks(weekOf(today), -1)) return 'last week';
  return `the week of ${shortDay(week)}`;
}

/* ---------- Statuses ---------- */

export const isStatus = (value) => STATUSES.includes(value);

/** A project's status for a week is the worst its people reported; 'none' if nobody did. */
export function rollup(statuses) {
  let worst = 'none';
  for (const s of statuses) if (isStatus(s) && (worst === 'none' || RANK[s] > RANK[worst])) worst = s;
  return worst;
}

/** An update asks for attention when it says Blocked or names something blocking it. */
export const isBlocker = (u) => u.status === 'blocked' || String(u.blockers ?? '').trim() !== '';

/**
 * Check what someone wrote for one project. Returns the cleaned update, a
 * reason it can't be saved, or `skip` when they left it blank.
 */
export function checkUpdate(input) {
  const clean = (v) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, MAX_TEXT);
  const update = { status: isStatus(input.status) ? input.status : undefined, moved: clean(input.moved), blockers: clean(input.blockers), next: clean(input.next) };
  const wrote = update.moved || update.blockers || update.next;
  if (!update.status && !wrote) return { skip: true };
  if (!update.status) return { error: 'Choose On track, At risk or Blocked.' };
  if (!wrote) return { error: 'Add a line about what moved, so the status has a reason.' };
  if (update.status === 'blocked' && !update.blockers) return { error: 'Say what is blocking it, so someone can help.' };
  return { update };
}

/* ---------- Permissions ---------- */

export const canManage = (viewer) => viewer.admin;

/** Admins and the project's lead may mark a blocker handled. */
export const canHandle = (viewer, project) => viewer.admin || (project.lead ?? '') === viewer.email;

/** A person writes only their own update, only for a project they are on, only for an open week. */
export const canWrite = (viewer, { memberOf, week, today }) => memberOf.includes(viewer.email) && isOpen(week, today);

/* ---------- The week at a glance ---------- */

const key = (projectId, email) => `${projectId}|${email}`;

/**
 * Everything the week page shows, worked out from rows.
 *
 *  projects  active projects: {id, name, lead, created_at, ...}
 *  members   {project_id, email}
 *  updates   this week's updates
 *  previous  the week before's updates, to spot blockers running on and people missing twice
 *  history   {project_id, week, status} rows for the status strips
 *  week      the week shown
 */
export function buildBoard({ projects, members, updates, previous = [], history = [], week }) {
  // A project that didn't exist yet that week isn't waiting for anyone.
  const live = projects.filter((p) => !p.created_at || weekOf(String(toIsoDay(p.created_at))) <= week);
  const liveIds = new Set(live.map((p) => String(p.id)));
  const byKey = new Map(updates.map((u) => [key(u.project_id, u.email), u]));
  const prevByKey = new Map(previous.map((u) => [key(u.project_id, u.email), u]));
  const projectName = new Map(projects.map((p) => [String(p.id), p.name]));

  // Someone added to a project after a week ended wasn't expected to write for it.
  const joined = members.filter((m) => !m.added_at || weekOf(toIsoDay(m.added_at)) <= week);
  const rows = live.map((p) => {
    const people = joined.filter((m) => String(m.project_id) === String(p.id)).map((m) => m.email);
    const ups = updates.filter((u) => String(u.project_id) === String(p.id));
    const strip = history.filter((h) => String(h.project_id) === String(p.id));
    return {
      ...p,
      people,
      updates: ups.sort((a, b) => RANK[b.status] - RANK[a.status] || a.email.localeCompare(b.email)),
      status: rollup(ups.map((u) => u.status)),
      inCount: ups.filter((u) => people.includes(u.email)).length,
      waiting: people.filter((e) => !byKey.has(key(p.id, e))),
      strip,
    };
  }).sort((a, b) => RANK[b.status] - RANK[a.status] || a.name.localeCompare(b.name));

  const blockers = updates
    .filter((u) => liveIds.has(String(u.project_id)) && isBlocker(u))
    .map((u) => {
      const before = prevByKey.get(key(u.project_id, u.email));
      return { ...u, projectName: projectName.get(String(u.project_id)) ?? '', running: Boolean(before && isBlocker(before)) };
    })
    .sort((a, b) => Number(Boolean(a.handled_at)) - Number(Boolean(b.handled_at))
      || RANK[b.status] - RANK[a.status] || Number(b.running) - Number(a.running) || a.projectName.localeCompare(b.projectName));

  const missingMap = new Map();
  for (const p of rows) {
    for (const email of p.waiting) {
      if (!missingMap.has(email)) missingMap.set(email, { email, projects: [], missedLastWeek: false });
      const entry = missingMap.get(email);
      entry.projects.push({ id: p.id, name: p.name, dark: p.inCount === 0 });
      if (!prevByKey.has(key(p.id, email))) entry.missedLastWeek = true;
    }
  }
  const missing = [...missingMap.values()].sort((a, b) => b.projects.length - a.projects.length || a.email.localeCompare(b.email));

  const expected = rows.reduce((n, p) => n + p.people.length, 0);
  const received = rows.reduce((n, p) => n + p.inCount, 0);
  const count = (s) => rows.filter((p) => p.people.length > 0 && p.status === s).length;
  return {
    projects: rows,
    blockers,
    missing,
    counts: {
      expected, received, missingPeople: missing.length,
      blocked: count('blocked'), at_risk: count('at_risk'), on_track: count('on_track'),
      silent: rows.filter((p) => p.people.length > 0 && p.status === 'none').length,
      openBlockers: blockers.filter((b) => !b.handled_at).length,
    },
  };
}

function toIsoDay(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/* ---------- Email under the 5-a-day cap ----------
 * Spryloom sends at most 5 emails a day for an app. Every email here is one per
 * person, never one per project, and when there are more people than emails the
 * ones whose silence costs the most go first.
 */

export const EMAILS_PER_DAY = 5;

/**
 * Order people who haven't checked in. First those whose missing update leaves a
 * project with nothing at all, then those missing the most projects, then those
 * who missed last week too, then by address so the order is stable.
 */
export function pickReminders(missing, cap = EMAILS_PER_DAY) {
  const dark = (m) => m.projects.filter((p) => p.dark).length;
  return [...missing]
    .sort((a, b) => dark(b) - dark(a) || b.projects.length - a.projects.length
      || Number(b.missedLastWeek) - Number(a.missedLastWeek) || a.email.localeCompare(b.email))
    .slice(0, Math.max(0, cap));
}

/**
 * Monday's emails: the summary to each admin first, since it is the one email
 * the app exists to send, then any room left goes to people still missing.
 */
export function planMonday({ admins, missing, cap = EMAILS_PER_DAY }) {
  const summary = admins.slice(0, cap);
  const missingOthers = missing.filter((m) => !summary.includes(m.email));
  return { summary, lastCall: pickReminders(missingOthers, cap - summary.length).map((m) => m.email) };
}

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/**
 * The summary email's words. Counts only: what people typed stays in the app,
 * where it can be read in full and where the email's button leads.
 */
export function summaryText(counts, week) {
  const parts = [];
  if (counts.blocked) parts.push(`${plural(counts.blocked, 'project')} blocked`);
  if (counts.at_risk) parts.push(`${plural(counts.at_risk, 'project')} at risk`);
  if (counts.on_track) parts.push(`${counts.on_track} on track`);
  if (counts.silent) parts.push(`${plural(counts.silent, 'project')} with no update`);
  const head = `Week of ${shortDay(week)}: ${counts.received} of ${counts.expected} updates in.`;
  const body = parts.length ? ` ${parts.join(', ')}.` : '';
  const asks = counts.openBlockers ? ` ${plural(counts.openBlockers, 'blocker or ask', 'blockers or asks')} for help waiting.` : '';
  const who = counts.missingPeople ? ` Still to check in: ${plural(counts.missingPeople, 'person', 'people')}.` : ' Everyone checked in.';
  return `${head}${body}${asks}${who}`;
}

export function summarySubject(counts, week) {
  const flag = counts.blocked ? `${counts.blocked} blocked` : counts.at_risk ? `${counts.at_risk} at risk` : 'all on track';
  return `Weekly status, week of ${shortDay(week)}: ${flag}, ${counts.received}/${counts.expected} in`;
}

/** A readable name from an address when no name was given: "maya.chen@…" → "Maya Chen". */
export function nameOf(email, name) {
  if (name && name.trim()) return name.trim();
  const local = String(email).split('@')[0];
  return local.split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ') || email;
}

/** Addresses from a pasted list: one per line, or separated by commas or spaces. */
export function parseEmails(text) {
  const seen = new Set();
  const good = [];
  const bad = [];
  for (const raw of String(text ?? '').split(/[\s,;]+/)) {
    const e = raw.trim().toLowerCase().replace(/^<|>$/g, '');
    if (!e) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) { bad.push(raw.trim()); continue; }
    if (!seen.has(e)) { seen.add(e); good.push(e); }
  }
  return { good, bad };
}
