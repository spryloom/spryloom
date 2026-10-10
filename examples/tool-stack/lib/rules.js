/**
 * Who may do what, when things renew, what needs attention, and who the
 * morning email goes to.
 *
 * Identity comes from the headers Spryloom sets after stripping any a caller
 * sent, so these rules can trust them. Kept apart from the server so they can
 * be tested without a database. Dates are ISO days ("2026-10-09") in UTC.
 */
import { formatMoney, periodCents, seatWaste } from './money.js';

export const STATUSES = ['active', 'trial', 'cancelling'];
export const STATUS_LABEL = { active: 'Active', trial: 'Trial', cancelling: 'Cancelling' };
export const BILLING_LABEL = { monthly: 'Monthly', annual: 'Yearly' };
export const PRICING_LABEL = { per_seat: 'Per seat', flat: 'Flat price' };
export const CATEGORIES = ['AI assistants', 'Engineering', 'Design', 'Productivity', 'Security', 'Sales and support', 'Other'];

/** How far ahead the morning email looks, and how many it may send of the app's 5 a day. */
export const DIGEST_DAYS = 14;
export const DIGEST_LIMIT = 3;
export const DAILY_EMAIL_LIMIT = 5;

export const viewerOf = (headers) => {
  const raw = headers['x-spryloom-email'];
  const email = typeof raw === 'string' && raw.trim() !== '' ? raw.trim().toLowerCase() : undefined;
  return email === undefined ? undefined : { email, admin: headers['x-spryloom-role'] === 'admin' };
};

/* ---------- Permissions ---------- */

/** Only admins add, change or remove tools in the register. */
export const canEditRegister = (viewer) => viewer.admin === true;

/**
 * Why this viewer can't approve or decline the request, or undefined if they
 * can. An admin doesn't decide their own request unless they are the only
 * admin who has opened the app; otherwise nobody could ever decide it.
 */
export function decisionBlock(viewer, request, adminCount) {
  if (!viewer.admin) return 'Only admins approve or decline requests.';
  if (request.status !== 'pending') return 'This request has already been decided.';
  if (request.requester === viewer.email && adminCount > 1) return 'You asked for this one, so another admin decides it.';
  return undefined;
}

/** The person who asked can withdraw a request while it waits. */
export const canWithdraw = (viewer, request) => request.status === 'pending' && request.requester === viewer.email;

/* ---------- Dates ---------- */

export const todayIso = (now = new Date()) => now.toISOString().slice(0, 10);
export const isIsoDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const utc = (iso) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (day, n) => iso(utc(day) + n * 86_400_000);
export const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / 86_400_000);

/** The same day n months later, or the month's last day when it is shorter (Jan 31 → Feb 28). */
export function addMonths(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/**
 * The next renewal on or after today. The stored date is any renewal the tool
 * has had; it rolls forward a month or a year at a time, always counted from
 * that date, so a plan that renews on the 31st stays on month ends.
 */
export function nextRenewal(anchor, billing, today) {
  if (!isIsoDay(anchor)) return undefined;
  if (anchor >= today) return anchor;
  const step = billing === 'annual' ? 12 : 1;
  for (let k = 1; k < 2400; k += 1) {
    const next = addMonths(anchor, k * step);
    if (next >= today) return next;
  }
  return undefined;
}

/**
 * Renewals, cancellations taking effect and trials ending within `days`,
 * soonest first. `amount` is the bill that date brings (or would bring, for a
 * trial that is kept), in the tool's own currency.
 */
export function upcoming(tools, today, days) {
  const items = [];
  for (const tool of tools) {
    if (tool.status === 'trial') {
      if (!isIsoDay(tool.trial_ends)) continue;
      const left = daysBetween(today, tool.trial_ends);
      if (left >= 0 && left <= days) items.push({ kind: 'trial', tool, date: tool.trial_ends, days: left, amount: periodCents(tool) });
      continue;
    }
    const date = nextRenewal(tool.renews_on, tool.billing, today);
    if (!date) continue;
    const left = daysBetween(today, date);
    if (left <= days) items.push({ kind: tool.status === 'cancelling' ? 'ends' : 'renews', tool, date, days: left, amount: periodCents(tool) });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount || a.tool.name.localeCompare(b.tool.name));
}

/* ---------- What needs attention ---------- */

const SEVERITY = { urgent: 0, soon: 1, info: 2 };

/**
 * Everything worth a look, most pressing first: renewals and trials in the
 * next two weeks (urgent inside a week), tools nobody owns, seats nobody uses,
 * and requests waiting for an answer.
 */
export function attention({ tools, usersByTool, requests, today }) {
  const out = [];
  for (const item of upcoming(tools, today, DIGEST_DAYS)) {
    out.push({ kind: item.kind, severity: item.days <= 7 ? 'urgent' : 'soon', tool: item.tool, days: item.days, date: item.date, amount: item.amount });
  }
  for (const tool of tools) {
    if (tool.status === 'trial' && isIsoDay(tool.trial_ends) && tool.trial_ends < today) {
      out.push({ kind: 'trial_over', severity: 'urgent', tool, days: daysBetween(today, tool.trial_ends), date: tool.trial_ends });
    }
    if (!tool.owner) out.push({ kind: 'no_owner', severity: 'info', tool, days: 999 });
    if (tool.status === 'active') {
      const waste = seatWaste(tool, usersByTool.get(tool.id) ?? 0);
      if (waste.unused >= 2 || (waste.unused >= 1 && waste.unused / tool.seats_bought >= 0.25)) {
        out.push({ kind: 'unused_seats', severity: 'soon', tool, days: 500, unused: waste.unused, monthly: waste.monthly });
      }
    }
  }
  for (const request of requests.filter((r) => r.status === 'pending')) {
    const waited = daysBetween(String(request.created_at instanceof Date ? request.created_at.toISOString() : request.created_at).slice(0, 10), today);
    out.push({ kind: 'request', severity: waited >= 2 ? 'soon' : 'info', request, days: 600 - waited, waited });
  }
  return out.sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity] || a.days - b.days || (b.monthly ?? 0) - (a.monthly ?? 0));
}

/* ---------- The morning email ---------- */

/**
 * Who gets the morning email, in order, within `limit` emails.
 *
 * One email per person. The admin who used the app most recently gets the
 * whole team's list, so nothing depends on an owner having a slot. Then each
 * owner gets their own tools, most urgent first. Admins left over get the
 * team list if any slots remain. Only people who have opened the app are
 * emailed; example people never are.
 */
export function planDigest({ items, people, limit = DIGEST_LIMIT }) {
  if (!items.length || limit <= 0) return [];
  const real = people.filter((p) => !p.example);
  const known = new Set(real.map((p) => p.email));
  const admins = real.filter((p) => p.admin).sort((a, b) => String(b.last_seen).localeCompare(String(a.last_seen)) || a.email.localeCompare(b.email));
  const lead = admins[0]?.email;
  const plans = [];
  if (lead) plans.push({ to: lead, items, scope: 'team' });

  const byOwner = new Map();
  for (const item of items) {
    const owner = item.tool.owner;
    if (!owner || !known.has(owner) || owner === lead) continue;
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), item]);
  }
  const owners = [...byOwner.entries()]
    .map(([to, own]) => ({ to, items: own, scope: 'own' }))
    .sort((a, b) => a.items[0].days - b.items[0].days || b.items.length - a.items.length || a.to.localeCompare(b.to));
  plans.push(...owners);

  for (const admin of admins.slice(1)) if (!byOwner.has(admin.email)) plans.push({ to: admin.email, items, scope: 'team' });
  return plans.slice(0, limit);
}

const when = (days) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);

/** One line per item, in the words the email and the app both use. */
export function itemLine(item) {
  const cost = formatMoney(item.amount, item.tool.currency, { whole: true });
  if (item.kind === 'trial') return `${item.tool.name} trial ends ${when(item.days)}, then ${cost} a ${item.tool.billing === 'annual' ? 'year' : 'month'}`;
  if (item.kind === 'ends') return `${item.tool.name} is cancelled and ends ${when(item.days)}`;
  return `${item.tool.name} renews ${when(item.days)} for ${cost}`;
}

/**
 * The subject and text of one morning email, inside Spryloom's limits:
 * subject 100 characters, text 500. Amounts are whole, so no "12.50" reads as
 * a web address.
 */
export function digestEmail(plan) {
  const n = plan.items.length;
  const subject = n === 1 ? itemLine(plan.items[0]).split(',')[0] : `${n} renewals and trials in the next ${DIGEST_DAYS} days`;
  const intro = plan.scope === 'team' ? 'Coming up for the team:' : 'Coming up for the tools you own:';
  let text = intro;
  let shown = 0;
  for (const item of plan.items) {
    const line = ` ${itemLine(item)}.`;
    if ((text + line).length > 420) break;
    text += line;
    shown += 1;
  }
  if (shown < n) text += ` And ${n - shown} more.`;
  text += ' Keep, cancel or change seats before the date.';
  return { subject: subject.slice(0, 100), text: text.slice(0, 500) };
}

/* ---------- Small things ---------- */

/**
 * A tool's website, as an ordinary web address, or undefined. Shown as a link
 * only; the app never fetches it.
 */
export function safeWebsite(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    if (!url.hostname.includes('.')) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export const requestNumber = (id) => `REQ-${String(id).padStart(3, '0')}`;
