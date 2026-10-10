// Friday afternoon reminder, run by Spryloom on the schedule in spryloom.yaml.
//
// One email per person, never one per project. Spryloom sends at most 5 a day
// for an app, so when more people are missing than that, the ones whose silence
// leaves a project with no update at all go first (see pickReminders).
import { loadWeek, pool, settingsOf } from '../lib/db.js';
import { notify } from '../lib/notify.js';
import { addWeeks, buildBoard, localDay, pickReminders, shortDay, weekOf } from '../lib/rules.js';

const settings = await settingsOf();
const today = localDay(new Date(), settings.time_zone);
const week = weekOf(today);
const data = await loadWeek(week, addWeeks(week, -1), week);
const board = buildBoard({ ...data, week });

// Example people (@example.com) can't receive mail.
const examples = new Set((await pool.query('SELECT email FROM people WHERE example')).rows.map((r) => r.email));
const candidates = board.missing.filter((m) => !examples.has(m.email));
const chosen = pickReminders(candidates);

let sent = 0;
for (const m of chosen) {
  const n = m.projects.length;
  const result = await notify({
    to: m.email,
    subject: `Your weekly check-in for the week of ${shortDay(week)}`,
    text: `${n === 1 ? 'One project is' : `${n} projects are`} waiting for your update: what moved, what's in the way, and what's next. It takes a few minutes, and your team reads it on Monday.`,
    button: { label: 'Write my check-in', path: `/checkin?week=${week}` },
    dedupeKey: `remind-${week}-${m.email}`,
  });
  if (result.sent) sent += 1;
}
console.log(`friday reminder, week of ${week}: ${candidates.length} people not in yet, ${chosen.length} chosen, ${sent} emails sent`);
await pool.end();
