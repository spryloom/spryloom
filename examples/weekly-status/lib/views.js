/**
 * Every page, as HTML strings. Anything a person typed goes through `esc`.
 */
import {
  STATUSES, STATUS_LABEL, addWeeks, canHandle, dueDay, isOpen, longDay, nameOf, shortDay, weekName, weekNumber, weekOf, weekRange,
} from './rules.js';

export const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true"${extra}>${body}</svg>`;
const S = (w = 1.8) => `fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const ICON = {
  mark: svg(`<rect x="3.5" y="13" width="3.4" height="7.5" rx="1.2" fill="currentColor"/><rect x="10.3" y="8.5" width="3.4" height="12" rx="1.2" fill="currentColor" opacity=".75"/><rect x="17.1" y="3.5" width="3.4" height="17" rx="1.2" fill="currentColor" opacity=".5"/>`),
  on_track: svg(`<circle cx="12" cy="12" r="9" ${S()}/><path d="M8 12.3l2.7 2.7L16 9.6" ${S(2)}/>`),
  at_risk: svg(`<path d="M12 3.8L21.2 19.5H2.8z" ${S()}/><path d="M12 10v4.2" ${S(2)}/><circle cx="12" cy="16.9" r="1.1" fill="currentColor"/>`),
  blocked: svg(`<path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z" ${S()}/><path d="M8 12h8" ${S(2.2)}/>`),
  none: svg(`<circle cx="12" cy="12" r="9" ${S()} stroke-dasharray="3 3.2"/>`),
  left: svg(`<path d="M15 5l-7 7 7 7" ${S(2)}/>`),
  right: svg(`<path d="M9 5l7 7-7 7" ${S(2)}/>`),
  arrow: svg(`<path d="M5 12h14M13 6l6 6-6 6" ${S()}/>`),
  plus: svg(`<path d="M12 5v14M5 12h14" ${S(2)}/>`),
  pen: svg(`<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z" ${S()}/><path d="M13.5 6.5l4 4" ${S()}/>`),
  check: svg(`<path d="M5 12.5l4.5 4.5L19 7.5" ${S(2.2)}/>`),
  clock: svg(`<circle cx="12" cy="12" r="8.5" ${S()}/><path d="M12 7.5V12l3 2" ${S()}/>`),
  mail: svg(`<rect x="3" y="5.5" width="18" height="13" rx="2" ${S()}/><path d="M3.5 7l8.5 6 8.5-6" ${S()}/>`),
  inbox: svg(`<path d="M3 13l2.5-7.5h13L21 13v5.5a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.5z" ${S()}/><path d="M3 13h5l1.5 2.5h5L16 13h5" ${S()}/>`),
  folder: svg(`<path d="M3 7.5A1.5 1.5 0 014.5 6H9l2 2.2h8.5A1.5 1.5 0 0121 9.7v8.8a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.5z" ${S()}/>`),
  users: svg(`<circle cx="9" cy="8.5" r="3.3" ${S()}/><path d="M3 19.5c.6-3.3 3-5.2 6-5.2s5.4 1.9 6 5.2" ${S()}/><path d="M16 5.6a3.2 3.2 0 010 6M18 14.6c1.7.7 2.8 2.4 3.1 4.9" ${S()}/>`),
  flask: svg(`<path d="M9.5 3.5h5M10.5 3.5v5.2L5 18.2A1.6 1.6 0 006.4 20.5h11.2a1.6 1.6 0 001.4-2.3l-5.5-9.5V3.5" ${S()}/><path d="M7.5 14h9" ${S()}/>`),
  chevron: svg(`<path d="M6 9l6 6 6-6" ${S(2)}/>`),
  sun: svg(`<circle cx="12" cy="12" r="4" ${S()}/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" ${S()}/>`),
};

const AVATAR_TONES = 6;
const tone = (email) => [...String(email)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 997, 7) % AVATAR_TONES;
const initials = (email, name) => esc(nameOf(email, name).split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?');
const avatar = (email, names, size = '') => `<span class="avatar t${tone(email)}${size ? ` avatar-${size}` : ''}" title="${esc(nameOf(email, names?.get(email)))}">${initials(email, names?.get(email))}</span>`;
const who = (email, names) => esc(nameOf(email, names?.get(email)));

export const chip = (status, extra = '') => `<span class="chip chip-${status}${extra}">${ICON[status]}${STATUS_LABEL[status]}</span>`;

/** The run of weekly statuses for a project, oldest on the left. */
function strip(rows, lastWeek, weeks, size = '', since) {
  // Weeks before the project existed are left out rather than shown as silent.
  const first = since ? weekOf(new Date(since).toISOString().slice(0, 10)) : undefined;
  const shown = first ? Math.max(1, Math.min(weeks, Math.round((Date.parse(lastWeek) - Date.parse(first)) / 604_800_000) + 1)) : weeks;
  weeks = shown;
  const byWeek = new Map();
  for (const r of rows) {
    const w = String(r.week);
    const prev = byWeek.get(w);
    const rank = { blocked: 3, at_risk: 2, on_track: 1 };
    if (!prev || rank[r.status] > rank[prev]) byWeek.set(w, r.status);
  }
  const cells = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const w = addWeeks(lastWeek, -i);
    const s = byWeek.get(w) ?? 'none';
    cells.push(`<span class="cell cell-${s}" title="Week of ${shortDay(w)}: ${STATUS_LABEL[s]}"></span>`);
  }
  const label = `Last ${weeks} weeks: ${cells.length ? [...Array(weeks).keys()].map((i) => STATUS_LABEL[byWeek.get(addWeeks(lastWeek, -(weeks - 1 - i))) ?? 'none']).join(', ') : ''}`;
  return `<span class="strip${size ? ` strip-${size}` : ''}" role="img" aria-label="${esc(label)}">${cells.join('')}</span>`;
}

const ago = (value) => {
  if (!value) return 'never';
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const units = [[86400 * 30, 'mo'], [86400 * 7, 'w'], [86400, 'd'], [3600, 'h'], [60, 'm']];
  for (const [size, unit] of units) if (seconds >= size) return `${Math.floor(seconds / size)}${unit} ago`;
  return 'just now';
};

/** Line breaks kept, everything else plain text. */
const prose = (text) => esc(text).replace(/\n/g, '<br>');

/* ---------- Frame ---------- */

export function layout({ title, viewer, active, body, flash, error, settings, examples, pending = 0 }) {
  const link = (href, label, key, extra = '') => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}${extra}</a>`;
  const banner = examples ? `<div class="example-bar"><div class="example-in">${ICON.flask}<p><b>You're looking at example data.</b> The projects, people and updates are made up so you can see a real week. ${viewer.admin
    ? 'Remove them when your own projects are in.</p><form method="post" action="/examples/remove" data-confirm="Remove all example projects, people and updates? Anything your team wrote stays."><button class="btn btn-sm">Remove example data</button></form>'
    : 'An admin can remove them from the Team page.</p>'}</div></div>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(title)} · Weekly Status</title><link rel="stylesheet" href="/assets/app.css"><script src="/assets/app.js" defer></script></head>
<body><header class="topbar"><div class="topbar-in">
  <a class="brand" href="/"><span class="brand-mark">${ICON.mark}</span><span class="brand-text"><b>Weekly Status</b><small>${esc(settings.team_name)}</small></span></a>
  <nav class="nav" aria-label="Main">${link('/', 'This week', 'week')}${link('/checkin', 'My check-in', 'checkin', pending ? ` <span class="badge" aria-label="${pending} to write">${pending}</span>` : '')}${link('/projects', 'Projects', 'projects')}${link('/team', 'Team', 'team')}</nav>
  <div class="who">${avatar(viewer.email)}<span class="who-text"><b>${esc(viewer.email)}</b><small>${viewer.admin ? 'Admin' : 'Member'}</small></span></div>
</div></header>
${banner}
<main class="main">${flash ? `<div class="flash" role="status">${ICON.check}<span>${esc(flash)}</span></div>` : ''}${error ? `<div class="flash flash-error" role="alert">${ICON.at_risk}<span>${esc(error)}</span></div>` : ''}${body}</main>
<footer class="foot"><span>Weekly Status · an open source starter from Spryloom</span></footer></body></html>`;
}

const empty = (icon, title, text, action = '') => `<div class="empty"><span class="empty-icon">${ICON[icon]}</span><h3>${title}</h3><p>${text}</p>${action}</div>`;

/* ---------- This week ---------- */

export function weekPage({ viewer, board, week, today, reporting, names, mine, isLead, lastWeekShown = 8, emails = { reminder: 'Weekly reminder', summary: 'Weekly summary' } }) {
  const { counts } = board;
  const current = weekOf(today);
  const prev = addWeeks(week, -1);
  const next = addWeeks(week, 1);
  const canNext = next <= current;
  const tag = week === reporting ? '<span class="tag tag-accent">Reporting now</span>' : week === current ? '<span class="tag">In progress</span>' : '';
  const pct = counts.expected ? Math.round((counts.received / counts.expected) * 100) : 0;

  const youCard = mine.total ? (() => {
    const open = isOpen(week, today);
    if (!open) return '';
    const done = mine.done >= mine.total;
    return `<a class="you ${done ? 'you-done' : ''}" href="/checkin?week=${week}">
      <span class="you-icon">${done ? ICON.check : ICON.pen}</span>
      <span class="you-body"><b>${done ? 'Your check-in is in' : `Your check-in: ${mine.done} of ${mine.total} projects`}</b><small>${done ? 'Change it until the end of next week.' : `For ${weekName(week, today)}. Three short answers per project.`}</small></span>
      <span class="you-go">${done ? 'Edit' : 'Write it'}${ICON.arrow}</span></a>`;
  })() : '';

  const tile = (cls, n, label, sub, extra = '') => `<div class="tile tile-${cls}"><span class="tile-l">${label}</span><span class="tile-n">${n}</span>${extra}<span class="tile-s">${sub}</span></div>`;
  const tiles = `<section class="tiles" aria-label="The week in numbers">
    ${tile('in', `${counts.received}<small>/${counts.expected}</small>`, 'Updates in', counts.expected ? `${pct}% of the team's check-ins` : 'Nobody is on a project yet', `<span class="meter" aria-hidden="true"><span style="width:${pct}%"></span></span>`)}
    ${tile('blocked', counts.blocked, 'Blocked', counts.openBlockers ? `${counts.openBlockers} open ${counts.openBlockers === 1 ? 'blocker or ask' : 'blockers or asks'}` : 'Nothing waiting on help')}
    ${tile('at_risk', counts.at_risk, 'At risk', counts.at_risk ? `${counts.at_risk === 1 ? 'project' : 'projects'} that could slip` : 'Nothing looks like slipping')}
    ${tile('missing', counts.missingPeople, 'Not in yet', counts.missingPeople ? `${counts.missingPeople === 1 ? 'person' : 'people'}${counts.silent ? `, ${counts.silent} ${counts.silent === 1 ? 'project' : 'projects'} silent` : ''}` : counts.expected ? 'Everyone has checked in' : 'Nobody to wait for yet')}
  </section>`;

  const blockerCard = (b) => {
    const project = board.projects.find((p) => String(p.id) === String(b.project_id)) ?? {};
    const mayHandle = canHandle(viewer, project);
    const handled = Boolean(b.handled_at);
    return `<article class="blocker blocker-${b.status}${handled ? ' is-handled' : ''}">
      <div class="blocker-top"><a class="blocker-project" href="/projects/${b.project_id}">${esc(b.projectName)}</a>${chip(b.status, ' chip-sm')}${b.running && !handled ? `<span class="tag tag-warn">${ICON.clock}Second week running</span>` : ''}</div>
      <p class="blocker-text">${prose(b.blockers || 'Marked blocked.')}</p>
      <div class="blocker-foot"><span class="person">${avatar(b.email, names, 'sm')}<span>${who(b.email, names)}</span></span>
        ${handled ? `<span class="handled">${ICON.check}Handled by ${who(b.handled_by, names)}</span>` : ''}
        ${mayHandle ? `<form method="post" action="/updates/${b.id}/handled"><input type="hidden" name="back" value="/?week=${week}"><input type="hidden" name="intent" value="${handled ? 'undo' : 'handle'}"><button class="btn btn-sm ${handled ? 'btn-ghost' : ''}">${handled ? 'Undo' : `${ICON.check}Mark handled`}</button></form>` : ''}
      </div></article>`;
  };
  const openB = board.blockers.filter((b) => !b.handled_at);
  const doneB = board.blockers.filter((b) => b.handled_at);
  const blockers = `<section class="section sec-blockers" aria-labelledby="h-blockers">
    <div class="section-head"><h2 id="h-blockers">Blockers and asks for help</h2>${openB.length ? `<span class="count count-bad">${openB.length}</span>` : ''}</div>
    ${board.blockers.length ? `<div class="blockers">${openB.map(blockerCard).join('')}</div>${doneB.length ? `<details class="handled-list"><summary>${doneB.length} handled</summary><div class="blockers">${doneB.map(blockerCard).join('')}</div></details>` : ''}`
      : `<div class="calm">${ICON.on_track}<div><b>No blockers ${week === current ? 'so far' : ''}</b><p>Nobody said they're blocked or asked for help ${weekName(week, today)}.</p></div></div>`}
  </section>`;

  const updateBlock = (u) => `<li class="entry entry-${u.status}">
      <div class="entry-head"><span class="person">${avatar(u.email, names, 'sm')}<b>${who(u.email, names)}</b></span>${chip(u.status, ' chip-sm')}</div>
      <dl class="answers">${u.moved ? `<dt>Moved</dt><dd>${prose(u.moved)}</dd>` : ''}${u.blockers ? `<dt class="dt-bad">Blocked or needs help</dt><dd>${prose(u.blockers)}</dd>` : ''}${u.next ? `<dt>Next</dt><dd>${prose(u.next)}</dd>` : ''}</dl></li>`;
  const projectRow = (p) => {
    const dots = p.people.map((e) => `<span class="dot${p.waiting.includes(e) ? '' : ' dot-in'}" title="${who(e, names)}: ${p.waiting.includes(e) ? 'not in yet' : 'checked in'}"></span>`).join('');
    return `<details class="prow prow-${p.status}">
      <summary><span class="prow-stripe" aria-hidden="true"></span>
        <span class="prow-name"><b>${esc(p.name)}</b><small>${p.lead ? `Lead: ${who(p.lead, names)}` : 'No lead set'}</small></span>
        ${chip(p.status)}
        <span class="prow-in"><span class="dots" aria-hidden="true">${dots}</span><span class="prow-n">${p.inCount}/${p.people.length} in</span></span>
        ${strip(p.strip, week, lastWeekShown, '', p.created_at)}
        <span class="prow-chev">${ICON.chevron}</span></summary>
      <div class="prow-body">
        ${p.updates.length ? `<ul class="entries">${p.updates.map(updateBlock).join('')}</ul>` : `<p class="muted pad">No updates ${weekName(week, today)} yet.</p>`}
        ${p.waiting.length ? `<p class="waiting">${ICON.clock}<span>Not in yet: ${p.waiting.map((e) => who(e, names)).join(', ')}</span></p>` : ''}
        <a class="prow-more" href="/projects/${p.id}">Project history ${ICON.arrow}</a>
      </div></details>`;
  };
  const projects = `<section class="section sec-projects" aria-labelledby="h-projects">
    <div class="section-head"><h2 id="h-projects">Projects</h2><span class="section-note">Worst status first. Squares show up to ${lastWeekShown} weeks, oldest first.</span></div>
    ${board.projects.length ? `<div class="prows">${board.projects.map(projectRow).join('')}</div>`
      : empty('folder', 'No projects yet', viewer.admin ? 'Add a project and the people on it. They get a check-in each week.' : 'An admin adds projects and the people on them. Once you are on one, your check-in appears here.', viewer.admin ? `<a class="btn btn-primary" href="/projects/new">${ICON.plus}New project</a>` : '')}
  </section>`;

  const missing = `<section class="card side-card side-missing" aria-labelledby="h-missing">
    <div class="card-head"><h2 id="h-missing">Not in yet</h2>${board.missing.length ? `<span class="count">${board.missing.length}</span>` : ''}</div>
    ${board.missing.length ? `<ul class="missing">${board.missing.map((m) => `<li>${avatar(m.email, names)}<div><b>${who(m.email, names)}</b><small>${m.projects.map((p) => esc(p.name)).join(' · ')}</small>${m.missedLastWeek ? '<span class="tag tag-warn">Missed the week before too</span>' : ''}</div></li>`).join('')}</ul>`
      : `<div class="calm calm-sm">${ICON.on_track}<div><b>${counts.expected ? "Everyone's in" : 'Nobody to wait for'}</b><p>${counts.expected ? `All ${counts.expected} check-ins are in.` : 'People appear here once they are on a project.'}</p></div></div>`}
  </section>`;

  const mail = `<section class="card side-card side-quiet side-mail">
    <div class="card-head"><h2>${ICON.mail}What gets emailed</h2></div>
    <ul class="mail-list">
      <li><b>${esc(emails.reminder)}</b><span>A reminder to each person not in yet, one email whatever the number of projects.</span></li>
      <li><b>${esc(emails.summary)}</b><span>The week's summary to admins, then a last reminder to anyone still missing.</span></li>
    </ul>
    <p class="fine">Spryloom sends at most 5 emails a day for an app, so people who leave a project with no update at all are reminded first. Everything in an email is also here.</p>
  </section>`;

  return `<section class="week-head">
    <div class="week-title">
      <div class="week-nav"><a class="icon-btn" href="/?week=${prev}" aria-label="Week before">${ICON.left}</a><span class="eyebrow">Week ${weekNumber(week)} · ${weekRange(week)}</span>${canNext ? `<a class="icon-btn" href="/?week=${next}" aria-label="Week after">${ICON.right}</a>` : `<span class="icon-btn is-off" aria-hidden="true">${ICON.right}</span>`}${tag}</div>
      <h1 class="display">Week of ${longDay(week)}</h1>
      <p class="lede">${week > current ? '' : `Read on Monday, ${shortDay(dueDay(week))}. `}${counts.expected ? `${counts.received} of ${counts.expected} check-ins in${counts.blocked ? `, ${counts.blocked} ${counts.blocked === 1 ? 'project' : 'projects'} blocked` : ''}.` : 'No one is on a project yet.'}${week !== reporting ? ` <a href="/">Back to the week being reported</a>.` : ''}</p>
    </div>
  </section>
  ${youCard}
  ${tiles}
  <div class="board">
    <div class="board-main">${blockers}${projects}</div>
    <aside class="board-side">${missing}${mail}</aside>
  </div>`;
}

/* ---------- My check-in ---------- */

export function checkinPage({ viewer, week, today, projects, existing, lastWeek, values = {}, errors = {}, names }) {
  const open = [weekOf(today), addWeeks(weekOf(today), -1)];
  const toggle = `<div class="seg-links" role="tablist">${open.map((w) => `<a href="/checkin?week=${w}" role="tab"${w === week ? ' aria-selected="true"' : ''}><b>${w === weekOf(today) ? 'This week' : 'Last week'}</b><small>${weekRange(w)}</small></a>`).join('')}</div>`;
  if (!projects.length) {
    return `<div class="page-head"><div><span class="eyebrow">Your check-in</span><h1 class="display">Week of ${longDay(week)}</h1></div></div>
    <section class="card">${empty('folder', "You're not on a project yet", 'An admin adds people to projects on the Projects page. Once you are on one, it appears here with three short questions each week.', viewer.admin ? `<a class="btn btn-primary" href="/projects">${ICON.folder}Go to projects</a>` : '')}</section>`;
  }
  const done = projects.filter((p) => existing.has(String(p.id))).length;
  const card = (p) => {
    const saved = existing.get(String(p.id));
    const v = values[p.id] ?? saved ?? {};
    const err = errors[p.id];
    const before = lastWeek.get(String(p.id));
    const id = `p${p.id}`;
    const radio = (s) => `<label class="seg seg-${s}"><input type="radio" name="${id}_status" value="${s}"${v.status === s ? ' checked' : ''}><span>${ICON[s]}${STATUS_LABEL[s]}</span></label>`;
    return `<fieldset class="ci${err ? ' ci-error' : ''}${saved ? ' ci-saved' : ''}" id="${id}" data-checkin>
      <legend class="sr">${esc(p.name)}</legend>
      <div class="ci-head"><div><h2>${esc(p.name)}</h2><small>${p.lead ? `Lead: ${who(p.lead, names)}` : ''}</small></div>
        ${saved ? `<span class="tag tag-ok">${ICON.check}Saved ${ago(saved.updated_at)}</span>` : '<span class="tag">Not in yet</span>'}</div>
      ${err ? `<p class="ci-err" role="alert">${ICON.at_risk}${esc(err)}</p>` : ''}
      <div class="ci-status" role="radiogroup" aria-label="Status for ${esc(p.name)}">${STATUSES.map(radio).join('')}</div>
      ${before?.next ? `<p class="ci-prompt"><span>Last week you planned</span>${prose(before.next)}</p>` : ''}
      <label class="field"><span>What moved?</span><textarea name="${id}_moved" rows="2" maxlength="2000" placeholder="Shipped, decided, learned. A line or two is plenty.">${esc(v.moved ?? '')}</textarea></label>
      <label class="field field-bad"><span>Blocked, or need help with? <small>Leave blank if nothing.</small></span><textarea name="${id}_blockers" rows="2" maxlength="2000" placeholder="What's in the way, and who could unblock it.">${esc(v.blockers ?? '')}</textarea></label>
      <label class="field"><span>What's next?</span><textarea name="${id}_next" rows="2" maxlength="2000" placeholder="The one or two things you'll do next week.">${esc(v.next ?? '')}</textarea></label>
    </fieldset>`;
  };
  return `<div class="page-head checkin-head"><div><span class="eyebrow">Your check-in · ${done} of ${projects.length} in</span><h1 class="display">Week of ${longDay(week)}</h1>
    <p class="lede">Three short answers for each project you're on. Your team reads them on the week page, and admins get the counts in Monday's summary.</p></div>${toggle}</div>
  <div class="checkin-wrap">
  <form method="post" action="/checkin" class="checkin" data-dirty-guard>
    <input type="hidden" name="week" value="${week}">
    ${projects.map(card).join('')}
    <div class="save-bar"><p>Leave a project blank to skip it. You can change this until the end of next week.</p><button class="btn btn-primary btn-lg">${ICON.check}Save check-in</button></div>
  </form>
  <aside class="checkin-side">
    <section class="card"><div class="card-head"><h2>${ICON.pen}This check-in</h2><span class="count">${done}/${projects.length}</span></div>
      <ul class="ci-nav">${projects.map((p) => `<li><a href="#p${p.id}">${existing.has(String(p.id)) ? `<span class="ci-dot ci-dot-done">${ICON.check}</span>` : '<span class="ci-dot"></span>'}<span>${esc(p.name)}</span>${existing.has(String(p.id)) ? chip(existing.get(String(p.id)).status, ' chip-sm') : '<small>To write</small>'}</a></li>`).join('')}</ul></section>
    <section class="card side-quiet"><div class="card-head"><h2>${ICON.users}Who reads it</h2></div>
      <p class="fine">Everyone in the app sees it on <b>This week</b> and on the project's page.</p>
      <p class="fine">A blocker goes to the top of the week, where an admin or the project's lead marks it handled. Name who could help.</p>
      <p class="fine">Monday's email to admins carries counts only. What you write stays in the app.</p></section>
  </aside>
  </div>`;
}

/* ---------- Projects ---------- */

export function projectsPage({ viewer, projects, archived, reporting, names }) {
  const card = (p) => `<a class="pcard pcard-${p.status}" href="/projects/${p.id}">
    <span class="pcard-top">${chip(p.status, ' chip-sm')}${p.example ? '<span class="tag tag-example">Example</span>' : ''}</span>
    <b class="pcard-name">${esc(p.name)}</b>
    <span class="pcard-sum">${esc(p.summary) || '<span class="muted">No description</span>'}</span>
    ${strip(p.strip, reporting, 8, '', p.created_at)}
    <span class="pcard-foot"><span class="stack-av">${p.people.slice(0, 5).map((e) => avatar(e, names, 'sm')).join('')}${p.people.length > 5 ? `<span class="avatar avatar-sm avatar-more">+${p.people.length - 5}</span>` : ''}</span><span class="muted">${p.people.length} ${p.people.length === 1 ? 'person' : 'people'}${p.lead ? ` · Lead ${who(p.lead, names)}` : ''}</span></span>
  </a>`;
  return `<div class="page-head"><div><h1 class="display">Projects</h1><p class="lede">Everything the team checks in on. Status is for the week of ${shortDay(reporting)}, the one being reported now.</p></div>
    ${viewer.admin ? `<a class="btn btn-primary" href="/projects/new">${ICON.plus}New project</a>` : ''}</div>
  ${projects.length ? `<div class="pgrid">${projects.map(card).join('')}</div>` : `<section class="card">${empty('folder', 'No projects yet', viewer.admin ? 'Add a project and the people on it. Each of them gets a check-in every week.' : 'An admin adds projects and the people on them.', viewer.admin ? `<a class="btn btn-primary" href="/projects/new">${ICON.plus}New project</a>` : '')}</section>`}
  ${archived.length ? `<details class="archived"><summary>${archived.length} archived ${archived.length === 1 ? 'project' : 'projects'}</summary><ul>${archived.map((p) => `<li><a href="/projects/${p.id}">${esc(p.name)}</a><span class="muted">No check-ins asked for</span></li>`).join('')}</ul></details>` : ''}`;
}

export function projectPage({ viewer, project: p, people, weeks, today, reporting, names, history }) {
  const current = weekOf(today);
  const section = ({ week, updates }) => {
    const waiting = isOpen(week, today) ? people.filter((e) => !updates.some((u) => u.email === e)) : [];
    const status = updates.length ? updates.reduce((w, u) => ({ blocked: 3, at_risk: 2, on_track: 1 }[u.status] > { blocked: 3, at_risk: 2, on_track: 1 }[w] ? u.status : w), 'on_track') : 'none';
    return `<section class="wk">
      <div class="wk-head"><h2><a href="/?week=${week}">Week of ${shortDay(week)}</a></h2><span class="muted">Week ${weekNumber(week)}${week === current ? ' · this week' : ''}</span>${chip(status, ' chip-sm')}</div>
      <div class="wk-grid">${updates.map((u) => `<article class="note note-${u.status}">
        <div class="entry-head"><span class="person">${avatar(u.email, names, 'sm')}<b>${who(u.email, names)}</b></span>${chip(u.status, ' chip-sm')}</div>
        <dl class="answers">${u.moved ? `<dt>Moved</dt><dd>${prose(u.moved)}</dd>` : ''}${u.blockers ? `<dt class="dt-bad">Blocked or needs help</dt><dd>${prose(u.blockers)}${u.handled_at ? `<span class="handled">${ICON.check}Handled by ${who(u.handled_by, names)}</span>` : ''}</dd>` : ''}${u.next ? `<dt>Next</dt><dd>${prose(u.next)}</dd>` : ''}</dl>
      </article>`).join('')}${waiting.map((e) => `<article class="note note-ghost"><span class="person">${avatar(e, names, 'sm')}<b>${who(e, names)}</b></span><p class="muted">No update yet${e === viewer.email ? ` · <a href="/checkin?week=${week}">Write yours</a>` : ''}</p></article>`).join('')}</div>
    </section>`;
  };
  return `<div class="page-head"><div><a class="back" href="/projects">${ICON.left}Projects</a>
    <div class="head-meta">${chip(p.status)}${p.archived ? '<span class="tag">Archived</span>' : ''}${p.example ? '<span class="tag tag-example">Example</span>' : ''}</div>
    <h1 class="display">${esc(p.name)}</h1>${p.summary ? `<p class="lede">${esc(p.summary)}</p>` : ''}</div>
    ${viewer.admin ? `<a class="btn" href="/projects/${p.id}/edit">${ICON.pen}Edit project</a>` : ''}</div>
  <section class="card project-meta">
    <div class="pm-item"><span class="pm-l">Lead</span>${p.lead ? `<span class="person">${avatar(p.lead, names, 'sm')}${who(p.lead, names)}</span>` : '<span class="muted">Not set</span>'}</div>
    <div class="pm-item"><span class="pm-l">People</span><span class="stack-av">${people.map((e) => avatar(e, names, 'sm')).join('') || '<span class="muted">Nobody yet</span>'}</span></div>
    <div class="pm-item pm-strip"><span class="pm-l">Week by week</span>${strip(history, reporting, 12, 'lg', p.created_at)}</div>
  </section>
  ${weeks.length ? weeks.map(section).join('') : `<section class="card">${empty('inbox', 'No check-ins yet', people.length ? 'Updates appear here, week by week, once people on this project check in.' : 'Add people to this project and they get a check-in each week.', viewer.admin && !people.length ? `<a class="btn btn-primary" href="/projects/${p.id}/edit">Add people</a>` : '')}</section>`}`;
}

export function projectForm({ project, people, error, names }) {
  const isNew = project.id === undefined;
  const list = people.map((e) => `<option value="${esc(e)}">${who(e, names)}</option>`).join('');
  return `<div class="page-head"><div><a class="back" href="${isNew ? '/projects' : `/projects/${project.id}`}">${ICON.left}${isNew ? 'Projects' : esc(project.name)}</a><h1 class="display">${isNew ? 'New project' : 'Edit project'}</h1></div></div>
  ${error ? `<div class="flash flash-error" role="alert">${ICON.at_risk}<span>${esc(error)}</span></div>` : ''}
  <form class="card form-card" method="post" action="${isNew ? '/projects/new' : `/projects/${project.id}/edit`}">
    <label class="field"><span>Name</span><input name="name" required maxlength="80" value="${esc(project.name)}" placeholder="Checkout redesign"></label>
    <label class="field"><span>What it's for <small>One line, shown on the project page.</small></span><input name="summary" maxlength="200" value="${esc(project.summary)}" placeholder="One-page checkout with saved cards, to cut drop-off at payment."></label>
    <label class="field"><span>Lead <small>Can mark this project's blockers handled.</small></span><input name="lead" type="email" list="known-people" maxlength="200" value="${esc(project.lead ?? '')}" placeholder="maya@yourcompany.com"></label>
    <label class="field"><span>People who check in <small>One email address per line. Invite each of them to the app too.</small></span><textarea name="members" rows="6" class="mono" placeholder="maya@yourcompany.com&#10;diego@yourcompany.com">${esc(project.membersText ?? '')}</textarea></label>
    <datalist id="known-people">${list}</datalist>
    <div class="form-actions">
      ${isNew ? '' : `<button class="btn btn-ghost ${project.archived ? '' : 'btn-danger'}" name="intent" value="${project.archived ? 'restore' : 'archive'}" formnovalidate${project.archived ? '' : ' data-confirm-click="Archive this project? Nobody is asked to check in on it, and its history stays."'}>${project.archived ? 'Restore project' : 'Archive project'}</button>`}
      <span class="spacer"></span>
      <a class="btn btn-ghost" href="${isNew ? '/projects' : `/projects/${project.id}`}">Cancel</a>
      <button class="btn btn-primary" name="intent" value="save">${ICON.check}${isNew ? 'Create project' : 'Save changes'}</button>
    </div>
  </form>`;
}

/* ---------- Team ---------- */

const ZONES = ['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Sao_Paulo', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Africa/Lagos', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'UTC'];

export function teamPage({ viewer, people, settings, examples, names, reporting }) {
  const zones = ZONES.includes(settings.time_zone) ? ZONES : [settings.time_zone, ...ZONES];
  const row = (p) => `<tr>
    <td><span class="person">${avatar(p.email, names)}<span class="person-two"><b>${who(p.email, names)}</b><small>${esc(p.email)}</small></span></span></td>
    <td>${p.projects.length ? `<span class="mini-chips">${p.projects.map((n) => `<span class="mini">${esc(n)}</span>`).join('')}</span>` : '<span class="muted">No projects</span>'}</td>
    <td class="num-cell">${p.last_week ? `<span class="${String(p.last_week) >= reporting ? 'ok-text' : ''}">${shortDay(String(p.last_week))}</span>` : '<span class="muted">Never</span>'}</td>
    <td>${p.admin ? '<span class="tag tag-accent">Admin</span>' : ''}${p.example ? '<span class="tag tag-example">Example</span>' : ''}${!p.last_seen && !p.example ? '<span class="tag">Not opened yet</span>' : ''}</td>
  </tr>`;
  return `<div class="page-head"><div><h1 class="display">Team</h1><p class="lede">Everyone on a project, and everyone who has opened the app. People are added to projects on the Projects page.</p></div></div>
  <div class="team">
    <section class="card table-card">
      ${people.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Person</th><th>Projects</th><th>Last check-in</th><th><span class="sr">Role</span></th></tr></thead><tbody>${people.map(row).join('')}</tbody></table></div>`
        : empty('users', 'Nobody here yet', 'People appear once they are added to a project or open the app.')}
    </section>
    <aside class="team-side">
      ${viewer.admin ? `<section class="card"><div class="card-head"><h2>Settings</h2></div>
        <form method="post" action="/settings" class="stack">
          <label class="field"><span>Team name <small>Shown under the app's name.</small></span><input name="team_name" required maxlength="60" value="${esc(settings.team_name)}"></label>
          <label class="field"><span>Time zone <small>Decides when a week starts and ends.</small></span><select name="time_zone">${zones.map((z) => `<option${z === settings.time_zone ? ' selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
          <p class="fine">The email jobs run in the time zone set in <code>spryloom.yaml</code>. Change both together.</p>
          <button class="btn">Save settings</button>
        </form></section>` : ''}
      ${examples && viewer.admin ? `<section class="card card-example"><div class="card-head"><h2>${ICON.flask}Example data</h2></div>
        <p class="fine">Five projects, ten people at @example.com and four weeks of check-ins, there to show what a week looks like. Nobody is emailed about them.</p>
        <form method="post" action="/examples/remove" data-confirm="Remove all example projects, people and updates? Anything your team wrote stays."><button class="btn btn-danger-solid btn-block">Remove example data</button></form></section>` : ''}
      <section class="card side-quiet"><div class="card-head"><h2>${ICON.users}Roles</h2></div>
        <p class="fine"><b>Admins</b> add and change projects, decide who checks in, mark any blocker handled, and get Monday's summary. They are listed in <code>spryloom.yaml</code>.</p>
        <p class="fine"><b>Members</b> write their own check-in and read everyone's. A project's lead can also mark its blockers handled.</p></section>
    </aside>
  </div>`;
}

export function notFound(what = 'Page') {
  return empty('inbox', `${what} not found`, 'It may have been removed, or the address is wrong.', `<a class="btn" href="/">${ICON.left}Back to this week</a>`);
}
