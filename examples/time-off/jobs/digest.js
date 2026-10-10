// Weekday 9:00 digest for approvers, run by Spryloom on the schedule in spryloom.yaml.
//
// One email per approver, never one per request: Spryloom allows 5 emails a
// day per app. When there are more approvers than emails left, the ones with
// the most urgent request (starting soonest, then waiting longest) go first;
// everyone else sees the same list on their Approvals page.
import { pool, settingsOf } from '../lib/db.js';
import { todayIn } from '../lib/days.js';
import { emailDay, sendCounted } from '../lib/notify.js';
import { canDecide, digestMessage, emailRoom, planDigest } from '../lib/rules.js';

const settings = await settingsOf();
const today = todayIn(settings.timezone);
const utcDay = new Date().toISOString().slice(0, 10);

const admins = (await pool.query('SELECT email FROM people WHERE admin AND NOT example ORDER BY email')).rows;
const pending = (await pool.query(`SELECT * FROM requests WHERE status = 'pending' ORDER BY start_date, created_at`)).rows;

// What each approver may decide: everyone's requests but their own, unless they are the only admin.
const queue = admins.map(({ email }) => ({
  approver: email,
  requests: pending.filter((r) => canDecide({ email, admin: true }, r, admins.length - 1).ok),
}));

const room = emailRoom({ ...(await emailDay()), forDigest: true });
const chosen = planDigest(queue, room);
let sent = 0;
for (const { approver, requests } of chosen) {
  const result = await sendCounted('digest', { to: approver, ...digestMessage(requests, today), dedupeKey: `digest-${utcDay}-${approver}` }, { forDigest: true });
  if (result.sent) sent += 1;
}
await pool.query('UPDATE settings SET digest_day = (now() AT TIME ZONE \'UTC\')::date WHERE id = 1');

const waiting = queue.filter((q) => q.requests.length).length;
console.log(`digest: ${pending.length} pending, ${waiting} approvers with something waiting, room for ${room}, ${sent} emails sent`);
await pool.end();
