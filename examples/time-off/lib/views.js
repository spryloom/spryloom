/**
 * Every page, as HTML strings. Anything a person typed goes through `esc`.
 *
 * Coworkers see that someone is out, never why: the type of leave and any
 * note are shown only to the person themselves and to admins.
 */
import { personCells, outByDay } from './calendar.js';
import {
  addDays, addMonths, dayCount, dayName, daysWord, eachDay, endOfMonth, fullDate, isWorkingDay, longDate,
  monthName, rangeText, shortDate, startOfMonth, startOfWeek, yearOf,
} from './days.js';
import { DAYS_BACK, KINDS, KIND_HINT, KIND_LABEL, KIND_PHRASE, STATUS_LABEL, crowded, nameOf } from './rules.js';

export const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${extra}>${body}</svg>`;
export const ICON = {
  sun: svg('<circle cx="12" cy="13" r="4.2"/><path d="M12 4.5v1.6M5.4 7.4l1.1 1.1M18.6 7.4l-1.1 1.1M3.5 13h1.6M18.9 13h1.6M3 19.5h18"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', ' stroke-width="2.1"'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', ' stroke-width="2.2"'),
  x: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', ' stroke-width="2.1"'),
  clock: svg('<circle cx="12" cy="12" r="8.2"/><path d="M12 7.6V12l3 2"/>'),
  ban: svg('<circle cx="12" cy="12" r="8.2"/><path d="M6.3 6.3l11.4 11.4"/>'),
  home: svg('<path d="M4 10.5L12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M7.5 13.5h3v3h-3z" fill="currentColor" stroke="none"/>'),
  inbox: svg('<path d="M4 13.5l2.2-7.3A2 2 0 0 1 8.1 5h7.8a2 2 0 0 1 1.9 1.2l2.2 7.3V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 13.5h4.5l1.2 2h4.6l1.2-2H20"/>'),
  users: svg('<circle cx="9" cy="8.5" r="3.3"/><path d="M3.2 19.5c.6-3.2 3-5 5.8-5s5.2 1.8 5.8 5"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6.1M17.6 14.8c1.6.7 2.8 2.3 3.2 4.7"/>'),
  sliders: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/>'),
  left: svg('<path d="M14.5 6l-6 6 6 6"/>', ' stroke-width="2"'),
  right: svg('<path d="M9.5 6l6 6-6 6"/>', ' stroke-width="2"'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  alert: svg('<path d="M12 4.2L21 19.5H3z"/><path d="M12 10v4.2M12 16.9v.1"/>', ' stroke-width="1.9"'),
  info: svg('<circle cx="12" cy="12" r="8.4"/><path d="M12 11v5.2M12 7.9v.1"/>', ' stroke-width="1.9"'),
  trash: svg('<path d="M5 7h14M10 7V4.8h4V7M7 7l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h5.4a1.5 1.5 0 0 0 1.5-1.3L17 7"/>'),
  flag: svg('<path d="M5.5 21V4.5M5.5 5h11l-2.2 3.8L16.5 12.5h-11"/>'),
  note: svg('<path d="M5 4.5h14v11l-4.5 4.5H5z"/><path d="M14.5 20v-4.5H19M8.5 9h7M8.5 12.5h4"/>'),
  vacation: svg('<rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V5.6c0-.6.5-1.1 1.1-1.1h3.8c.6 0 1.1.5 1.1 1.1v1.9M8 7.5v12M16 7.5v12"/>'),
  sick: svg('<path d="M14 13.6V5a2 2 0 1 0-4 0v8.6a4 4 0 1 0 4 0z"/><path d="M12 9.5v6"/>'),
  personal: svg('<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.8 3.6-5.8 7-5.8s6.2 2 7 5.8"/>'),
  other: svg('<path d="M12 4v16M5.1 8l13.8 8M5.1 16l13.8-8"/>'),
  sparkle: svg('<path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z"/>'),
};

/* ---------- Small pieces ---------- */

const HUES = ['coral', 'teal', 'iris', 'ochre', 'berry', 'sky', 'moss', 'slate'];
const hueOf = (email) => HUES[[...String(email)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];
const initials = (name) => esc(String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?');

export function avatar(person, size = '') {
  const name = nameOf(person.email, person.name);
  return `<span class="avatar av-${hueOf(person.email)}${size ? ` avatar-${size}` : ''}${person.example ? ' avatar-example' : ''}" title="${esc(name)}">${initials(name)}</span>`;
}

const kindChip = (kind) => `<span class="kind kind-${kind}">${ICON[kind]}${KIND_LABEL[kind]}</span>`;
const STATUS_ICON = { pending: 'clock', approved: 'check', declined: 'x', cancelled: 'ban' };
export const statusChip = (status) => `<span class="status status-${status}">${ICON[STATUS_ICON[status]]}${STATUS_LABEL[status]}</span>`;
const exampleTag = (on) => (on ? '<span class="tag tag-example">Example</span>' : '');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const ago = (value) => {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 3600) return seconds < 120 ? 'just now' : `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  const days = Math.floor(seconds / 86400);
  return days === 1 ? 'yesterday' : days < 45 ? `${days} days ago` : new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const waited = (value) => {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  return days < 1 ? 'Asked today' : `Waiting ${plural(days, 'day')}`;
};

/** "Afternoon only", "Morning only", or the range with half-day ends spelled out. */
export function whenText(r, year) {
  const range = rangeText(r.start_date, r.end_date, year);
  if (r.start_date === r.end_date) return r.half_start ? `${range}, afternoon` : r.half_end ? `${range}, morning` : range;
  const bits = [r.half_start ? 'from midday' : '', r.half_end ? 'back after lunch' : ''].filter(Boolean);
  return bits.length ? `${range} (${bits.join(', ')})` : range;
}

const dateBlock = (day) => `<span class="dateblock"><small>${esc(shortDate(day).split(' ')[0])}</small><b>${Number(day.slice(8))}</b></span>`;

const empty = (icon, title, text, action = '') => `<div class="empty"><span class="empty-ico">${ICON[icon]}</span><h3>${title}</h3><p>${text}</p>${action}</div>`;

/* ---------- Layout ---------- */

export function layout({ title, ctx, active, body, flash, flashKind }) {
  const { viewer, me, examples, waitingCount, settings } = ctx;
  const items = [
    ['/', 'home', 'Home', 'home'],
    ['/calendar', 'calendar', 'Calendar', 'calendar'],
    ...(viewer.admin ? [
      ['/approvals', 'approvals', 'Approvals', 'inbox', waitingCount],
      ['/team', 'team', 'Team', 'users'],
      ['/settings', 'settings', 'Settings', 'sliders'],
    ] : []),
  ];
  const link = ([href, key, label, icon, badge]) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${ICON[icon]}<span>${label}</span>${badge ? `<span class="badge" aria-label="${badge} waiting">${badge}</span>` : ''}</a>`;
  const banner = examples ? `<div class="example-bar"><div class="example-in">${ICON.sparkle}<p><b>You're looking at example data.</b> ${viewer.admin
    ? 'Ten made-up people at example.com show how it works. Remove them when your team starts.'
    : 'The made-up people at example.com go once an admin removes them.'}</p>${viewer.admin
    ? '<form method="post" action="/settings/examples" data-confirm="Remove all example people, requests and holidays? Your own data stays."><button class="btn btn-sm">Remove example data</button></form>' : ''}</div></div>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><title>${esc(title)} · Time Off</title>
<link rel="stylesheet" href="/assets/app.css"><script src="/assets/app.js" defer></script></head>
<body class="${viewer.admin ? 'is-admin' : 'is-member'}"><a class="skip" href="#main">Skip to content</a>
<header class="topbar"><div class="topbar-in">
  <a class="brand" href="/"><span class="brand-mark">${ICON.sun}</span><span class="brand-text"><b>Time Off</b><small>${esc(settings.company_name)}</small></span></a>
  <nav class="nav" aria-label="Main">${items.map(link).join('')}</nav>
  <a class="btn btn-primary btn-sm top-cta" href="/request">${ICON.plus}<span>Request</span></a>
  <div class="who">${avatar(me)}<span class="who-text"><b>${esc(nameOf(me.email, me.name))}</b><small>${viewer.admin ? 'Admin' : 'Member'}</small></span></div>
</div></header>
${banner}
<main class="main" id="main">${flash ? `<div class="flash${flashKind === 'error' ? ' flash-error' : ''}" role="${flashKind === 'error' ? 'alert' : 'status'}">${ICON[flashKind === 'error' ? 'alert' : 'check']}<span>${esc(flash)}</span></div>` : ''}${body}</main>
<nav class="tabbar" aria-label="Main">${items.slice(0, 2).map(link).join('')}<a class="tab-cta" href="/request" aria-label="Request time off">${ICON.plus}<span>Request</span></a>${items.slice(2, 4).map(link).join('')}${viewer.admin ? '' : '<span></span><span></span>'}</nav>
</body></html>`;
}

/* ---------- Balances ---------- */

function balanceCard(b) {
  if (b.allowance === null) {
    return `<article class="bal bal-${b.kind}"><header><span class="kind-ico">${ICON[b.kind]}</span>${KIND_LABEL[b.kind]}</header>
      <div class="bal-n"><b>${dayCount(b.used)}</b><span>${b.used === 1 ? 'day' : 'days'} taken</span></div>
      <div class="meter meter-open"></div>
      <p class="bal-foot"><span>Not counted against an allowance${b.pending ? ` · ${dayCount(b.pending)} waiting` : ''}</span></p></article>`;
  }
  const total = Math.max(b.allowance, b.used + b.pending, 0.5);
  const pct = (n) => `${Math.max(0, Math.min(100, (n / total) * 100)).toFixed(1)}%`;
  const over = b.left < 0;
  return `<article class="bal bal-${b.kind}${over ? ' bal-over' : ''}"><header><span class="kind-ico">${ICON[b.kind]}</span>${KIND_LABEL[b.kind]}</header>
    <div class="bal-n"><b>${dayCount(over ? -b.left : b.left)}</b><span>${over ? 'over allowance' : `${Math.abs(b.left) === 1 ? 'day' : 'days'} left`}</span></div>
    <div class="meter" role="img" aria-label="${dayCount(b.used)} taken, ${dayCount(b.pending)} waiting, of ${dayCount(b.allowance)}"><i class="m-used" style="width:${pct(b.used)}"></i><i class="m-pending" style="width:${pct(b.pending)}"></i></div>
    <p class="bal-foot"><span><b>${dayCount(b.used)}</b> taken</span>${b.pending ? `<span><b>${dayCount(b.pending)}</b> waiting</span>` : ''}<span class="bal-of">of ${dayCount(b.allowance)}</span></p></article>`;
}

/* ---------- Home ---------- */

function requestRow(r, ctx, { showPerson = false } = {}) {
  const person = ctx.person(r.person);
  return `<li><a class="req-row req-${r.status}" href="/r/${r.id}">
    ${dateBlock(r.start_date)}
    <span class="req-main"><span class="req-what">${showPerson ? `<b>${esc(nameOf(person.email, person.name))}</b>` : ''}${kindChip(r.kind)}<span class="req-days">${daysWord(r.days)}</span></span>
      <span class="req-when">${esc(whenText(r, ctx.year))}</span></span>
    ${statusChip(r.status)}</a></li>`;
}

export function weekStrip(ctx, week, { title = 'Who\u2019s out', link = true } = {}) {
  const teamSize = ctx.teamSize;
  const days = week.map(({ day, working, out }) => {
    const firm = out.filter((o) => o.r.status === 'approved').length;
    const busy = working && crowded(firm, teamSize);
    const names = out.slice(0, 3).map(({ r }) => `${esc(nameOf(r.person, ctx.person(r.person).name).split(' ')[0])}${r.status === 'pending' ? ' <i>(waiting)</i>' : ''}`).join(', ') + (out.length > 3 ? ` +${out.length - 3}` : '');
    const faces = out.slice(0, 4).map(({ r }) => `<span class="face${r.status === 'pending' ? ' face-pending' : ''}">${avatar(ctx.person(r.person), 'sm')}</span>`).join('');
    const more = out.length > 4 ? `<span class="face-more">+${out.length - 4}</span>` : '';
    return `<li class="wk-day${day === ctx.today ? ' is-today' : ''}${working ? '' : ' is-off'}${busy ? ' is-busy' : ''}">
      <span class="wk-name">${day === ctx.today ? 'Today' : esc(dayName(day))}<b>${Number(day.slice(8))}</b></span>
      ${!working ? `<span class="wk-off">${ctx.holidayName(day) ? `${ICON.flag}${esc(ctx.holidayName(day))}` : 'Weekend'}</span>`
        : out.length ? `<span class="faces">${faces}${more}</span><span class="wk-count">${names}</span>`
        : '<span class="wk-none">Everyone in</span>'}
      ${busy ? `<span class="wk-busy" title="Several people are out">${ICON.alert}</span>` : ''}</li>`;
  }).join('');
  return `<section class="card week-card"><div class="card-head"><h2>${title}</h2>${link ? `<a class="more" href="/calendar">Calendar ${ICON.arrow}</a>` : ''}</div><ol class="wk">${days}</ol></section>`;
}

function queueCard(item, ctx, { compact = false } = {}) {
  const { r, balance, over, others, peak, decide } = item;
  const person = ctx.person(r.person);
  const firmOthers = others.filter((o) => o.status === 'approved');
  const firstNames = (list) => list.slice(0, 3).map((o) => esc(nameOf(o.person, ctx.person(o.person).name).split(' ')[0])).join(', ');
  const flags = [];
  if (over > 0) flags.push(`<span class="flag flag-warn">${ICON.alert}${dayCount(over)} over ${KIND_LABEL[r.kind].toLowerCase()} allowance</span>`);
  if (crowded(peak, ctx.teamSize)) flags.push(`<span class="flag flag-busy">${ICON.users}${peak} out at once</span>`);
  else if (firmOthers.length) flags.push(`<span class="flag">${ICON.users}${compact ? `${plural(firmOthers.length, 'other')} out then` : `${firstNames(firmOthers)} also out`}</span>`);
  if (crowded(peak, ctx.teamSize) && !compact) flags.push(`<span class="flag">${ICON.users}${firstNames(firmOthers)} also out</span>`);
  if (r.note && compact) flags.push(`<span class="flag">${ICON.note}Note</span>`);
  const balanceLine = balance && balance.allowance !== null
    ? `${dayCount(Math.max(balance.left + Number(r.days), 0))} of ${dayCount(balance.allowance)} ${KIND_LABEL[r.kind].toLowerCase()} days left before this`
    : 'Not counted against an allowance';
  const actions = decide.ok
    ? `<div class="q-actions"><form method="post" action="/r/${r.id}/approve"><input type="hidden" name="back" value="${compact ? '/' : '/approvals'}"><button class="btn btn-approve">${ICON.check}Approve</button></form>
       <details class="decline"><summary class="btn btn-ghost">Decline…</summary><form method="post" action="/r/${r.id}/decline" class="decline-form"><input type="hidden" name="back" value="${compact ? '/' : '/approvals'}">
         <label class="field"><span>Reason, shown to ${esc(nameOf(person.email, person.name).split(' ')[0])}</span><textarea name="reason" rows="2" required maxlength="500" placeholder="Release week. Could you take the week after instead?"></textarea></label>
         <button class="btn btn-decline">${ICON.x}Decline request</button></form></details></div>`
    : `<p class="q-hint">${ICON.info}${esc(decide.why)}</p>`;
  return `<li class="q-card${over > 0 ? ' q-over' : ''}">
    <div class="q-top">${avatar(person)}<div class="q-who"><a href="/r/${r.id}"><b>${esc(nameOf(person.email, person.name))}</b></a>${exampleTag(person.example)}<small>${waited(r.created_at)}</small></div></div>
    <div class="q-body"><p class="q-days"><b>${daysWord(r.days)}</b><span>${esc(whenText(r, ctx.year))}</span>${kindChip(r.kind)}</p>
      ${compact ? '' : `<p class="q-bal">${esc(balanceLine)}</p>`}
      ${compact || !r.note ? '' : `<blockquote class="q-note">${esc(r.note)}</blockquote>`}
      ${flags.length ? `<div class="flags">${flags.join('')}</div>` : ''}</div>
    ${actions}</li>`;
}

export function home(ctx, { mine, balances, queue, week }) {
  const { viewer, me, today, year } = ctx;
  const first = nameOf(me.email, me.name).split(' ')[0];
  const upcoming = mine.filter((r) => r.end_date >= today && (r.status === 'approved' || r.status === 'pending')).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = mine.filter((r) => !upcoming.includes(r)).sort((a, b) => b.start_date.localeCompare(a.start_date)).slice(0, 12);
  const next = upcoming.find((r) => r.status === 'approved' && r.start_date > today);
  const vac = balances.vacation;
  const now = upcoming.find((r) => r.status === 'approved' && r.start_date <= today);
  const lede = now
    ? `You're out until ${esc(longDate(now.end_date))}. Enjoy it; nothing here needs you.`
    : next
    ? `Your next time off is ${esc(whenText(next, year))}: ${daysWord(next.days)} of ${KIND_PHRASE[next.kind]}.`
    : vac.allowance !== null ? `You have ${daysWord(Math.max(vac.left, 0))} of vacation left in ${year}.` : 'Ask for time off and see the answer here.';

  const decidable = queue.filter((q) => q.decide.ok);
  const approvals = viewer.admin ? `<section class="queue-sec">
    <div class="sec-head"><h2>Waiting for you ${decidable.length ? `<span class="count">${decidable.length}</span>` : ''}</h2>${queue.length > 3 ? `<a class="more" href="/approvals">All ${queue.length} ${ICON.arrow}</a>` : ''}</div>
    ${queue.length ? `<ol class="queue queue-compact">${queue.slice(0, 3).map((q) => queueCard(q, ctx, { compact: true })).join('')}</ol>`
      : `<div class="card">${empty('check', 'Nothing waiting for you', 'New requests appear here first, and the people who can approve them get an email.')}</div>`}
  </section>` : '';

  const myList = `<section class="card list-card"><div class="card-head"><h2>Your requests</h2></div>
    ${upcoming.length ? `<h3 class="list-h">Coming up</h3><ul class="req-list">${upcoming.map((r) => requestRow(r, ctx)).join('')}</ul>` : ''}
    ${past.length ? `<h3 class="list-h">Earlier</h3><ul class="req-list">${past.map((r) => requestRow(r, ctx)).join('')}</ul>` : ''}
    ${mine.length ? '' : empty('calendar', 'No time off booked yet', 'Your requests, and whether they were approved, will be listed here.', `<a class="btn" href="/request">${ICON.plus}Request time off</a>`)}
  </section>`;

  return `<section class="hello">
    <div><p class="eyebrow">${esc(fullDate(today))}</p><h1>Hi, ${esc(first)}</h1><p class="lede">${lede}</p></div>
    <a class="btn btn-primary btn-lg" href="/request">${ICON.plus}Request time off</a></section>
  ${approvals}
  <section class="balances-sec"><div class="sec-head"><h2>Your balance for ${year}</h2><span class="sec-note">Working days</span></div>
    <div class="balances">${KINDS.map((k) => balanceCard(balances[k])).join('')}</div></section>
  <div class="home-grid">${myList}${weekStrip(ctx, week)}</div>`;
}

/* ---------- Request form ---------- */

export function requestForm(ctx, { values = {}, error, balances, team }) {
  const v = { kind: 'vacation', start: '', end: '', first: 'full', last: 'full', note: '', ...values };
  const tile = (kind) => {
    const b = balances[kind];
    const left = b.allowance === null ? 'Not counted' : b.left < 0 ? `${dayCount(-b.left)} over` : `${dayCount(b.left)} left`;
    return `<label class="kind-tile kt-${kind}"><input type="radio" name="kind" value="${kind}"${v.kind === kind ? ' checked' : ''} required>
      <span class="kind-ico">${ICON[kind]}</span><span class="kt-text"><b>${KIND_LABEL[kind]}</b><small>${esc(KIND_HINT[kind])}</small></span><span class="kt-left">${left}</span></label>`;
  };
  const opt = (value, label, current) => `<option value="${value}"${current === value ? ' selected' : ''}>${label}</option>`;
  const holidays = ctx.holidays.filter((h) => h.day >= addDays(ctx.today, -40));
  return `<div class="page-head"><div><a class="back" href="/">${ICON.left}Home</a><h1>Request time off</h1>
    <p class="lede">Weekends and company holidays are not counted. An admin approves it, and you'll see the answer on your home page.</p></div></div>
  ${error ? `<div class="flash flash-error" role="alert">${ICON.alert}<span>${esc(error)}</span></div>` : ''}
  <form class="compose" method="post" action="/request" id="request-form" novalidate
    data-today="${ctx.today}" data-holidays="${esc(JSON.stringify(holidays.map((h) => [h.day, h.name])))}"
    data-balances="${esc(JSON.stringify(balances))}" data-team="${esc(JSON.stringify(team))}" data-back="${esc(JSON.stringify(DAYS_BACK))}">
    <div class="card compose-form">
      <fieldset class="fs"><legend>What kind of time off?</legend><div class="kind-tiles">${KINDS.map(tile).join('')}</div></fieldset>
      <fieldset class="fs"><legend>When?</legend>
        <div class="grid2">
          <label class="field"><span>First day</span><input type="date" name="start" required value="${esc(v.start)}" min="${addDays(ctx.today, -30)}"></label>
          <label class="field"><span>Last day</span><input type="date" name="end" value="${esc(v.end)}" min="${addDays(ctx.today, -30)}"><small class="help">Leave empty for a single day.</small></label>
          <label class="field"><span data-first-label>First day is</span><select name="first">${opt('full', 'A full day', v.first)}${opt('am', 'Morning only', v.first)}${opt('pm', 'Afternoon only', v.first)}</select></label>
          <label class="field" data-last-field><span>Last day is</span><select name="last">${opt('full', 'A full day', v.last)}${opt('am', 'Morning only', v.last)}</select></label>
        </div>
      </fieldset>
      <fieldset class="fs"><legend>Anything the approver should know? <small>Optional</small></legend>
        <label class="field"><span class="sr">Note</span><textarea name="note" rows="3" maxlength="500" placeholder="Handing over to Priya. Reachable by phone for emergencies.">${esc(v.note)}</textarea>
        <small class="help">Admins see this. Coworkers only see that you're out.</small></label>
      </fieldset>
      <div class="form-actions"><a class="btn btn-ghost" href="/">Cancel</a><button class="btn btn-primary btn-lg">${ICON.check}Send request</button></div>
    </div>
    <aside class="summary card" aria-live="polite">
      <p class="sum-label">This request</p>
      <div class="sum-days"><b data-sum-days>–</b><span data-sum-unit>working days</span></div>
      <p class="sum-when" data-sum-when>Choose your dates to see how many working days this is.</p>
      <div class="sum-bal" data-sum-bal hidden><div class="sum-bal-row"><span data-sum-kind></span><span data-sum-after></span></div><div class="meter"><i class="m-used"></i><i class="m-pending"></i><i class="m-this"></i></div></div>
      <ul class="sum-notes" data-sum-notes></ul>
      ${holidays.length ? `<details class="sum-hol"><summary>${ICON.flag}Company holidays</summary><ul>${holidays.filter((h) => h.day >= ctx.today).slice(0, 8).map((h) => `<li><span>${esc(longDate(h.day))}</span><span>${esc(h.name)}</span></li>`).join('')}</ul></details>` : ''}
    </aside>
  </form>`;
}

/* ---------- One request ---------- */

const EVENT_TEXT = {
  requested: 'asked for this time off',
  approve: 'approved it',
  self_approve: 'approved their own request, as the only admin',
  decline: 'declined it',
  cancel: 'cancelled it',
};

function rangeStrip(r, ctx) {
  const days = eachDay(r.start_date, r.end_date);
  if (days.length > 31) return '';
  return `<ol class="strip">${days.map((d) => {
    const working = isWorkingDay(d, ctx.holidaySet);
    const half = d === r.start_date && r.half_start ? ' half-pm' : d === r.end_date && r.half_end ? ' half-am' : '';
    return `<li class="${working ? `on${half}` : 'off'}" title="${esc(longDate(d))}${ctx.holidayName(d) ? `: ${esc(ctx.holidayName(d))}` : ''}"><span>${esc(dayName(d).slice(0, 2))}</span><b>${Number(d.slice(8))}</b>${ctx.holidayName(d) ? ICON.flag : ''}</li>`;
  }).join('')}</ol>`;
}

export function requestPage(ctx, { r, events, item, cancel }) {
  const { viewer } = ctx;
  const person = ctx.person(r.person);
  const mine = r.person === viewer.email;
  const showWhy = mine || viewer.admin;
  const decided = r.decided_by ? ctx.person(r.decided_by) : undefined;
  const decision = r.status === 'approved' && decided
    ? `<div class="verdict verdict-ok">${ICON.check}<div><b>Approved${r.self_approved ? ' by the requester, the only admin' : ''}</b><span>by ${esc(nameOf(decided.email, decided.name))} · ${esc(ago(r.decided_at))}</span></div></div>`
    : r.status === 'declined' && decided
      ? `<div class="verdict verdict-no">${ICON.x}<div><b>Declined</b><span>by ${esc(nameOf(decided.email, decided.name))} · ${esc(ago(r.decided_at))}</span>${r.reason ? `<blockquote>${esc(r.reason)}</blockquote>` : ''}</div></div>`
      : r.status === 'cancelled' ? `<div class="verdict verdict-off">${ICON.ban}<div><b>Cancelled</b><span>These days are back in the balance.</span></div></div>` : '';

  const side = [];
  if (item?.decide.ok) {
    const b = item.balance;
    const before = b && b.allowance !== null ? Math.max(b.left + Number(r.days), 0) : null;
    side.push(`<section class="card decide"><h2 class="card-h">Decide</h2>
      ${b && b.allowance !== null ? `<dl class="impact"><div><dt>${KIND_LABEL[r.kind]} left now</dt><dd>${dayCount(before)}</dd></div><div><dt>After this</dt><dd class="${item.over ? 'neg' : ''}">${dayCount(b.left)}</dd></div></dl>
        ${item.over ? `<p class="hint hint-warn">${ICON.alert}This takes ${esc(nameOf(person.email, person.name).split(' ')[0])} ${daysWord(item.over)} past the ${dayCount(b.allowance)}-day allowance. Approving is your call: unpaid days, or borrowed from next year.</p>` : ''}` : '<p class="hint">Not counted against an allowance.</p>'}
      ${item.decide.self ? `<p class="hint">${ICON.info}This is your own request. You're the only admin who has opened the app, so you can approve it; it will be marked as self-approved.</p>` : ''}
      <form method="post" action="/r/${r.id}/approve"><button class="btn btn-approve btn-block">${ICON.check}Approve ${daysWord(r.days)}</button></form>
      <form method="post" action="/r/${r.id}/decline" class="stack"><label class="field"><span>Or decline, with a reason</span><textarea name="reason" rows="3" required maxlength="500" placeholder="Release week. Could you take the week after instead?"></textarea></label><button class="btn btn-block btn-decline">${ICON.x}Decline</button></form>
    </section>`);
  } else if (r.status === 'pending') {
    side.push(`<section class="card"><p class="hint">${ICON.clock}${esc(item?.decide.why && viewer.admin ? item.decide.why : 'Waiting for an admin to approve it. You will see the answer here and on your home page.')}</p></section>`);
  }
  if (viewer.admin || mine) {
    const others = item?.others ?? [];
    side.push(`<section class="card"><h2 class="card-h">Also out then</h2>${others.length
      ? `<ul class="also">${others.map((o) => { const p = ctx.person(o.person); return `<li>${avatar(p, 'sm')}<span><b>${esc(nameOf(p.email, p.name))}</b><small>${esc(whenText(o, ctx.year))}</small></span>${o.status === 'pending' ? statusChip('pending') : ''}</li>`; }).join('')}</ul>
        ${item && crowded(item.peak, ctx.teamSize) ? `<p class="hint hint-warn">${ICON.alert}Up to ${item.peak} people out on the same day.</p>` : ''}`
      : '<p class="muted small">Nobody else is out on these days.</p>'}</section>`);
  }
  if (cancel) side.push(`<form method="post" action="/r/${r.id}/cancel" data-confirm="Cancel this time off? The days go back into the balance."><button class="btn btn-ghost btn-danger btn-block">${ICON.ban}Cancel this time off</button></form>`);

  const timeline = events.map((e) => { const p = ctx.person(e.actor); return `<li class="ev ev-${e.kind}">${avatar(p, 'sm')}<div><p><b>${esc(nameOf(p.email, p.name))}</b> ${EVENT_TEXT[e.kind] ?? esc(e.kind)}</p>${e.note && showWhy && e.kind !== 'requested' ? `<blockquote>${esc(e.note)}</blockquote>` : ''}<small>${esc(ago(e.created_at))}</small></div></li>`; }).join('');

  return `<div class="page-head"><div><a class="back" href="${viewer.admin && !mine ? '/approvals' : '/'}">${ICON.left}${viewer.admin && !mine ? 'Approvals' : 'Home'}</a>
    <div class="head-meta">${avatar(person, 'sm')}<span>${esc(nameOf(person.email, person.name))}</span>${exampleTag(person.example)}${statusChip(r.status)}</div>
    <h1>${daysWord(r.days)} ${showWhy ? `of ${KIND_PHRASE[r.kind]}` : 'off'}</h1><p class="lede">${esc(whenText(r, ctx.year))}</p></div></div>
  <div class="detail">
    <div class="detail-main">
      <section class="card">${decision}${rangeStrip(r, ctx)}
        <dl class="dl"><dt>Type</dt><dd>${showWhy ? kindChip(r.kind) : 'Shown to admins only'}</dd><dt>Dates</dt><dd>${esc(fullDate(r.start_date))}${r.start_date !== r.end_date ? ` to ${esc(fullDate(r.end_date))}` : ''}</dd>
          <dt>Working days</dt><dd class="num">${dayCount(r.days)}</dd><dt>Asked</dt><dd>${esc(ago(r.created_at))}</dd></dl>
        ${r.note && showWhy ? `<blockquote class="note">${ICON.note}<span>${esc(r.note)}</span></blockquote>` : ''}</section>
      <section class="card history"><h2 class="card-h">History</h2><ol class="timeline">${timeline}</ol></section>
    </div>
    <aside class="side">${side.join('')}</aside>
  </div>`;
}

/* ---------- Approvals ---------- */

export function approvalsPage(ctx, { queue, recent }) {
  const mineWaiting = queue.filter((q) => !q.decide.ok);
  const yours = queue.filter((q) => q.decide.ok);
  return `<div class="page-head"><div><h1>Approvals</h1><p class="lede">Soonest first. Each request shows the balance it would leave and who else is out on those days.</p></div></div>
  ${yours.length ? `<ol class="queue">${yours.map((q) => queueCard(q, ctx)).join('')}</ol>`
    : `<div class="card">${empty('check', 'All caught up', 'No requests are waiting. When someone asks for time off it appears here, and you get an email.')}</div>`}
  ${mineWaiting.length ? `<div class="sec-head sec-gap"><h2>Waiting for someone else</h2></div><ol class="queue">${mineWaiting.map((q) => queueCard(q, ctx)).join('')}</ol>` : ''}
  <section class="card list-card sec-gap"><div class="card-head"><h2>Decided in the last 30 days</h2></div>
    ${recent.length ? `<ul class="req-list">${recent.map((r) => `<li><a class="req-row req-${r.status}" href="/r/${r.id}">${dateBlock(r.start_date)}<span class="req-main"><span class="req-what"><b>${esc(nameOf(r.person, ctx.person(r.person).name))}</b>${kindChip(r.kind)}<span class="req-days">${daysWord(r.days)}</span></span><span class="req-when">${esc(whenText(r, ctx.year))} · by ${esc(nameOf(r.decided_by, ctx.person(r.decided_by).name).split(' ')[0])}</span></span>${statusChip(r.status)}</a></li>`).join('')}</ul>`
      : '<p class="muted small pad">Nothing decided yet.</p>'}</section>`;
}

/* ---------- Calendar ---------- */

function legend(ctx) {
  const kinds = ctx.viewer.admin ? KINDS.map((k) => `<li><i class="sw sw-${k}"></i>${KIND_LABEL[k]}</li>`).join('') : '<li><i class="sw sw-out"></i>Out</li>';
  return `<ul class="legend">${kinds}<li><i class="sw sw-pending"></i>Waiting</li><li><i class="sw sw-half"></i>Half day</li><li><i class="sw sw-hol"></i>Holiday</li></ul>`;
}

export function calendarPage(ctx, { view, anchor, people, requests }) {
  const tabs = `<div class="seg" role="tablist"><a href="/calendar?view=week&d=${anchor}" ${view === 'week' ? 'aria-current="true"' : ''}>Week</a><a href="/calendar?view=month&d=${anchor}" ${view === 'month' ? 'aria-current="true"' : ''}>Month</a></div>`;
  const step = view === 'week' ? [addDays(startOfWeek(anchor), -7), addDays(startOfWeek(anchor), 7)] : [addMonths(anchor, -1), addMonths(anchor, 1)];
  const title = view === 'week' ? `Week of ${shortDate(startOfWeek(anchor))}` : monthName(anchor);
  const nav = `<div class="cal-nav"><a class="icon-btn" href="/calendar?view=${view}&d=${step[0]}" aria-label="Previous ${view}">${ICON.left}</a><h2>${esc(title)}</h2><a class="icon-btn" href="/calendar?view=${view}&d=${step[1]}" aria-label="Next ${view}">${ICON.right}</a><a class="btn btn-sm" href="/calendar?view=${view}">Today</a></div>`;
  const body = view === 'week' ? weekView(ctx, anchor, requests) : monthView(ctx, anchor, people, requests);
  return `<div class="page-head"><div><h1>Team calendar</h1><p class="lede">Who is out, and when several people are out at once.${ctx.viewer.admin ? '' : ' Coworkers see that someone is out, not why.'}</p></div>${tabs}</div>
  <section class="card cal-card">${nav}${legend(ctx)}${body}</section>`;
}

function cellClass(c, ctx, own) {
  const kind = ctx.viewer.admin || own ? c.kind : 'out';
  return ['bar', `bar-${kind}`, c.pending ? 'bar-pending' : '', !c.am ? 'bar-pm' : '', !c.pm ? 'bar-am' : '', c.bridge ? 'bar-bridge' : '', c.first ? 'bar-s' : '', c.last ? 'bar-e' : ''].filter(Boolean).join(' ');
}

function monthView(ctx, anchor, people, requests) {
  const days = eachDay(startOfMonth(anchor), endOfMonth(anchor));
  const cells = personCells(requests, days, ctx.holidaySet);
  const counts = outByDay(requests, days, ctx.holidaySet);
  const rows = [...people].sort((a, b) => Number(b.email === ctx.viewer.email) - Number(a.email === ctx.viewer.email)
    || Number(!cells.has(a.email)) - Number(!cells.has(b.email)) || nameOf(a.email, a.name).localeCompare(nameOf(b.email, b.name)));
  const colClass = (d) => [isWorkingDay(d, ctx.holidaySet) ? '' : ctx.holidayName(d) ? 'c-hol' : 'c-wkend', d === ctx.today ? 'c-today' : ''].filter(Boolean).join(' ');
  const head = days.map((d) => `<th class="${colClass(d)}" scope="col" title="${esc(longDate(d))}${ctx.holidayName(d) ? `: ${esc(ctx.holidayName(d))}` : ''}"><span>${esc(dayName(d).slice(0, 1))}</span><b>${Number(d.slice(8))}</b></th>`).join('');
  const countRow = counts.map((c) => {
    const busy = c.working && crowded(c.approved, ctx.teamSize);
    const risk = !busy && c.working && c.pending && crowded(c.approved + c.pending, ctx.teamSize);
    const label = c.working ? `${c.approved} out${c.pending ? `, ${c.pending} more waiting` : ''}` : (ctx.holidayName(c.day) || 'Weekend');
    return `<td class="${colClass(c.day)}"><span class="cnt${busy ? ' cnt-busy' : ''}${risk ? ' cnt-risk' : ''}${c.approved ? '' : ' cnt-0'}" title="${esc(label)}${risk ? ': crowded if approved' : ''}">${c.working ? (c.approved || '·') : ctx.holidayName(c.day) ? ICON.flag : ''}${c.working && c.pending ? '<i class="cnt-p"></i>' : ''}</span></td>`;
  }).join('');
  const body = rows.map((p) => {
    const row = cells.get(p.email) ?? [];
    const own = p.email === ctx.viewer.email;
    return `<tr${own ? ' class="row-me"' : ''}><th scope="row"><span class="cal-person">${avatar(p, 'sm')}<span class="cal-name">${esc(nameOf(p.email, p.name))}${own ? ' <small>you</small>' : ''}</span></span></th>${days.map((d, i) => {
      const c = row[i];
      const link = c && (ctx.viewer.admin || own) ? `<a href="/r/${c.id}" class="${cellClass(c, ctx, own)}" title="${esc(nameOf(p.email, p.name))}: ${c.pending ? 'waiting' : 'out'}"></a>` : c ? `<span class="${cellClass(c, ctx, own)}" title="${esc(nameOf(p.email, p.name))}: out"></span>` : '';
      return `<td class="${colClass(d)}">${link}</td>`;
    }).join('')}</tr>`;
  }).join('');
  return `<div class="grid-scroll" data-scroll-today><table class="month">
    <thead><tr><th class="corner" scope="col"><span class="sr">Person</span></th>${head}</tr>
    <tr class="count-row"><th scope="row">Out</th>${countRow}</tr></thead>
    <tbody>${body}</tbody></table></div>
    ${rows.length ? '' : empty('users', 'Nobody here yet', 'People appear once they open the app.')}`;
}

function weekView(ctx, anchor, requests) {
  const monday = startOfWeek(anchor);
  const days = eachDay(monday, addDays(monday, 6));
  const shown = days.filter((d, i) => i < 5 || requests.some((r) => (r.status === 'approved' || r.status === 'pending') && r.start_date <= d && r.end_date >= d && isWorkingDay(d, ctx.holidaySet)));
  const cols = shown.map((day) => {
    const working = isWorkingDay(day, ctx.holidaySet);
    const out = requests.filter((r) => (r.status === 'approved' || r.status === 'pending') && r.start_date <= day && r.end_date >= day)
      .map((r) => ({ r, am: !(day === r.start_date && r.half_start), pm: !(day === r.end_date && r.half_end) }))
      .sort((a, b) => Number(a.r.status === 'pending') - Number(b.r.status === 'pending') || nameOf(a.r.person, ctx.person(a.r.person).name).localeCompare(nameOf(b.r.person, ctx.person(b.r.person).name)));
    const firm = out.filter((o) => o.r.status === 'approved').length;
    const busy = working && crowded(firm, ctx.teamSize);
    const list = !working ? `<p class="wd-off">${ctx.holidayName(day) ? `${ICON.flag}${esc(ctx.holidayName(day))}` : 'Weekend'}</p>`
      : out.length ? `<ul class="wd-list">${out.map(({ r, am, pm }) => {
        const p = ctx.person(r.person);
        const own = r.person === ctx.viewer.email;
        const kind = ctx.viewer.admin || own ? r.kind : 'out';
        const part = am && pm ? '' : am ? 'Morning' : 'Afternoon';
        const inner = `${avatar(p, 'sm')}<span class="wd-who"><b>${esc(nameOf(p.email, p.name))}</b><small>${ctx.viewer.admin || own ? KIND_LABEL[r.kind] : 'Out'}${part ? ` · ${part}` : ''}${r.status === 'pending' ? ' · waiting' : ''}</small></span>`;
        return `<li class="wd-item wd-${kind}${r.status === 'pending' ? ' wd-pending' : ''}">${ctx.viewer.admin || own ? `<a href="/r/${r.id}">${inner}</a>` : `<span>${inner}</span>`}</li>`;
      }).join('')}</ul>` : '<p class="wd-none">Everyone in</p>';
    return `<section class="wd${day === ctx.today ? ' is-today' : ''}${working ? '' : ' is-off'}${busy ? ' is-busy' : ''}">
      <header><span class="wd-name">${esc(dayName(day))}</span><b class="wd-date">${esc(shortDate(day))}</b>${working ? `<span class="wd-count${busy ? ' busy' : ''}">${busy ? ICON.alert : ''}${firm} out</span>` : ''}</header>${list}</section>`;
  }).join('');
  return `<div class="week-cols cols-${shown.length}">${cols}</div>`;
}

/* ---------- Team and allowances ---------- */

export function teamPage(ctx, { rows, defaults }) {
  const def = (kind) => defaults.find((d) => d.kind === kind)?.days ?? null;
  const defaultsForm = `<section class="card"><div class="card-head"><h2>Yearly allowance for everyone</h2></div>
    <p class="muted small">Working days per calendar year. Leave a type empty to track it without a limit. Set a different number for one person below.</p>
    <form method="post" action="/team/defaults" class="allow-form">${KINDS.map((k) => `<label class="field allow-field"><span>${ICON[k]}${KIND_LABEL[k]}</span><input type="number" name="${k}" min="0" max="365" step="0.5" inputmode="decimal" value="${def(k) === null ? '' : dayCount(def(k))}" placeholder="No limit"></label>`).join('')}<button class="btn btn-primary">Save</button></form></section>`;
  const cell = (b) => {
    if (b.allowance === null) return `<td class="tb tb-${b.kind}" data-k="${KIND_LABEL[b.kind]}"><span class="tb-n">${dayCount(b.used)}</span><span class="tb-of">taken</span></td>`;
    const pct = b.allowance > 0 ? Math.min(100, ((b.used + b.pending) / b.allowance) * 100) : 100;
    return `<td class="tb tb-${b.kind}${b.left < 0 ? ' tb-over' : ''}" data-k="${KIND_LABEL[b.kind]}"><span class="tb-n">${dayCount(Math.abs(b.left))}</span><span class="tb-of">${b.left < 0 ? 'over' : 'left of'} ${dayCount(b.allowance)}${b.custom ? ' <abbr title="Set for this person">·&nbsp;own</abbr>' : ''}</span><span class="tb-meter"><i style="width:${pct.toFixed(0)}%"></i></span></td>`;
  };
  const table = rows.map(({ person, balances, overrides, out }) => `<tr>
    <th scope="row"><span class="cal-person">${avatar(person, 'sm')}<span class="tp-name"><span class="tp-line"><b>${esc(nameOf(person.email, person.name))}</b>${person.admin ? '<span class="tag">Admin</span>' : ''}${out ? '<span class="tag tag-out">Out today</span>' : ''}${exampleTag(person.example)}</span><small>${esc(person.email)}</small></span></span></th>
    ${KINDS.map((k) => cell({ ...balances[k], custom: overrides.some((o) => o.kind === k) })).join('')}
    <td class="tb-edit"><details class="pop"><summary class="btn btn-sm btn-ghost">Edit</summary><form method="post" action="/team/person" class="pop-form">
      <input type="hidden" name="email" value="${esc(person.email)}"><p class="pop-h">${esc(nameOf(person.email, person.name))}'s allowance</p>
      ${KINDS.map((k) => { const o = overrides.find((x) => x.kind === k); return `<label class="field"><span>${KIND_LABEL[k]}</span><input type="number" name="${k}" min="0" max="365" step="0.5" value="${o && o.days !== null ? dayCount(o.days) : ''}" placeholder="Company: ${def(k) === null ? 'no limit' : dayCount(def(k))}"></label>`; }).join('')}
      <small class="help">Empty uses the company number.</small><button class="btn btn-primary btn-sm">Save</button></form></details></td></tr>`).join('');
  return `<div class="page-head"><div><h1>Team</h1><p class="lede">Everyone's balance for ${ctx.year}. People appear here the first time they open the app.</p></div></div>
  ${defaultsForm}
  <section class="card table-card sec-gap"><div class="table-scroll"><table class="team">
    <thead><tr><th scope="col">Person</th>${KINDS.map((k) => `<th scope="col"><span class="th-kind th-${k}">${ICON[k]}${KIND_LABEL[k]}</span></th>`).join('')}<th><span class="sr">Edit</span></th></tr></thead>
    <tbody>${table}</tbody></table></div>
    ${rows.length ? '' : empty('users', 'Nobody has opened the app yet', 'Invite your team. Each person shows up here the first time they sign in.')}</section>`;
}

/* ---------- Settings ---------- */

export function settingsPage(ctx, { holidays, email, examples }) {
  const upcoming = holidays.filter((h) => h.day >= ctx.today);
  const past = holidays.filter((h) => h.day < ctx.today && yearOf(h.day) === ctx.year);
  const hRow = (h) => `<li class="hol${h.day < ctx.today ? ' hol-past' : ''}">${dateBlock(h.day)}<span class="hol-main"><b>${esc(h.name)}</b><small>${esc(fullDate(h.day))}${isWorkingDay(h.day) ? '' : ' · on a weekend, so it changes nothing'}</small></span>${exampleTag(h.example)}
    <form method="post" action="/settings/holidays/remove" data-confirm="Remove ${esc(h.name)}? Requests that include it will count it as a working day again."><input type="hidden" name="day" value="${h.day}"><button class="icon-btn" aria-label="Remove ${esc(h.name)}">${ICON.trash}</button></form></li>`;
  return `<div class="page-head"><div><h1>Settings</h1><p class="lede">Company holidays, your company's name and timezone, and the example data.</p></div></div>
  <div class="settings-grid">
    <section class="card"><div class="card-head"><h2>Company holidays</h2></div>
      <p class="muted small">Days the whole company is off. They are not counted in anyone's time off, and requests that include one are recounted when you add or remove it.</p>
      <form method="post" action="/settings/holidays" class="hol-add"><label class="field"><span>Date</span><input type="date" name="day" required></label><label class="field grow"><span>Name</span><input name="name" required maxlength="80" placeholder="Independence Day"></label><button class="btn btn-primary">${ICON.plus}Add</button></form>
      ${upcoming.length ? `<ul class="hol-list">${upcoming.map(hRow).join('')}</ul>` : empty('flag', 'No holidays coming up', 'Add the days your company closes, such as national holidays.')}
      ${past.length ? `<details class="past"><summary>Earlier in ${ctx.year} (${past.length})</summary><ul class="hol-list">${past.map(hRow).join('')}</ul></details>` : ''}
    </section>
    <div class="stack-lg">
      <section class="card"><div class="card-head"><h2>Company</h2></div>
        <form method="post" action="/settings/company" class="stack"><label class="field"><span>Name, shown in the top bar</span><input name="company_name" required maxlength="120" value="${esc(ctx.settings.company_name)}"></label>
        <label class="field"><span>Timezone, which decides when "today" starts</span><input name="timezone" required maxlength="60" value="${esc(ctx.settings.timezone)}" list="zones"><datalist id="zones">${['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney'].map((z) => `<option value="${z}">`).join('')}</datalist></label>
        <button class="btn">Save</button></form></section>
      <section class="card"><div class="card-head"><h2>Email today</h2></div>
        <div class="mail-meter" role="img" aria-label="${email.sent} of 5 emails sent today">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < email.sent ? 'on' : ''}"></i>`).join('')}</div>
        <p class="muted small">${email.sent} of 5 sent today. Spryloom allows each app 5 emails a day, reset at midnight UTC. Requests and decisions are emailed as they happen. On weekdays two are kept for the 9:00 digest to approvers until it has run. Anything that can't be emailed is still on people's home pages.${email.held ? ` ${plural(email.held, 'email was', 'emails were')} held back today.` : ''}</p></section>
      ${examples ? `<section class="card"><div class="card-head"><h2>Example data</h2></div><p class="muted small">Ten made-up people at example.com with requests around today, and their holidays. Removing them keeps everything real people have done.</p>
        <form method="post" action="/settings/examples" data-confirm="Remove all example people, requests and holidays? Your own data stays."><button class="btn btn-danger">${ICON.trash}Remove example data</button></form></section>` : ''}
    </div>
  </div>`;
}

export const notFound = (text) => empty('calendar', 'Not found', text, '<a class="btn" href="/">Home</a>');
