/**
 * Email someone who uses the app, through Spryloom (manifest `email: true`).
 *
 * Spryloom sends at most 5 emails a day for an app, so every email here is
 * counted, and nothing is sent once today's 5 are used: the app is the
 * record, the email is only a nudge. Spryloom refuses text with anything
 * shaped like a web address, which catches tool names such as "Notion.so"
 * too, so dots between letters become spaces ("Notion so").
 *
 * Run locally without SPRYLOOM_GATEWAY_URL and the email is printed instead.
 */
import { pool, sentToday } from './db.js';
import { DAILY_EMAIL_LIMIT } from './rules.js';

export const plain = (value, max) => String(value).replace(/(\w)\.(?=\w)/g, '$1 ').replace(/\s+/g, ' ').trim().slice(0, max);

const log = (to, subject, kind, sent) =>
  pool.query('INSERT INTO emails (to_email, subject, kind, sent) VALUES ($1, $2, $3, $4)', [to, subject, kind, sent]).catch(() => {});

export async function notify({ to, subject, text, button, dedupeKey, kind = 'note' }) {
  if (!to || to.endsWith('@example.com')) return { sent: false, reason: 'example people are never emailed' };
  const message = {
    to,
    subject: plain(subject, 100),
    text: plain(text, 500),
    ...(button ? { button: { label: plain(button.label, 30), path: button.path } } : {}),
    ...(dedupeKey ? { dedupeKey } : {}),
  };
  const url = process.env.SPRYLOOM_GATEWAY_URL;
  const key = process.env.SPRYLOOM_GATEWAY_KEY;
  if (!url || !key) {
    console.log(`\n[email, printed because SPRYLOOM_GATEWAY_URL is not set]\n  to:      ${message.to}\n  subject: ${message.subject}\n  text:    ${message.text}${message.button ? `\n  button:  ${message.button.label} -> ${message.button.path}` : ''}\n`);
    return { sent: false, reason: 'email is not set up here' };
  }
  if ((await sentToday()) >= DAILY_EMAIL_LIMIT) {
    console.error(`email to ${to} not sent: today's ${DAILY_EMAIL_LIMIT} are used`);
    return { sent: false, reason: 'daily limit' };
  }
  try {
    const answer = await fetch(`${url}/v1/notify`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (answer.status === 202) {
      await log(to, message.subject, kind, true);
      return { sent: true };
    }
    const reason = (await answer.text()).slice(0, 300);
    console.error(`email to ${to} not sent: ${answer.status} ${reason}`);
    return { sent: false, reason };
  } catch (error) {
    console.error(`email to ${to} not sent: ${error instanceof Error ? error.message : 'unknown error'}`);
    return { sent: false, reason: 'could not reach Spryloom' };
  }
}
