/**
 * What a request may be, what it costs, who may decide it, and how email is
 * shared out under Spryloom's limit of 5 a day per app.
 *
 * Identity comes from the headers Spryloom sets after stripping any a caller
 * sent, so these rules can trust them. Kept apart from the server so they can
 * be tested without a database.
 */
import { addDays, daysWord, isIsoDate, overlaps, rangeText, workingDays, yearOf } from './days.js';

export const KINDS = ['vacation', 'sick', 'personal', 'other'];
export const KIND_LABEL = { vacation: 'Vacation', sick: 'Sick', personal: 'Personal', other: 'Other' };
/** As said after "5 days of". */
export const KIND_PHRASE = { vacation: 'vacation', sick: 'sick leave', personal: 'personal time', other: 'other leave' };
export const KIND_HINT = {
  vacation: 'Planned time away',
  sick: 'Unwell, or a medical appointment',
  personal: 'Moving, family, life admin',
  other: 'Anything else, such as jury duty',
};

/** A new app's yearly allowance per type, in working days. `null` means not counted against a balance. */
export const DEFAULT_ALLOWANCE = { vacation: 20, sick: 10, personal: 3, other: null };

export const STATUSES = ['pending', 'approved', 'declined', 'cancelled'];
export const STATUS_LABEL = { pending: 'Waiting', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled' };

/** How far back each type may start. Sick days are often recorded afterwards; vacation is booked ahead. */
export const DAYS_BACK = { vacation: 0, personal: 0, sick: 30, other: 30 };
export const MAX_CALENDAR_DAYS = 92;

export const viewerOf = (headers) => {
  const raw = headers['x-spryloom-email'];
  const email = typeof raw === 'string' && raw.trim() !== '' ? raw.trim().toLowerCase() : undefined;
  return email === undefined ? undefined : { email, admin: headers['x-spryloom-role'] === 'admin' };
};

/** "maya.chen@x.com" → "Maya Chen", unless the person has a name on record. */
export const nameOf = (email, name) => name || String(email).split('@')[0].split(/[._-]+/).filter(Boolean)
  .map((p) => p[0].toUpperCase() + p.slice(1)).join(' ') || email;

/**
 * Check a request form and work out what it costs.
 * `first` is the first day's part: full, am (morning only) or pm (afternoon only).
 * `last` is the last day's part when the request is longer than a day: full or am.
 * Returns `{ error }` in plain words, or `{ value }` ready to save.
 */
export function checkRequest(form, { today, holidays = new Set(), mine = [] }) {
  const kind = KINDS.includes(form.kind) ? form.kind : undefined;
  if (!kind) return { error: 'Choose what kind of time off this is.' };
  const { start } = form;
  const end = form.end || form.start;
  if (!isIsoDate(start) || !isIsoDate(end)) return { error: 'Choose the first and last day.' };
  if (end < start) return { error: 'The last day is before the first day. Swap them round.' };
  if (yearOf(start) !== yearOf(end)) {
    return { error: `Time off that runs into ${yearOf(end)} needs two requests, one for each year, so each counts against the right year's allowance.` };
  }
  if ((Date.parse(end) - Date.parse(start)) / 86_400_000 >= MAX_CALENDAR_DAYS) {
    return { error: 'That is longer than three months. Split it into shorter requests, or talk to an admin about extended leave.' };
  }
  const earliest = addDays(today, -DAYS_BACK[kind]);
  if (start < earliest) {
    return {
      error: DAYS_BACK[kind] === 0
        ? `${KIND_LABEL[kind]} can't start in the past. Choose today or a later day.`
        : `${KIND_LABEL[kind]} days can be recorded up to ${DAYS_BACK[kind]} days back. Ask an admin about anything older.`,
    };
  }

  const single = start === end;
  const first = ['full', 'am', 'pm'].includes(form.first) ? form.first : 'full';
  const last = form.last === 'am' ? 'am' : 'full';
  if (!single && first === 'am') return { error: 'On the first day of a longer break you can take the afternoon off, not the morning.' };
  const halfStart = first === 'pm';
  const halfEnd = single ? first === 'am' : last === 'am';

  const span = { start, end, halfStart, halfEnd };
  const days = workingDays(span, holidays);
  if (days === 0) return { error: 'Those dates fall on weekends or company holidays, so there are no working days to take.' };

  const clash = mine.find((r) => (r.status === 'pending' || r.status === 'approved') && overlaps(span, spanOf(r)));
  if (clash) {
    return { error: `You already have time off on ${rangeText(clash.start_date, clash.end_date, yearOf(today))} (${STATUS_LABEL[clash.status].toLowerCase()}). Change or cancel that request first.` };
  }

  const note = String(form.note ?? '').trim().slice(0, 500);
  return { value: { kind, ...span, days, note } };
}

export const spanOf = (r) => ({ start: r.start_date, end: r.end_date, halfStart: !!r.half_start, halfEnd: !!r.half_end });

/**
 * The allowance for a person and type: their own override if one is set,
 * otherwise the company default. Rows are `{ person, kind, days }`, with
 * person '' for the company default and days null for "not counted".
 */
export function allowanceFor(email, kind, rows) {
  const own = rows.find((r) => r.person === email && r.kind === kind);
  if (own) return own.days === null ? null : Number(own.days);
  const company = rows.find((r) => r.person === '' && r.kind === kind);
  if (company) return company.days === null ? null : Number(company.days);
  return DEFAULT_ALLOWANCE[kind];
}

/** Per type for one person and year: allowance, approved, waiting, and what is left after both. */
export function balances(email, year, requests, allowanceRows) {
  const out = {};
  for (const kind of KINDS) {
    const allowance = allowanceFor(email, kind, allowanceRows);
    const mine = requests.filter((r) => r.person === email && r.kind === kind && yearOf(r.start_date) === year);
    const sum = (status) => mine.filter((r) => r.status === status).reduce((n, r) => n + Number(r.days), 0);
    const used = sum('approved');
    const pending = sum('pending');
    out[kind] = { kind, allowance, used, pending, left: allowance === null ? null : allowance - used - pending };
  }
  return out;
}

/**
 * How many days over the allowance a request would take this person.
 * Over-balance requests are allowed: the approver sees how far over and decides
 * (unpaid days, borrowing from next year), because that is a company's call.
 */
export function overBy(balance, days, alreadyCounted = false) {
  if (!balance || balance.allowance === null) return 0;
  const after = balance.left - (alreadyCounted ? 0 : Number(days));
  return after < 0 ? Math.min(-after, Number(days)) : 0;
}

/**
 * Whether the viewer may approve or decline a request.
 * Another admin decides. The one exception: when the requester is the only
 * admin who has opened the app, they may decide their own, and it is marked
 * as self-approved, so a solo founder is never stuck.
 */
export function canDecide(viewer, request, otherAdmins) {
  if (request.status !== 'pending') return { ok: false, why: `This request is ${STATUS_LABEL[request.status].toLowerCase()}.` };
  if (!viewer.admin) return { ok: false, why: 'Only admins approve time off.' };
  if (request.person !== viewer.email) return { ok: true };
  if (otherAdmins === 0) return { ok: true, self: true };
  return { ok: false, why: 'This is your own request, so another admin approves it.' };
}

/** The requester may cancel while it waits, or before it starts; an admin may cancel any that is not over. */
export function canCancel(viewer, request, today) {
  if (request.status === 'declined' || request.status === 'cancelled') return false;
  if (viewer.admin) return request.end_date >= today || request.status === 'pending';
  if (request.person !== viewer.email) return false;
  return request.status === 'pending' || request.start_date > today;
}

/** A day is crowded when three or more people are out, or close to a third of a small team. */
export const crowded = (out, teamSize) => out >= 3 || (teamSize >= 4 && out / teamSize >= 0.3);

/* ---------- Email under the 5-a-day limit ---------- */

export const EMAIL_CAP = 5;
/** Kept back for the weekday digest until it has run that UTC day. */
export const DIGEST_RESERVE = 2;

/**
 * How many emails the app may send right now. Spryloom's count resets at
 * midnight UTC. On a weekday, until the digest job has run, two are held back
 * for it; at weekends, or once it has run, the whole day's allowance is free.
 */
export function emailRoom({ sentToday, digestRanToday = false, digestDue = true, forDigest = false, cap = EMAIL_CAP }) {
  const reserve = forDigest || digestRanToday || !digestDue ? 0 : DIGEST_RESERVE;
  return Math.max(0, cap - sentToday - reserve);
}

/**
 * Who gets the weekday digest when there is not room for every approver.
 * Approvers with the most urgent request first: the one starting soonest,
 * then the one waiting longest. Each approver gets at most one email.
 */
export function planDigest(queue, room) {
  const urgency = (items) => items.reduce((a, r) => (r.start_date < a ? r.start_date : a), '9999-12-31');
  const oldest = (items) => items.reduce((a, r) => Math.min(a, new Date(r.created_at).getTime()), Infinity);
  return [...queue]
    .filter((q) => q.requests.length > 0)
    .sort((a, b) => urgency(a.requests).localeCompare(urgency(b.requests)) || oldest(a.requests) - oldest(b.requests) || a.approver.localeCompare(b.approver))
    .slice(0, Math.max(0, room));
}

/** One digest email: counts and dates, never names of hosts or links (the button carries the way in). */
export function digestMessage(requests, today) {
  const n = requests.length;
  const soonest = requests.reduce((a, r) => (r.start_date < a.start_date ? r : a), requests[0]);
  const startsSoon = requests.filter((r) => r.start_date <= addDays(today, 7)).length;
  const subject = `${n} time-off ${n === 1 ? 'request is' : 'requests are'} waiting for you`;
  const parts = [`The soonest starts ${rangeText(soonest.start_date, soonest.start_date, yearOf(today))}.`];
  if (startsSoon > 1) parts.push(`${startsSoon} of them start within a week.`);
  parts.push('Approve or decline them in Time Off. Nothing is decided by email.');
  return { subject, text: parts.join(' '), button: { label: n === 1 ? 'Review request' : 'Review requests', path: n === 1 ? `/r/${requests[0].id}` : '/approvals' } };
}

/** The email for a new request, and for a decision. */
export function requestMessage(r, requesterName, year) {
  return {
    subject: `${requesterName} asked for ${daysWord(r.days)} off`,
    text: `${KIND_LABEL[r.kind]}, ${rangeText(r.start_date, r.end_date, year)}.${r.note ? ' There is a note on the request.' : ''} Approve or decline it in Time Off.`,
    button: { label: 'Review request', path: `/r/${r.id}` },
  };
}

export function decisionMessage(r, deciderName, year) {
  const verb = r.status === 'approved' ? 'approved' : 'declined';
  return {
    subject: `Your time off for ${rangeText(r.start_date, r.end_date, year)} was ${verb}`,
    text: `${deciderName} ${verb} your ${KIND_LABEL[r.kind].toLowerCase()} request for ${daysWord(r.days)}.${r.status === 'declined' && r.reason ? ' The reason is on the request.' : ''}`,
    button: { label: 'See your time off', path: `/r/${r.id}` },
  };
}
