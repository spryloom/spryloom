/**
 * Every page, as HTML strings. Anything a person typed goes through `esc`.
 */
import { ICON } from './icons.js';
import { CURRENCIES, amountField, annualCents, formatMoney, isPaid, monthlyCents, periodCents, seatMonthlyCents, seatWaste } from './money.js';
import {
  BILLING_LABEL, CATEGORIES, PRICING_LABEL, STATUSES, STATUS_LABEL,
  addDays, daysBetween, isIsoDay, nextRenewal, requestNumber,
} from './rules.js';

export const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/* ---------- Small pieces ---------- */

const money = (cents, currency, whole = false) => esc(formatMoney(cents, currency, { whole }));
const per = (billing) => (billing === 'annual' ? 'year' : 'month');
const short = (email) => esc(String(email ?? '').split('@')[0]);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parts = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; };
export const day = (iso, today) => {
  if (!isIsoDay(iso)) return '—';
  const { y, m, d } = parts(iso);
  return `${MONTHS[m - 1]} ${d}${today && parts(today).y !== y ? `, ${y}` : ''}`;
};
const longDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

const ago = (value) => {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  const d = Math.floor(seconds / 86400);
  if (d === 1) return 'yesterday';
  if (d < 45) return `${d} days ago`;
  return `${Math.floor(d / 30)} months ago`;
};

const when = (days) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : days < 0 ? `${-days} days ago` : `in ${days} days`);

/** A stable tile for a tool: its initials on one of eight tints. Nothing is fetched. */
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const initialsOf = (name) => {
  const words = String(name).replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).replace(/^./, (c) => c.toUpperCase());
  return (words[0][0] + words[1][0]).toUpperCase();
};
export const mono = (name, size = '') => `<span class="mono mono-${hash(String(name).toLowerCase()) % 8}${size ? ` mono-${size}` : ''}" aria-hidden="true">${esc(initialsOf(name))}</span>`;

const avatarText = (email) => esc(String(email).split('@')[0].split(/[._-]/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?');
const avatar = (email, size = '') => `<span class="avatar${size ? ` avatar-${size}` : ''}" title="${esc(email)}">${avatarText(email)}</span>`;

const STATUS_ICON = { active: ICON.check, trial: ICON.clock, cancelling: ICON.stop };
const statusChip = (status) => `<span class="chip chip-${status}">${STATUS_ICON[status]}${STATUS_LABEL[status]}</span>`;
const exampleTag = (row) => (row.example ? '<span class="tag-example" title="Example data">Example</span>' : '');

/** Days away, shaped by how soon: solid within a week, outlined within a month. */
const whenChip = (days) => {
  const level = days < 0 || days <= 7 ? 'urgent' : days <= 30 ? 'soon' : 'later';
  return `<span class="when when-${level}">${level === 'urgent' ? ICON.alert : ''}${when(days)}</span>`;
};

const categoryIndex = (category) => {
  const i = CATEGORIES.indexOf(category);
  return i >= 0 ? i : hash(category) % CATEGORIES.length;
};

/** Amounts in more than one currency, never added together: "$1,240 + €80". */
const sumByCurrency = (rows, cents, whole = true) => {
  const by = new Map();
  for (const row of rows) by.set(row.currency, (by.get(row.currency) ?? 0) + cents(row));
  return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => money(v, c, whole)).join(' + ') || money(0, 'USD');
};

const seatMeter = (tool) => {
  if (tool.pricing !== 'per_seat' || !tool.seats_bought) {
    return `<span class="meter-text">${plural(tool.using, 'person', 'people')}</span>`;
  }
  const used = Math.min(tool.using, tool.seats_bought);
  const over = Math.max(0, tool.using - tool.seats_bought);
  const unused = tool.seats_bought - used;
  return `<span class="meter" role="img" aria-label="${used} of ${tool.seats_bought} seats used">
    <span class="meter-bar"><span class="meter-used" style="width:${(used / tool.seats_bought) * 100}%"></span></span>
    <span class="meter-text"><b>${tool.using}</b> of ${tool.seats_bought}${unused ? ` · <span class="unused">${unused} unused</span>` : ''}${over ? ` · <span class="over">${over} over</span>` : ''}</span></span>`;
};

const empty = (icon, title, text, action = '') => `<div class="empty">${icon}<h3>${title}</h3><p>${text}</p>${action}</div>`;

/* ---------- Layout ---------- */

export function layout({ title, viewer, active, body, flash, error, waiting = 0 }) {
  const link = (href, label, key, extra = '') => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}${extra}</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><title>${esc(title)} · Tool Stack</title>
<link rel="stylesheet" href="/assets/app.css"><script src="/assets/app.js" defer></script></head>
<body><a class="skip" href="#main">Skip to content</a>
<header class="topbar"><div class="topbar-in">
  <a class="brand" href="/"><span class="brand-mark">${ICON.stack}</span><span>Tool Stack</span></a>
  <nav class="nav" aria-label="Main">${link('/', 'Overview', 'home')}${link('/tools', 'Tools', 'tools')}${link('/requests', 'Requests', 'requests', waiting ? ` <span class="nav-n" aria-label="${waiting} waiting">${waiting}</span>` : '')}${link('/me', 'Mine', 'me')}</nav>
  <div class="top-right">
    <a class="btn btn-primary btn-sm top-cta" href="/requests/new">${ICON.plus}<span>Request a tool</span></a>
    <span class="who" title="${esc(viewer.email)}">${avatar(viewer.email)}<span class="who-text"><b>${short(viewer.email)}</b><small>${viewer.admin ? 'Admin' : 'Member'}</small></span></span>
  </div>
</div></header>
<main class="main" id="main">${error ? `<div class="flash flash-error" role="alert">${ICON.alert}<span>${esc(error)}</span></div>` : ''}${flash ? `<div class="flash" role="status">${ICON.check}<span>${esc(flash)}</span></div>` : ''}${body}</main>
<footer class="foot"><span>Tool Stack</span><span>Prices are what your team enters. Totals are never converted between currencies.</span></footer>
</body></html>`;
}

const exampleBanner = (viewer, hasExamples) => (hasExamples ? `<section class="banner" aria-label="Example data">
  <span class="banner-icon">${ICON.sparkle}</span>
  <div><b>You're looking at an example team.</b> Ten made-up people at example.com and sixteen tools, so you can see how it works. Prices are illustrative, not quotes, and example people are never emailed.</div>
  ${viewer.admin ? `<form method="post" action="/examples/remove" data-confirm="Remove every example tool, person and request? Anything your team added stays."><button class="btn btn-sm">Remove example data</button></form>` : ''}
</section>` : '');

/* ---------- Overview ---------- */

const ATTENTION = {
  renews: (a) => ({ icon: ICON.renew, title: `${esc(a.tool.name)} renews ${when(a.days)}`, detail: `${money(a.amount, a.tool.currency)} ${a.tool.billing === 'annual' ? 'yearly' : 'monthly'} bill${a.tool.owner ? ` · ${short(a.tool.owner)} owns it` : ' · no owner'}` }),
  ends: (a) => ({ icon: ICON.stop, title: `${esc(a.tool.name)} ends ${when(a.days)}`, detail: `Cancelled. ${a.tool.using ? `${plural(a.tool.using, 'person', 'people')} still use it` : 'Nobody uses it'}.` }),
  trial: (a) => ({ icon: ICON.clock, title: `${esc(a.tool.name)} trial ends ${when(a.days)}`, detail: `Then ${money(a.amount, a.tool.currency)} a ${per(a.tool.billing)}. Keep it or cancel it.` }),
  trial_over: (a) => ({ icon: ICON.clock, title: `${esc(a.tool.name)} trial ended ${when(a.days)}`, detail: 'Still marked as a trial. Mark it active, or cancel it.' }),
  no_owner: (a) => ({ icon: ICON.noOwner, title: `${esc(a.tool.name)} has no owner`, detail: 'Nobody gets its renewal email. Choose who looks after it.' }),
  unused_seats: (a) => ({ icon: ICON.seat, title: `${esc(a.tool.name)}: ${plural(a.unused, 'seat')} unused`, detail: `${money(a.monthly, a.tool.currency)} a month on seats nobody has marked as theirs` }),
  request: (a) => ({ icon: ICON.inbox, title: `${a.request.kind === 'seat' ? 'A seat on ' : ''}${esc(a.request.tool_name)}, asked for by ${short(a.request.requester)}`, detail: `Waiting ${a.waited === 0 ? 'since today' : a.waited === 1 ? '1 day' : `${a.waited} days`} for an admin` }),
};

const attentionItem = (a) => {
  const v = ATTENTION[a.kind](a);
  const href = a.request ? `/requests/${a.request.id}` : `/tools/${a.tool.id}`;
  return `<li><a class="att att-${a.severity}" href="${href}"><span class="att-icon">${v.icon}</span><span class="att-body"><b>${v.title}</b><small>${v.detail}</small></span><span class="sev sev-${a.severity}">${{ urgent: 'Now', soon: 'Soon', info: 'Note' }[a.severity]}</span></a></li>`;
};

const KIND_TEXT = { renews: 'Renews', ends: 'Ends · cancelled', trial: 'Trial ends' };

const comingRow = (item, today) => {
  const { m, d } = parts(item.date);
  return `<li><a class="due" href="/tools/${item.tool.id}">
    <span class="stub"><span class="stub-m">${MONTHS[m - 1]}</span><span class="stub-d">${d}</span></span>
    ${mono(item.tool.name)}
    <span class="due-body"><b>${esc(item.tool.name)}</b><small><span class="due-kind due-${item.kind}">${KIND_TEXT[item.kind]}</span>${item.tool.plan ? ` · ${esc(item.tool.plan)}` : ''}</small></span>
    <span class="due-amt"><b>${money(item.amount, item.tool.currency)}</b><small>${item.kind === 'trial' ? `a ${per(item.tool.billing)} if kept` : item.kind === 'ends' ? 'no longer billed' : item.tool.billing === 'annual' ? 'yearly bill' : 'monthly bill'}</small></span>
    ${whenChip(item.days)}</a></li>`;
};

function categoryChart(groups) {
  if (!groups.length) return '';
  return groups.map((g, gi) => {
    const max = g.rows[0]?.monthly || 1;
    const stack = g.rows.map((r) => `<span class="seg cat-${categoryIndex(r.category)}" style="width:${(r.monthly / g.total) * 100}%" title="${esc(r.category)}"></span>`).join('');
    const rows = g.rows.map((r) => `<li><span class="cat-name"><span class="swatch cat-${categoryIndex(r.category)}"></span>${esc(r.category)}<small>${plural(r.count, 'tool')}</small></span>
      <span class="cat-bar"><span class="cat-fill cat-${categoryIndex(r.category)}" style="width:${Math.max(2, (r.monthly / max) * 100)}%"></span></span>
      <span class="cat-amt">${money(r.monthly, g.currency, true)}<small>${Math.round((r.monthly / g.total) * 100)}%</small></span></li>`).join('');
    return `<div class="cat-group">${groups.length > 1 ? `<h3 class="mini-h">${gi === 0 ? 'In' : 'Billed in'} ${esc(g.currency)} <span>${money(g.total, g.currency, true)} a month</span></h3>` : ''}
      ${g.rows.length > 1 ? `<div class="stackbar" role="img" aria-label="Monthly spend by category in ${esc(g.currency)}">${stack}</div>` : ''}<ul class="cats">${rows}</ul></div>`;
  }).join('');
}

export function overview({ viewer, today, tools, totals, categories, waste, coming, attention, mine, hasExamples, waiting }) {
  const [main, ...others] = totals;
  const paid = tools.filter(isPaid);
  const trials = tools.filter((t) => t.status === 'trial');
  const in30 = coming.filter((c) => c.days <= 30 && c.kind !== 'ends');
  const next = in30[0];
  const wasteMain = waste[0];
  const unusedAll = waste.reduce((n, w) => n + w.unused, 0);
  const biggest = [...paid].filter((t) => t.currency === main?.currency).sort((a, b) => monthlyCents(b) - monthlyCents(a)).slice(0, 3);

  if (!tools.length) {
    return `<div class="page-head"><div><p class="eyebrow">${esc(longDay(today))}</p><h1>Your tool stack</h1><p class="lede">What the team pays for, what renews next, and where seats sit unused.</p></div></div>
    <section class="card">${empty(ICON.stack, 'Nothing in the register yet', viewer.admin
      ? 'Add the tools your team pays for: the AI assistants, the editors, the design and docs tools. Start with the three biggest bills; renewals and seat counts follow.'
      : 'An admin adds the tools the team pays for. Meanwhile, ask for the one you need.', viewer.admin
      ? `<a class="btn btn-primary" href="/tools/new">${ICON.plus}Add the first tool</a>`
      : `<a class="btn btn-primary" href="/requests/new">${ICON.plus}Request a tool</a>`)}</section>`;
  }

  const hero = `<section class="hero card">
    <div class="hero-total">
      <p class="label">Monthly spend</p>
      ${main ? `<p class="big"><span class="big-n">${money(main.monthly, main.currency, true)}</span><span class="big-u">/ month</span></p>
      <p class="sub">${money(main.annual, main.currency, true)} a year · ${plural(main.count, 'paid tool')}</p>
      ${others.map((o) => `<p class="other-cur"><b>+ ${money(o.monthly, o.currency, true)}</b> a month billed in ${esc(o.currency)}, not converted · ${plural(o.count, 'tool')}</p>`).join('')}`
      : '<p class="big"><span class="big-n">Nothing paid yet</span></p>'}
      ${biggest.length ? `<div class="biggest"><p class="label">Biggest bills</p><ol>${biggest.map((b) => `<li><a href="/tools/${b.id}">${mono(b.name, 'sm')}<span>${esc(b.name)}</span><b>${money(monthlyCents(b), b.currency)}</b></a></li>`).join('')}</ol></div>` : ''}
      <p class="fine">${ICON.info}Monthly equivalent: a yearly plan counts as a twelfth a month. ${trials.length ? `${plural(trials.length, 'trial')} not counted until kept.` : ''}</p>
    </div>
    <div class="hero-chart"><h2 class="card-h">By category</h2>${categoryChart(categories)}</div>
  </section>`;

  const kpis = `<section class="kpis">
    <a class="kpi" href="#coming"><span class="kpi-icon">${ICON.calendar}</span><span class="label">Renewing in 30 days</span>
      <span class="kpi-n">${in30.length ? sumByCurrency(in30, (i) => i.amount) : 'Nothing'}</span>
      <span class="sub">${in30.length ? `${plural(in30.length, 'bill')} · next: ${esc(next.tool.name)} ${when(next.days)}` : 'No renewals in the next 30 days'}</span></a>
    <a class="kpi" href="#seats"><span class="kpi-icon">${ICON.seat}</span><span class="label">Unused seats</span>
      <span class="kpi-n">${unusedAll ? plural(unusedAll, 'seat') : 'None'}</span>
      <span class="sub">${wasteMain ? `${money(wasteMain.monthly, wasteMain.currency, true)} a month${waste.length > 1 ? ` + ${waste.slice(1).map((w) => money(w.monthly, w.currency, true)).join(' + ')}` : ''} across ${plural(waste.reduce((n, w) => n + w.tools, 0), 'tool')}` : 'Every seat bought has someone using it'}</span></a>
    <a class="kpi" href="/requests"><span class="kpi-icon">${ICON.inbox}</span><span class="label">Waiting for a decision</span>
      <span class="kpi-n">${waiting ? plural(waiting, 'request') : 'None'}</span>
      <span class="sub">${trials.length ? `${plural(trials.length, 'trial')} running too` : 'No trials running'}</span></a>
  </section>`;

  const first = coming.filter((c) => c.days <= 30);
  const second = coming.filter((c) => c.days > 30);
  const group = (title, items) => (items.length ? `<div class="due-group"><h3 class="mini-h">${title} <span>${sumByCurrency(items.filter((i) => i.kind !== 'ends'), (i) => i.amount)}</span></h3><ol class="dues">${items.map((i) => comingRow(i, today)).join('')}</ol></div>` : '');
  const comingCard = `<section class="card" id="coming"><div class="card-top"><h2 class="card-h">Coming up</h2><span class="muted small">Renewals and trials, next 60 days</span></div>
    ${coming.length ? group('Next 30 days', first) + group('31 to 60 days', second) : empty(ICON.calendar, 'Nothing renews in the next 60 days', 'Renewals and trial ends show here two months ahead.')}</section>`;

  const shown = attention.slice(0, 6);
  const rest = attention.slice(6);
  const attentionCard = `<section class="card"><div class="card-top"><h2 class="card-h">Needs attention</h2>${attention.length ? `<span class="count">${attention.length}</span>` : ''}</div>
    ${attention.length ? `<ul class="atts">${shown.map(attentionItem).join('')}</ul>${rest.length ? `<details class="more"><summary>Show ${rest.length} more</summary><ul class="atts">${rest.map(attentionItem).join('')}</ul></details>` : ''}`
      : empty(ICON.check, 'All clear', 'No renewals in two weeks, every tool has an owner, and no seats sit unused.')}</section>`;

  const mineCard = `<section class="card mine-card"><div class="card-top"><h2 class="card-h">Yours</h2><a class="small" href="/me">Open ${ICON.arrow}</a></div>
    <p class="mine-line">You use <b>${plural(mine.using.length, 'tool')}</b>${mine.owning.length ? ` and own <b>${mine.owning.length}</b>` : ''}.</p>
    ${mine.using.length ? `<div class="monos">${mine.using.slice(0, 10).map((t) => `<a href="/tools/${t.id}" title="${esc(t.name)}">${mono(t.name, 'sm')}</a>`).join('')}${mine.using.length > 10 ? `<span class="more-n">+${mine.using.length - 10}</span>` : ''}</div>` : '<p class="muted small">Mark the tools you use so seat counts are real.</p>'}
    <a class="btn btn-block btn-sm" href="/me">${mine.using.length ? 'Check your tools' : 'Mark what you use'}</a></section>`;

  const seatTools = tools.filter((t) => t.status === 'active' && t.pricing === 'per_seat' && t.seats_bought).map((t) => ({ t, w: seatWaste(t, t.using) }))
    .sort((a, b) => b.w.monthly - a.w.monthly || b.w.unused - a.w.unused || a.t.name.localeCompare(b.t.name));
  const seats = seatTools.length ? `<section class="card" id="seats"><div class="card-top"><h2 class="card-h">Seats bought and used</h2><span class="muted small">From who marked "I use this" · active plans</span></div>
    <ul class="seat-rows">${seatTools.map(({ t, w }) => `<li><a href="/tools/${t.id}" class="seat-row">${mono(t.name, 'sm')}<span class="seat-name">${esc(t.name)}</span>${seatMeter(t)}<span class="seat-waste">${w.unused ? `${money(w.monthly, t.currency)}<small>/mo unused</small>` : '<span class="ok-text">Full</span>'}</span></a></li>`).join('')}</ul></section>` : '';

  return `<div class="page-head"><div><p class="eyebrow">${esc(longDay(today))}</p><h1>Your tool stack</h1><p class="lede">What the team pays for, what renews next, and where seats sit unused.</p></div>
    <div class="head-actions">${viewer.admin ? `<a class="btn" href="/tools/new">${ICON.plus}Add a tool</a>` : ''}</div></div>
  ${exampleBanner(viewer, hasExamples)}
  ${hero}${kpis}
  <div class="split split-attn"><div class="split-main">${comingCard}${seats}</div><aside class="split-side">${attentionCard}${mineCard}</aside></div>`;
}

/* ---------- The register ---------- */

const SORTS = { renewal: 'Next renewal', cost: 'Monthly cost', name: 'Name', waste: 'Unused seats' };

export function register({ viewer, today, tools, shown, filters, hasExamples }) {
  const cats = [...new Set(tools.map((t) => t.category))].sort((a, b) => categoryIndex(a) - categoryIndex(b) || a.localeCompare(b));
  const q = (change) => {
    const p = new URLSearchParams({ ...filters, ...change });
    for (const [k, v] of [...p]) if (!v || (k === 'sort' && v === 'renewal') || (k === 'status' && v === 'all') || (k === 'category' && v === 'all')) p.delete(k);
    const s = p.toString();
    return `/tools${s ? `?${s}` : ''}`;
  };
  const chip = (label, change, on) => `<a class="fchip${on ? ' on' : ''}" href="${esc(q(change))}"${on ? ' aria-current="true"' : ''}>${label}</a>`;

  const row = (t) => {
    const renewal = t.status === 'trial' ? t.trial_ends : nextRenewal(t.renews_on, t.billing, today);
    const days = renewal ? daysBetween(today, renewal) : undefined;
    return `<tr data-href="/tools/${t.id}">
      <td class="c-tool"><a class="tool-cell" href="/tools/${t.id}">${mono(t.name)}<span><span class="tname"><b>${esc(t.name)}</b>${exampleTag(t)}</span><small><span class="swatch cat-${categoryIndex(t.category)}"></span>${esc(t.category)}${t.plan ? ` · ${esc(t.plan)}` : ''}</small></span></a></td>
      <td class="c-owner">${t.owner ? `<span class="person">${avatar(t.owner, 'sm')}${short(t.owner)}</span>` : '<span class="no-owner">No owner</span>'}</td>
      <td class="c-seats">${seatMeter(t)}</td>
      <td class="c-cost num"><b>${money(monthlyCents(t), t.currency)}</b><small>${t.billing === 'annual' ? `${money(periodCents(t), t.currency)} yearly` : 'monthly'}${t.status === 'trial' ? ' · after trial' : ''}</small></td>
      <td class="c-renew">${renewal ? `<span class="renew-date">${t.status === 'trial' ? 'Trial ends ' : t.status === 'cancelling' ? 'Ends ' : ''}${day(renewal, today)}</span>${whenChip(days)}` : '<span class="muted">No date</span>'}</td>
      <td class="c-status">${statusChip(t.status)}</td></tr>`;
  };
  const totals = (() => {
    const by = new Map();
    for (const t of shown.filter(isPaid)) by.set(t.currency, (by.get(t.currency) ?? 0) + monthlyCents(t));
    return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `<b>${money(v, c)}</b> a month${by.size > 1 ? ` in ${esc(c)}` : ''}`).join(' · ');
  })();

  const filtered = filters.q || filters.category !== 'all' || filters.status !== 'all';
  return `<div class="page-head"><div><h1>Tools</h1><p class="lede">Everything the team pays for, who owns it, and when it renews.</p></div>
    <div class="head-actions">${viewer.admin ? `<a class="btn btn-primary" href="/tools/new">${ICON.plus}Add a tool</a>` : `<a class="btn" href="/requests/new">${ICON.plus}Request a tool</a>`}</div></div>
  ${exampleBanner(viewer, hasExamples)}
  <section class="card table-card">
    <form class="toolbar" method="get" action="/tools" role="search">
      <label class="search">${ICON.search}<span class="sr">Search tools</span><input type="search" name="q" value="${esc(filters.q)}" placeholder="Search by name, plan or owner"></label>
      ${filters.category !== 'all' ? `<input type="hidden" name="category" value="${esc(filters.category)}">` : ''}${filters.status !== 'all' ? `<input type="hidden" name="status" value="${esc(filters.status)}">` : ''}
      <label class="sort"><span>Sort</span><select name="sort" data-autosubmit>${Object.entries(SORTS).map(([k, v]) => `<option value="${k}"${filters.sort === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <button class="btn btn-sm nojs">Apply</button>
    </form>
    <div class="fchips" aria-label="Filter by category">${chip('All', { category: 'all' }, filters.category === 'all')}${cats.map((c) => chip(`<span class="swatch cat-${categoryIndex(c)}"></span>${esc(c)}`, { category: c }, filters.category === c)).join('')}
      <span class="fsep"></span>${STATUSES.map((s) => chip(`${STATUS_ICON[s]}${STATUS_LABEL[s]}`, { status: filters.status === s ? 'all' : s }, filters.status === s)).join('')}</div>
    ${shown.length ? `<div class="table-wrap"><table class="table tools-table"><thead><tr><th>Tool</th><th>Owner</th><th>Seats used</th><th class="num">Per month</th><th>Next date</th><th>Status</th></tr></thead>
      <tbody>${shown.map(row).join('')}</tbody></table></div>
      <div class="table-foot"><span>${plural(shown.length, 'tool')}${filtered ? ` of ${tools.length}` : ''}</span><span>${totals ? `Paid: ${totals}` : 'Nothing paid in this view'}</span></div>`
      : tools.length
        ? empty(ICON.search, 'No tools match', 'Try another word, or clear the filters.', `<a class="btn" href="/tools">Clear filters</a>`)
        : empty(ICON.stack, 'The register is empty', viewer.admin ? 'Add the tools the team pays for. Each one gets an owner, a renewal date and a seat count.' : 'An admin adds tools here. You can ask for one now.', viewer.admin ? `<a class="btn btn-primary" href="/tools/new">${ICON.plus}Add a tool</a>` : `<a class="btn btn-primary" href="/requests/new">${ICON.plus}Request a tool</a>`)}
  </section>`;
}

/* ---------- One tool ---------- */

const EVENT_TEXT = {
  added: 'added it to the register',
  edited: 'changed the details',
  status: 'changed the status to',
  seat_added: 'approved a seat for',
  joined: 'marked "I use this"',
  left: 'stopped using it',
  removed_user: 'freed the seat of',
  approved: 'approved the request that added it',
};

export function toolPage({ viewer, today, tool: t, users, events, requests, iUse }) {
  const renewal = t.status === 'trial' ? t.trial_ends : nextRenewal(t.renews_on, t.billing, today);
  const days = renewal ? daysBetween(today, renewal) : undefined;
  const waste = seatWaste(t, t.using);
  const site = t.website ? `<a class="site" href="${esc(t.website)}" target="_blank" rel="noopener noreferrer">${esc(new URL(t.website).hostname.replace(/^www\./, ''))}${ICON.link}</a>` : '';
  const seatPending = requests.some((r) => r.status === 'pending' && r.requester === viewer.email);

  const useAction = iUse
    ? `<form method="post" action="/tools/${t.id}/unuse"><button class="btn btn-on" aria-pressed="true">${ICON.check}You use this</button></form>`
    : `<form method="post" action="/tools/${t.id}/use"><button class="btn btn-primary">${ICON.plus}I use this</button></form>`;
  const seatAction = t.pricing === 'per_seat' && !iUse && !seatPending && t.status !== 'cancelling'
    ? `<a class="btn" href="/requests/new?kind=seat&tool=${t.id}">${ICON.seat}Request a seat</a>` : '';

  const facts = `<section class="facts">
    <div class="fact"><span class="label">Costs</span><b class="fact-n">${money(monthlyCents(t), t.currency)}<small> / month</small></b>
      <span class="sub">${t.billing === 'annual' ? `Billed ${money(periodCents(t), t.currency)} a year` : `${money(annualCents(t), t.currency)} a year`}${t.pricing === 'per_seat' ? ` · ${money(t.price_cents, t.currency)} a seat a ${per(t.billing)}` : ' · flat price'}</span></div>
    <div class="fact"><span class="label">${t.status === 'trial' ? 'Trial ends' : t.status === 'cancelling' ? 'Ends on' : 'Next renewal'}</span><b class="fact-n">${renewal ? day(renewal, today) : 'No date'}</b>
      <span class="sub">${renewal ? `${whenChip(days)} ${BILLING_LABEL[t.billing].toLowerCase()} billing` : 'Add the date it renews so it shows up in time.'}</span></div>
    <div class="fact"><span class="label">Seats</span>${t.pricing === 'per_seat' && t.seats_bought ? `<b class="fact-n">${t.using}<small> of ${t.seats_bought} used</small></b>${seatMeter(t)}<span class="sub">${waste.unused ? `<span class="unused">${plural(waste.unused, 'seat')} unused</span> · ${money(waste.monthly, t.currency)} a month` : t.using > t.seats_bought ? `<span class="over">${t.using - t.seats_bought} more people than seats</span>` : 'Every seat has someone'}</span>` : `<b class="fact-n">${t.using}<small> ${t.using === 1 ? 'person' : 'people'}</small></b><span class="sub">${t.pricing === 'flat' ? 'Flat price, not per seat' : 'No seat count entered'}</span>`}</div>
    <div class="fact"><span class="label">Owner</span>${t.owner ? `<b class="fact-n fact-person">${avatar(t.owner)}${short(t.owner)}</b><span class="sub">Gets the renewal email</span>` : `<b class="fact-n no-owner">No owner</b><span class="sub">${viewer.admin ? `<a href="/tools/${t.id}/edit">Choose one</a> so someone gets the renewal email` : 'An admin chooses one'}</span>`}</div>
  </section>`;

  const people = users.length ? `<ul class="people">${users.map((u) => `<li>${avatar(u.email)}<span><b>${esc(u.email)}</b><small>since ${ago(u.since)}</small></span>${viewer.admin && u.email !== viewer.email ? `<form method="post" action="/tools/${t.id}/users/remove" data-confirm="Free the seat ${esc(u.email)} has? They can mark it again any time."><input type="hidden" name="email" value="${esc(u.email)}"><button class="btn btn-sm btn-ghost">Free seat</button></form>` : ''}</li>`).join('')}</ul>`
    : empty(ICON.user, 'Nobody has marked this yet', 'People who use it click "I use this", so the seat count is real.');

  const reqs = requests.length ? `<ul class="mini-list">${requests.map((r) => `<li><a href="/requests/${r.id}">${requestNumber(r.id)}</a> ${r.kind === 'seat' ? `${plural(r.seats, 'seat')} for` : 'Asked for by'} ${short(r.requester)} ${reqStatus(r.status)}</li>`).join('')}</ul>` : '<p class="muted small">No requests for this tool.</p>';
  const history = events.length ? `<ol class="timeline">${events.map((e) => `<li>${avatar(e.actor, 'sm')}<div><p><b>${short(e.actor)}</b> ${EVENT_TEXT[e.kind] ?? esc(e.kind)}${e.note ? ` <span class="ev-note">${esc(e.note)}</span>` : ''}</p><small>${ago(e.created_at)}</small></div></li>`).join('')}</ol>` : '<p class="muted small">Nothing recorded yet.</p>';

  return `<div class="page-head tool-head"><div class="tool-title">
      <a class="back" href="/tools">${ICON.back}All tools</a>
      <div class="tool-id">${mono(t.name, 'lg')}<div><h1>${esc(t.name)}</h1>
      <p class="tool-meta">${statusChip(t.status)}<span class="cat"><span class="swatch cat-${categoryIndex(t.category)}"></span>${esc(t.category)}</span>${t.plan ? `<span>${esc(t.plan)} plan</span>` : ''}${site}${exampleTag(t)}</p></div></div></div>
    <div class="head-actions">${useAction}${seatAction}${viewer.admin ? `<a class="btn btn-ghost" href="/tools/${t.id}/edit">${ICON.edit}Edit</a>` : ''}</div></div>
  ${seatPending ? `<div class="note">${ICON.inbox}<span>Your request for this tool is waiting for an admin. <a href="/requests?tab=waiting">See requests</a></span></div>` : ''}
  ${facts}
  <div class="split"><div class="split-main">
    <section class="card"><div class="card-top"><h2 class="card-h">Who uses it</h2><span class="count">${t.using}</span></div>${people}</section>
    ${t.notes ? `<section class="card"><h2 class="card-h">Notes</h2><p class="notes">${esc(t.notes)}</p></section>` : ''}
  </div><aside class="split-side">
    <section class="card"><h2 class="card-h">Requests</h2>${reqs}</section>
    <section class="card"><h2 class="card-h">History</h2>${history}</section>
  </aside></div>`;
}

/* ---------- Add and edit a tool ---------- */

const radio = (name, value, label, current, hint = '') => `<label class="seg-opt"><input type="radio" name="${name}" value="${value}"${current === value ? ' checked' : ''}><span>${label}${hint ? `<small>${hint}</small>` : ''}</span></label>`;

const costFields = (v, { seatsName = 'seats_bought', seatsLabel = 'Seats bought' } = {}) => `
  <div class="field field-wide"><span>How it's priced</span><div class="seg">${radio('pricing', 'per_seat', 'Per seat', v.pricing ?? 'per_seat', 'each person pays')}${radio('pricing', 'flat', 'Flat price', v.pricing, 'one price for the team')}</div></div>
  <div class="field field-wide"><span>Billed</span><div class="seg">${radio('billing', 'monthly', 'Monthly', v.billing ?? 'monthly')}${radio('billing', 'annual', 'Yearly', v.billing)}</div></div>
  <label class="field"><span data-price-label>Price <small>(a seat, a billing period)</small></span><span class="money-in"><input name="price" inputmode="decimal" required value="${esc(amountField(v.price_cents))}" placeholder="30" data-price></span></label>
  <label class="field"><span>Currency</span><select name="currency" data-currency>${CURRENCIES.map((c) => `<option${(v.currency ?? 'USD') === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
  <label class="field" data-seats-field><span>${seatsLabel}</span><input name="${seatsName}" type="number" min="${seatsName === 'seats' ? 1 : 0}" max="100000" value="${esc(v[seatsName] ?? '')}" data-seats></label>
  <p class="calc field-wide" data-calc aria-live="polite"></p>`;

export function toolForm({ tool, people, today }) {
  const v = tool ?? { status: 'active', currency: 'USD', billing: 'monthly', pricing: 'per_seat', category: '' };
  const editing = tool?.id !== undefined;
  return `<div class="page-head"><div><a class="back" href="${editing ? `/tools/${tool.id}` : '/tools'}">${ICON.back}${editing ? esc(tool.name) : 'All tools'}</a>
    <h1>${editing ? `Edit ${esc(tool.name)}` : 'Add a tool'}</h1><p class="lede">${editing ? 'Changes show everywhere at once.' : 'One entry per plan the team pays for.'}</p></div></div>
  <form class="form-layout" method="post" action="${editing ? `/tools/${tool.id}/edit` : '/tools/new'}">
    <div class="card form-card">
      <h2 class="card-h">The tool</h2>
      <div class="grid">
        <label class="field"><span>Name</span><input name="name" required maxlength="80" value="${esc(v.name ?? '')}" placeholder="Claude"></label>
        <label class="field"><span>Category</span><input name="category" required maxlength="40" list="categories" value="${esc(v.category)}" placeholder="AI assistants"><datalist id="categories">${CATEGORIES.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label class="field"><span>Plan <small>(optional)</small></span><input name="plan" maxlength="60" value="${esc(v.plan ?? '')}" placeholder="Team"></label>
        <label class="field"><span>Website <small>(optional, shown as a link)</small></span><input name="website" maxlength="200" value="${esc(v.website ?? '')}" placeholder="claude.ai"></label>
      </div>
      <h2 class="card-h">Cost</h2>
      <div class="grid">${costFields(v)}</div>
      <h2 class="card-h">Dates and owner</h2>
      <div class="grid">
        <label class="field"><span>Status</span><select name="status" data-status>${STATUSES.map((s) => `<option value="${s}"${v.status === s ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select></label>
        <label class="field" data-renew-field><span>Renews on <small>(any renewal; it rolls forward)</small></span><input name="renews_on" type="date" value="${esc(v.renews_on ?? '')}"></label>
        <label class="field" data-trial-field><span>Trial ends</span><input name="trial_ends" type="date" value="${esc(v.trial_ends ?? '')}" min="${esc(editing ? '' : today)}"></label>
        <label class="field"><span>Owner <small>(gets the renewal email)</small></span><select name="owner"><option value="">No owner yet</option>${people.map((p) => `<option value="${esc(p.email)}"${v.owner === p.email ? ' selected' : ''}>${esc(p.email)}</option>`).join('')}</select>
          <small class="help">People appear here once they have opened the app.</small></label>
        <label class="field field-wide"><span>Notes <small>(optional)</small></span><textarea name="notes" rows="3" maxlength="1000" placeholder="Who to ask, why we have it, what replaces it.">${esc(v.notes ?? '')}</textarea></label>
      </div>
      <div class="form-actions">${editing ? `<button class="btn btn-ghost btn-danger" formaction="/tools/${tool.id}/delete" formnovalidate data-confirm-click="Remove ${esc(tool.name)} from the register? Its history and who used it go too.">${ICON.trash}Remove from register</button>` : ''}
        <a class="btn btn-ghost" href="${editing ? `/tools/${tool.id}` : '/tools'}">Cancel</a><button class="btn btn-primary">${ICON.check}${editing ? 'Save changes' : 'Add to register'}</button></div>
    </div>
    <aside class="form-aside"><div class="card tip"><h2 class="card-h">Getting it right</h2>
      <ul class="tips"><li><b>Price</b> is what one billing period costs: a seat a month, or a seat a year for yearly plans.</li>
      <li><b>Monthly figures</b> divide a yearly bill by twelve. Totals never mix currencies.</li>
      <li><b>Renewal date</b> can be any past renewal. The app rolls it forward a month or a year at a time.</li>
      <li><b>Trials</b> aren't counted in spend until you mark them active.</li></ul></div></aside>
  </form>`;
}

/* ---------- Requests ---------- */

const REQ_STATUS = { pending: ['Waiting', ICON.clock], approved: ['Approved', ICON.check], declined: ['Declined', ICON.x], withdrawn: ['Withdrawn', ICON.back] };
const reqStatus = (s) => `<span class="chip chip-req-${s}">${REQ_STATUS[s][1]}${REQ_STATUS[s][0]}</span>`;

const requestCost = (r) => {
  if (r.price_cents === null || r.price_cents === undefined) return 'No price given';
  const total = r.pricing === 'per_seat' ? r.price_cents * r.seats : r.price_cents;
  const monthly = r.billing === 'annual' ? Math.round(total / 12) : total;
  return `about ${money(monthly, r.currency)} a month`;
};

const requestCard = (r, viewer) => `<li><a class="req" href="/requests/${r.id}">
  ${mono(r.tool_name)}
  <span class="req-body"><span class="req-top"><span class="kind kind-${r.kind}">${r.kind === 'seat' ? `${ICON.seat}Seat` : `${ICON.plus}New tool`}</span><span class="muted small">${requestNumber(r.id)}</span>${exampleTag(r)}</span>
    <b>${r.kind === 'seat' ? `${plural(r.seats, 'seat')} on ${esc(r.tool_name)}` : `${esc(r.tool_name)}${r.seats > 1 ? ` for ${r.seats} people` : ''}`}</b>
    <span class="req-why">${esc(r.purpose)}</span>
    <small class="req-meta">${avatar(r.requester, 'xs')}<span>${r.requester === viewer.email ? 'You' : short(r.requester)} · ${ago(r.created_at)} · ${requestCost(r)}</span></small></span>
  <span class="req-side">${reqStatus(r.status)}${r.status === 'pending' && viewer.admin ? `<span class="req-go">Decide ${ICON.arrow}</span>` : ''}</span></a></li>`;

export function requestsPage({ viewer, requests, tab, hasExamples }) {
  const waiting = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending');
  const mine = requests.filter((r) => r.requester === viewer.email);
  const list = { waiting, decided, mine }[tab];
  const t = (key, label, n) => `<a class="tab" href="/requests?tab=${key}"${tab === key ? ' aria-current="true"' : ''}>${label} <span class="tab-n">${n}</span></a>`;
  const emptyText = {
    waiting: [ICON.check, 'Nothing waiting', viewer.admin ? 'New requests show here, and you get an email when one arrives.' : 'When you ask for a tool or a seat, it waits here for an admin.'],
    decided: [ICON.inbox, 'No decisions yet', 'Approved and declined requests stay here with the reason, so nobody has to ask twice.'],
    mine: [ICON.inbox, "You haven't asked for anything", 'Need a tool, or a seat on one the team already pays for? Ask here instead of in a DM.'],
  }[tab];
  return `<div class="page-head"><div><h1>Requests</h1><p class="lede">Ask for a new tool or a seat on one we have. An admin approves or declines with a reason, and an approved tool joins the register.</p></div>
    <div class="head-actions"><a class="btn btn-primary" href="/requests/new">${ICON.plus}Request a tool</a></div></div>
  ${exampleBanner(viewer, hasExamples)}
  <section class="card table-card"><div class="tabs">${t('waiting', 'Waiting', waiting.length)}${t('decided', 'Decided', decided.length)}${t('mine', 'Yours', mine.length)}</div>
  ${list.length ? `<ul class="reqs">${list.map((r) => requestCard(r, viewer)).join('')}</ul>` : empty(emptyText[0], emptyText[1], emptyText[2], tab === 'decided' ? '' : `<a class="btn btn-primary" href="/requests/new">${ICON.plus}Request a tool</a>`)}</section>`;
}

export function requestForm({ kind, tools, toolId, values = {} }) {
  const seatTools = tools.filter((t) => t.status !== 'cancelling');
  const tab = (k, label, icon) => `<a class="seg-tab" href="/requests/new${k === 'seat' ? '?kind=seat' : ''}"${kind === k ? ' aria-current="true"' : ''}>${icon}${label}</a>`;
  const body = kind === 'seat'
    ? `<div class="grid">
        <label class="field field-wide"><span>Which tool</span><select name="tool_id" required><option value="">Choose a tool the team pays for</option>${seatTools.map((t) => `<option value="${t.id}"${String(toolId) === String(t.id) ? ' selected' : ''}>${esc(t.name)}${t.plan ? ` (${esc(t.plan)})` : ''}</option>`).join('')}</select></label>
        <label class="field"><span>Seats</span><input name="seats" type="number" min="1" max="500" value="${esc(values.seats ?? 1)}" required><small class="help">Just you? Leave it at 1.</small></label>
        <label class="field field-wide"><span>What you need it for</span><textarea name="purpose" rows="3" required maxlength="600" placeholder="Prototyping the onboarding flow with design.">${esc(values.purpose ?? '')}</textarea></label>
      </div>`
    : `<div class="grid">
        <label class="field"><span>Which tool</span><input name="tool_name" required maxlength="80" value="${esc(values.tool_name ?? '')}" placeholder="Granola"></label>
        <label class="field"><span>Website <small>(optional)</small></span><input name="website" maxlength="200" value="${esc(values.website ?? '')}" placeholder="granola.ai"></label>
        <label class="field"><span>Category</span><input name="category" required maxlength="40" list="categories" value="${esc(values.category ?? '')}" placeholder="AI assistants"><datalist id="categories">${CATEGORIES.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label class="field field-wide"><span>What it's for</span><textarea name="purpose" rows="3" required maxlength="600" placeholder="What would it do for you, and what do you use today instead?">${esc(values.purpose ?? '')}</textarea></label>
      </div>
      <h2 class="card-h">Rough cost <small class="muted">(your best guess from the pricing page)</small></h2>
      <div class="grid">${costFields({ ...values, seats: values.seats ?? 1 }, { seatsName: 'seats', seatsLabel: 'How many people' })}</div>`;
  return `<div class="page-head"><div><a class="back" href="/requests">${ICON.back}Requests</a><h1>Request a tool</h1><p class="lede">Ask here instead of in a DM, so the decision and the reason are kept.</p></div></div>
  <div class="seg-tabs">${tab('new', 'A new tool', ICON.plus)}${tab('seat', 'A seat on one we have', ICON.seat)}</div>
  <form class="form-layout" method="post" action="/requests/new">
    <input type="hidden" name="kind" value="${kind}">
    <div class="card form-card">${body}
      <div class="form-actions"><a class="btn btn-ghost" href="/requests">Cancel</a><button class="btn btn-primary">${ICON.arrow}Send request</button></div></div>
    <aside class="form-aside"><div class="card tip"><h2 class="card-h">What happens next</h2>
      <ol class="steps-list"><li><b>An admin is emailed</b> and sees it under Requests.</li><li><b>They approve or decline</b>, with a reason either way.</li><li><b>${kind === 'seat' ? "You're added to the tool" : 'The tool joins the register'}</b>${kind === 'seat' ? ' and the seat count goes up if a new seat was bought.' : ', with you marked as using it.'}</li></ol>
      <p class="muted small">You get an email with the answer. It's also on the request's page.</p></div></aside>
  </form>`;
}

export function requestPage({ viewer, today, request: r, tool, block, people, similar, related = [] }) {
  const pending = r.status === 'pending';
  const freeSeats = tool ? seatWaste(tool, tool.using).unused : 0;
  let decide = '';
  if (pending && !block) {
    const approve = r.kind === 'seat'
      ? `<form method="post" action="/requests/${r.id}/approve" class="stack">
          ${tool ? `<p class="hint">${esc(tool.name)} has ${plural(tool.seats_bought ?? 0, 'seat')}, ${tool.using} in use${freeSeats ? `, so <b>${plural(freeSeats, 'seat is', 'seats are')} free</b>` : ''}.</p>` : '<p class="hint">The tool was removed from the register.</p>'}
          <label class="field"><span>New seats to buy</span><input name="buy" type="number" min="0" max="500" value="${Math.max(0, r.seats - freeSeats)}"><small class="help">0 gives a free seat. ${tool && tool.pricing === 'per_seat' ? `Each new seat adds ${money(seatMonthlyCents(tool), tool.currency)} a month.` : ''}</small></label>
          <button class="btn btn-success btn-block"${tool ? '' : ' disabled'}>${ICON.check}Approve and add ${short(r.requester)}</button></form>`
      : `<form method="post" action="/requests/${r.id}/approve" class="stack">
          <p class="hint">Approving adds it to the register. Check the details first.</p>
          <div class="grid grid-tight">
            <label class="field"><span>Name</span><input name="name" required maxlength="80" value="${esc(r.tool_name)}"></label>
            <label class="field"><span>Category</span><input name="category" required maxlength="40" list="categories" value="${esc(r.category)}"><datalist id="categories">${CATEGORIES.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
            <input type="hidden" name="website" value="${esc(r.website ?? '')}">
            <label class="field"><span>Plan</span><input name="plan" maxlength="60" placeholder="Team"></label>
            <label class="field"><span>Status</span><select name="status" data-status><option value="trial">Trial</option><option value="active">Active</option></select></label>
            <label class="field" data-trial-field><span>Trial ends</span><input name="trial_ends" type="date" value="${esc(addDays(today, 14))}"></label>
            <label class="field" data-renew-field><span>Renews on</span><input name="renews_on" type="date"></label>
            <label class="field field-wide"><span>Owner</span><select name="owner">${[r.requester, ...people.map((p) => p.email).filter((e) => e !== r.requester)].map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join('')}<option value="">No owner yet</option></select></label>
            ${costFields({ ...r, seats_bought: r.seats })}
          </div>
          <button class="btn btn-success btn-block">${ICON.check}Approve and add to register</button></form>`;
    decide = `<section class="card decide"><h2 class="card-h">Approve</h2>${approve}</section>
      <section class="card decide"><h2 class="card-h">Or decline</h2><form method="post" action="/requests/${r.id}/decline" class="stack">
        <label class="field"><span>Reason <small>(${short(r.requester)} sees this)</small></span><textarea name="reason" rows="3" required maxlength="600" placeholder="We already pay for something that does this. Ask for a seat on it instead."></textarea></label>
        <button class="btn btn-block btn-danger-soft">${ICON.x}Decline</button></form></section>`;
  } else if (pending) {
    decide = `<section class="card"><h2 class="card-h">Decision</h2><p class="hint">${esc(block)}</p>${r.requester === viewer.email ? `<form method="post" action="/requests/${r.id}/withdraw" data-confirm="Withdraw this request?"><button class="btn btn-block btn-ghost">Withdraw request</button></form>` : ''}</section>`;
  } else {
    decide = `<section class="card verdict verdict-${r.status}"><h2 class="card-h">${REQ_STATUS[r.status][1]}${REQ_STATUS[r.status][0]}</h2>
      <p>${r.status === 'withdrawn' ? `${short(r.requester)} withdrew it` : `By ${esc(r.decided_by)}`} · ${r.decided_at ? ago(r.decided_at) : ''}</p>
      ${r.reason ? `<blockquote>${esc(r.reason)}</blockquote>` : ''}
      ${r.status === 'approved' && r.tool_id ? `<a class="btn btn-block" href="/tools/${r.tool_id}">Open ${esc(r.tool_name)} ${ICON.arrow}</a>` : ''}</section>`;
  }
  return `<div class="page-head"><div><a class="back" href="/requests">${ICON.back}Requests</a>
    <div class="tool-id">${mono(r.tool_name, 'lg')}<div><p class="eyebrow">${requestNumber(r.id)} · ${r.kind === 'seat' ? 'Seat request' : 'New tool request'}</p>
    <h1>${r.kind === 'seat' ? `${plural(r.seats, 'seat')} on ${esc(r.tool_name)}` : esc(r.tool_name)}</h1><p class="tool-meta">${reqStatus(r.status)}${exampleTag(r)}</p></div></div></div></div>
  <div class="split"><div class="split-main">
    <section class="card"><div class="asker">${avatar(r.requester)}<div><b>${esc(r.requester)}</b><small>asked ${ago(r.created_at)}</small></div></div>
      <blockquote class="purpose">${esc(r.purpose)}</blockquote>
      <dl class="dl">
        <dt>Category</dt><dd>${esc(r.category)}</dd>
        <dt>${r.kind === 'seat' ? 'Seats' : 'People'}</dt><dd>${r.seats}</dd>
        ${r.price_cents !== null && r.price_cents !== undefined ? `<dt>Their estimate</dt><dd>${money(r.price_cents, r.currency)} ${r.pricing === 'per_seat' ? 'a seat ' : ''}a ${per(r.billing)}, ${requestCost(r)}</dd>` : ''}
        ${r.website ? `<dt>Website</dt><dd><a href="${esc(r.website)}" target="_blank" rel="noopener noreferrer">${esc(new URL(r.website).hostname)}</a></dd>` : ''}
        ${tool ? `<dt>In the register</dt><dd><a href="/tools/${tool.id}">${esc(tool.name)}</a> · ${seatMeter(tool)}</dd>` : ''}
      </dl>
      ${similar ? `<div class="note">${ICON.info}<span><a href="/tools/${similar.id}">${esc(similar.name)}</a> is already in the register. A seat on it may be all that's needed.</span></div>` : ''}
    </section>
    ${related.length ? `<section class="card"><div class="card-top"><h2 class="card-h">Already paying for in ${esc(r.category)}</h2><span class="muted small">Check for overlap and free seats</span></div>
      <ul class="related">${related.map((t) => `<li><a href="/tools/${t.id}">${mono(t.name, 'sm')}<span class="rel-name"><b>${esc(t.name)}</b><small>${esc(t.plan || STATUS_LABEL[t.status])}</small></span>${seatMeter(t)}<span class="rel-cost">${money(monthlyCents(t), t.currency)}<small class="muted"> /mo</small></span></a></li>`).join('')}</ul></section>` : ''}
  </div><aside class="split-side">${decide}</aside></div>`;
}

/* ---------- Mine ---------- */

export function minePage({ viewer, today, using, owning, others, requests }) {
  const card = (t) => {
    const renewal = t.status === 'trial' ? t.trial_ends : nextRenewal(t.renews_on, t.billing, today);
    return `<li class="tile">${mono(t.name)}<a class="tile-body" href="/tools/${t.id}"><b>${esc(t.name)}</b><small>${esc(t.category)}${t.plan ? ` · ${esc(t.plan)}` : ''}</small></a>
      ${t.status !== 'active' ? statusChip(t.status) : ''}${renewal && t.owner === viewer.email ? whenChip(daysBetween(today, renewal)) : ''}
      <form method="post" action="/tools/${t.id}/unuse"><input type="hidden" name="back" value="/me"><button class="btn btn-sm btn-ghost" title="Stop using ${esc(t.name)}">Stop using</button></form></li>`;
  };
  const owned = owning.map((t) => {
    const renewal = t.status === 'trial' ? t.trial_ends : nextRenewal(t.renews_on, t.billing, today);
    const w = seatWaste(t, t.using);
    return `<li><a class="own" href="/tools/${t.id}">${mono(t.name, 'sm')}<span class="own-body"><b>${esc(t.name)}</b><small>${money(monthlyCents(t), t.currency)} a month · ${w.unused ? `<span class="unused">${plural(w.unused, 'seat')} unused</span>` : `${plural(t.using, 'person', 'people')}`}</small></span>${renewal ? `<span class="own-date">${t.status === 'trial' ? 'Trial ends' : t.status === 'cancelling' ? 'Ends' : 'Renews'} ${day(renewal, today)}</span>${whenChip(daysBetween(today, renewal))}` : ''}</a></li>`;
  }).join('');
  return `<div class="page-head"><div><h1>Your tools</h1><p class="lede">What you use, what you look after, and what you've asked for. Marking what you use keeps the seat counts honest.</p></div>
    <div class="head-actions"><a class="btn btn-primary" href="/requests/new">${ICON.plus}Request a tool</a></div></div>
  <div class="split"><div class="split-main">
    <section class="card"><div class="card-top"><h2 class="card-h">You use</h2><span class="count">${using.length}</span></div>
      ${using.length ? `<ul class="tiles">${using.map(card).join('')}</ul>` : (others.length
        ? empty(ICON.user, "You haven't marked any tools", 'Find the ones you use below and mark them. It takes a minute and tells the team which seats are really used.')
        : empty(ICON.user, 'Nothing to mark yet', 'Once an admin adds the tools the team pays for, mark the ones you use here.', `<a class="btn" href="/requests/new">${ICON.plus}Request a tool</a>`))}</section>
    ${others.length ? `<section class="card"><div class="card-top"><h2 class="card-h">Do you use any of these?</h2><span class="muted small">Tools the team pays for that you haven't marked</span></div>
      <ul class="pick">${others.map((t) => `<li>${mono(t.name, 'sm')}<a href="/tools/${t.id}"><b>${esc(t.name)}</b><small>${esc(t.category)}</small></a><form method="post" action="/tools/${t.id}/use"><input type="hidden" name="back" value="/me"><button class="btn btn-sm">${ICON.plus}I use this</button></form></li>`).join('')}</ul></section>` : ''}
  </div><aside class="split-side">
    <section class="card"><div class="card-top"><h2 class="card-h">You own</h2><span class="count">${owning.length}</span></div>
      ${owning.length ? `<ul class="owns">${owned}</ul><p class="muted small">You get one email on weekday mornings when one of these renews or ends within two weeks.</p>` : '<p class="muted small">Owners look after a tool\'s renewal and seats. An admin sets the owner on the tool\'s page.</p>'}</section>
    <section class="card"><div class="card-top"><h2 class="card-h">Your requests</h2><a class="small" href="/requests/new">New ${ICON.plus}</a></div>
      ${requests.length ? `<ul class="mini-list">${requests.map((r) => `<li><a href="/requests/${r.id}">${r.kind === 'seat' ? 'Seat on ' : ''}${esc(r.tool_name)}</a> ${reqStatus(r.status)}</li>`).join('')}</ul>` : '<p class="muted small">Nothing asked for yet.</p>'}</section>
  </aside></div>`;
}

export const notFound = (what, href, label) => `<section class="card">${empty(ICON.search, what, 'It may have been removed, or the link is wrong.', `<a class="btn" href="${href}">${label}</a>`)}</section>`;
