// Weekday morning digest, run by Spryloom on the schedule in spryloom.yaml.
//
// Renewals, cancellations and trials ending in the next 14 days. One email per
// person, never one per tool: Spryloom allows 5 a day per app, and this job
// uses at most 3 of them so a request and its answer can still be emailed the
// same day. The most recently active admin gets the whole list first, then
// owners get their own tools, most urgent first. Example tools are never
// emailed. Everything here is also on the Overview page.
import { loadAll, pool, sentToday } from '../lib/db.js';
import { notify } from '../lib/notify.js';
import { DAILY_EMAIL_LIMIT, DIGEST_DAYS, DIGEST_LIMIT, digestEmail, planDigest, todayIso, upcoming } from '../lib/rules.js';

const today = todayIso();
const { tools } = await loadAll();
const items = upcoming(tools.filter((t) => !t.example), today, DIGEST_DAYS);
const people = (await pool.query('SELECT email, admin, example, last_seen FROM people')).rows
  .map((p) => ({ ...p, last_seen: p.last_seen.toISOString() }));
// A second run on the same day (a retry, or a manual run) skips people who already have today's.
const already = new Set((await pool.query(
  `SELECT to_email FROM emails WHERE kind = 'digest' AND sent AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
)).rows.map((r) => r.to_email));
const limit = Math.max(0, Math.min(DIGEST_LIMIT - already.size, DAILY_EMAIL_LIMIT - (await sentToday())));
const plans = planDigest({ items, people, limit: Infinity }).filter((p) => !already.has(p.to)).slice(0, limit);

let sent = 0;
for (const plan of plans) {
  const { subject, text } = digestEmail(plan);
  const result = await notify({
    to: plan.to, subject, text, kind: 'digest',
    button: { label: 'See what renews', path: '/' },
    dedupeKey: `digest-${today}-${plan.to}`,
  });
  if (result.sent) sent += 1;
}
console.log(`digest: ${items.length} renewals and trials in ${DIGEST_DAYS} days, ${plans.length} people planned, ${sent} emails sent`);
await pool.end();
