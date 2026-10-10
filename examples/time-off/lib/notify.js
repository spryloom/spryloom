/**
 * Email someone who uses the app, through Spryloom (manifest `email: true`).
 *
 * Spryloom refuses text with anything shaped like a web address, which
 * catches names such as "acme.io" too, so dots between letters become spaces.
 * A refusal or an outage never stops the action that caused the email: the
 * app is the record, the email is only a nudge.
 *
 * Run locally there is no gateway, so the email is printed instead.
 */
import { pool } from './db.js';
import { emailRoom } from './rules.js';

const plain = (value, max) => String(value).replace(/(\w)\.(?=\w)/g, '$1 ').replace(/\s+/g, ' ').trim().slice(0, max);

export async function notify({ to, subject, text, button, dedupeKey }) {
  const url = process.env.SPRYLOOM_GATEWAY_URL;
  const key = process.env.SPRYLOOM_GATEWAY_KEY;
  const message = {
    to,
    subject: plain(subject, 100),
    text: plain(text, 500),
    ...(button ? { button: { label: plain(button.label, 30), path: button.path } } : {}),
    ...(dedupeKey ? { dedupeKey } : {}),
  };
  if (!url || !key) {
    console.log(`[email, not sent: no gateway here] to ${to}\n  subject: ${message.subject}\n  ${message.text}${button ? `\n  [${message.button.label}] -> ${button.path}` : ''}`);
    return { sent: true, printed: true };
  }
  try {
    const answer = await fetch(`${url}/v1/notify`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (answer.status === 202) return { sent: true };
    const reason = (await answer.text()).slice(0, 300);
    console.error(`email to ${to} not sent: ${answer.status} ${reason}`);
    return { sent: false, full: answer.status === 429, reason };
  } catch (error) {
    console.error(`email to ${to} not sent: ${error instanceof Error ? error.message : 'unknown error'}`);
    return { sent: false, reason: 'could not reach Spryloom' };
  }
}

/**
 * Emails sent today (UTC, as Spryloom counts), whether the digest job has run
 * today, and whether one is due at all (it runs on weekdays).
 */
export async function emailDay() {
  const { rows: [r] } = await pool.query(
    `SELECT count(*) FILTER (WHERE outcome = 'sent')::int AS sent,
            count(*) FILTER (WHERE outcome = 'held')::int AS held,
            coalesce(bool_or(outcome = 'full'), false) AS full,
            (SELECT digest_day = (now() AT TIME ZONE 'UTC')::date FROM settings WHERE id = 1) AS ran,
            extract(isodow FROM (now() AT TIME ZONE 'UTC'))::int AS dow
     FROM emails WHERE day = (now() AT TIME ZONE 'UTC')::date`,
  );
  return { sentToday: r.full ? 99 : r.sent, sent: r.sent, held: r.held, digestRanToday: !!r.ran, digestDue: r.dow <= 5 };
}

/**
 * Send one email if today's budget allows, and log what happened.
 * Example people (example.com) are never emailed: they are not real.
 */
export async function sendCounted(purpose, message, { forDigest = false } = {}) {
  if (/@example\.com$/i.test(message.to)) return { sent: false, reason: 'example person' };
  const day = await emailDay();
  if (emailRoom({ ...day, forDigest }) <= 0) {
    await pool.query('INSERT INTO emails (recipient, subject, purpose, outcome) VALUES ($1,$2,$3,$4)', [message.to, message.subject, purpose, 'held']);
    console.log(`email to ${message.to} held: today's allowance is used. It is on their screen in the app.`);
    return { sent: false, reason: 'held' };
  }
  const result = await notify(message);
  const outcome = result.sent ? 'sent' : result.full ? 'full' : 'failed';
  await pool.query('INSERT INTO emails (recipient, subject, purpose, outcome) VALUES ($1,$2,$3,$4)', [message.to, message.subject, purpose, outcome]);
  return result;
}
