// Monday morning summary, run by Spryloom on the schedule in spryloom.yaml.
//
// Admins get the week that just ended, as counts with a button to the week
// page. Spryloom sends at most 5 emails a day for an app: the summary goes to
// admins first, and whatever is left is a last reminder to people still missing.
import { loadWeek, pool, settingsOf } from '../lib/db.js';
import { notify } from '../lib/notify.js';
import { addWeeks, buildBoard, localDay, planMonday, shortDay, summarySubject, summaryText, weekOf } from '../lib/rules.js';

const settings = await settingsOf();
const today = localDay(new Date(), settings.time_zone);
const week = addWeeks(weekOf(today), -1);
const data = await loadWeek(week, addWeeks(week, -1), week);
const board = buildBoard({ ...data, week });

// Admins are recorded as they open the app; a job gets no request headers.
// Those seen most recently come first, in case there are more than 5.
const admins = (await pool.query('SELECT email FROM people WHERE admin AND NOT example ORDER BY last_seen DESC NULLS LAST, email')).rows.map((r) => r.email);
const examples = new Set((await pool.query('SELECT email FROM people WHERE example')).rows.map((r) => r.email));
const plan = planMonday({ admins, missing: board.missing.filter((m) => !examples.has(m.email)) });

let sent = 0;
for (const to of plan.summary) {
  const result = await notify({
    to,
    subject: summarySubject(board.counts, week),
    text: summaryText(board.counts, week),
    button: { label: 'Open the week', path: `/?week=${week}` },
    dedupeKey: `summary-${week}-${to}`,
  });
  if (result.sent) sent += 1;
}
for (const to of plan.lastCall) {
  const result = await notify({
    to,
    subject: `Last call: your check-in for the week of ${shortDay(week)}`,
    text: "The week's summary has gone out without your update. Add it now so the record is complete; you can still change it this week.",
    button: { label: 'Write my check-in', path: `/checkin?week=${week}` },
    dedupeKey: `lastcall-${week}-${to}`,
  });
  if (result.sent) sent += 1;
}
console.log(`monday summary, week of ${week}: ${plan.summary.length} admins, ${plan.lastCall.length} last calls, ${sent} emails sent`);
await pool.end();
