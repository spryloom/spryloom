/**
 * Who is out on which day, worked out from the requests. No database and no
 * HTML here, so the calendar's rules can be tested on their own.
 */
import { coverage, eachDay, isWorkingDay } from './days.js';
import { spanOf } from './rules.js';

const SHOWN = new Set(['approved', 'pending']);

/**
 * For each person, one cell per day: null when they are in, otherwise which
 * request covers it, whether it is still waiting, which halves are off, and
 * whether this is the start or end of a stretch (for drawing bars). Weekends
 * and holidays inside a stretch are a `bridge`, so the bar reads as one trip.
 */
export function personCells(requests, days, holidays = new Set()) {
  const rows = new Map();
  for (const r of requests) {
    if (!SHOWN.has(r.status)) continue;
    if (r.end_date < days[0] || r.start_date > days[days.length - 1]) continue;
    const span = spanOf(r);
    const cells = rows.get(r.person) ?? days.map(() => null);
    days.forEach((day, i) => {
      const { am, pm } = coverage(span, day);
      if (!am && !pm) return;
      if (cells[i] && !cells[i].bridge) return;
      cells[i] = {
        id: r.id,
        kind: r.kind,
        pending: r.status === 'pending',
        am,
        pm,
        bridge: !isWorkingDay(day, holidays),
        first: day === r.start_date || i === 0,
        last: day === r.end_date || i === days.length - 1,
      };
    });
    rows.set(r.person, cells);
  }
  for (const cells of rows.values()) {
    cells.forEach((c, i) => {
      if (!c || c.bridge) return;
      if (cells[i - 1]?.bridge) c.first = true;
      if (cells[i + 1]?.bridge) c.last = true;
    });
  }
  return rows;
}

/**
 * How many people are out each working day. A half day counts as a person out.
 * `approved` is the firm count; `pending` is how many more it would be if
 * every waiting request were approved.
 */
export function outByDay(requests, days, holidays = new Set()) {
  return days.map((day) => {
    if (!isWorkingDay(day, holidays)) return { day, approved: 0, pending: 0, working: false };
    const firm = new Set();
    const maybe = new Set();
    for (const r of requests) {
      if (!SHOWN.has(r.status)) continue;
      const { am, pm } = coverage(spanOf(r), day);
      if (!am && !pm) continue;
      (r.status === 'approved' ? firm : maybe).add(r.person);
    }
    for (const p of firm) maybe.delete(p);
    return { day, approved: firm.size, pending: maybe.size, working: true };
  });
}

/** Everyone out on any of `days`, per day, for the week view and the home strip. */
export function whoIsOut(requests, days, holidays = new Set()) {
  return days.map((day) => ({
    day,
    working: isWorkingDay(day, holidays),
    out: requests
      .filter((r) => SHOWN.has(r.status))
      .map((r) => ({ r, part: coverage(spanOf(r), day) }))
      .filter(({ part }) => part.am || part.pm)
      .sort((a, b) => Number(a.r.status === 'pending') - Number(b.r.status === 'pending') || a.r.person.localeCompare(b.r.person)),
  }));
}

/** Other people's approved and waiting time off that shares a day with `request`. */
export function alsoOut(request, requests) {
  const days = eachDay(request.start_date, request.end_date);
  return requests.filter((r) => r.id !== request.id && r.person !== request.person && SHOWN.has(r.status)
    && r.start_date <= request.end_date && r.end_date >= request.start_date
    && days.some((d) => { const c = coverage(spanOf(r), d); return c.am || c.pm; }));
}
