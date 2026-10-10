/**
 * Dates as 'YYYY-MM-DD' strings, stepped in UTC so the server's own timezone
 * never moves a day. Working days are weekdays that are not company holidays.
 */

const at = (iso) => new Date(`${iso}T00:00:00Z`);
const iso = (date) => date.toISOString().slice(0, 10);

export const isIsoDate = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(at(value).getTime()) && iso(at(value)) === value;

export const addDays = (day, n) => { const d = at(day); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const daysBetween = (from, to) => Math.round((at(to) - at(from)) / 86_400_000);
export const weekday = (day) => at(day).getUTCDay(); // 0 Sunday … 6 Saturday
export const isWeekend = (day) => weekday(day) === 0 || weekday(day) === 6;
export const isWorkingDay = (day, holidays = new Set()) => !isWeekend(day) && !holidays.has(day);
export const yearOf = (day) => Number(day.slice(0, 4));

/** Monday of the week the day is in. */
export const startOfWeek = (day) => addDays(day, -((weekday(day) + 6) % 7));
export const startOfMonth = (day) => `${day.slice(0, 7)}-01`;
export const endOfMonth = (day) => { const d = at(startOfMonth(day)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return iso(d); };
export const addMonths = (day, n) => { const d = at(startOfMonth(day)); d.setUTCMonth(d.getUTCMonth() + n); return iso(d); };

export function eachDay(start, end) {
  const out = [];
  for (let d = start; d <= end && out.length < 800; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The working day `n` working days after `day` (n = 0 gives `day` itself if it is one). */
export function workingDayFrom(day, n, holidays = new Set()) {
  let d = day;
  while (!isWorkingDay(d, holidays)) d = addDays(d, 1);
  for (let i = 0; i < n; i += 1) {
    d = addDays(d, 1);
    while (!isWorkingDay(d, holidays)) d = addDays(d, 1);
  }
  return d;
}

/**
 * Which halves of `day` a stretch of time off covers.
 * `halfStart`: the first day is the afternoon only. `halfEnd`: the last day is
 * the morning only. On a single day exactly one of them may be set.
 */
export function coverage({ start, end, halfStart = false, halfEnd = false }, day) {
  if (day < start || day > end) return { am: false, pm: false };
  return { am: !(day === start && halfStart), pm: !(day === end && halfEnd) };
}

/** Working days taken, counting a half day as 0.5. */
export function workingDays(span, holidays = new Set()) {
  let total = 0;
  for (const day of eachDay(span.start, span.end)) {
    if (!isWorkingDay(day, holidays)) continue;
    const { am, pm } = coverage(span, day);
    total += (am ? 0.5 : 0) + (pm ? 0.5 : 0);
  }
  return total;
}

/** Whether two stretches of time off share any half day. */
export function overlaps(a, b) {
  const from = a.start > b.start ? a.start : b.start;
  const to = a.end < b.end ? a.end : b.end;
  if (from > to) return false;
  return eachDay(from, to).some((day) => {
    const x = coverage(a, day);
    const y = coverage(b, day);
    return (x.am && y.am) || (x.pm && y.pm);
  });
}

/** Today in a timezone, as 'YYYY-MM-DD'. */
export function todayIn(timeZone, now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return iso(now);
  }
}

export const isTimeZone = (zone) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; }
};

const fmt = (day, options) => at(day).toLocaleDateString('en-US', { timeZone: 'UTC', ...options });
export const shortDate = (day) => fmt(day, { month: 'short', day: 'numeric' });
export const longDate = (day) => fmt(day, { weekday: 'short', month: 'short', day: 'numeric' });
export const fullDate = (day) => fmt(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export const monthName = (day) => fmt(day, { month: 'long', year: 'numeric' });
export const dayName = (day) => fmt(day, { weekday: 'short' });

/** "Oct 12", "Oct 12 – 16", "Oct 30 – Nov 3", with the year when it is not `thisYear`. */
export function rangeText(start, end, thisYear) {
  const year = yearOf(start) !== thisYear ? `, ${yearOf(start)}` : '';
  if (start === end) return `${shortDate(start)}${year}`;
  if (start.slice(0, 7) === end.slice(0, 7)) return `${shortDate(start)} – ${Number(end.slice(8))}${year}`;
  return `${shortDate(start)} – ${shortDate(end)}${year}`;
}

/** 1, 1.5, 0.5 — never 1.0. */
export const dayCount = (n) => {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
};
export const daysWord = (n) => `${dayCount(n)} ${Number(n) === 1 ? 'day' : 'days'}`;
