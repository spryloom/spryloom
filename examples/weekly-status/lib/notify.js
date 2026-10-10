/**
 * Email someone who uses the app, through Spryloom (manifest `email: true`).
 *
 * Spryloom refuses text with anything shaped like a web address, which
 * catches names such as "acme.io" too, so dots between letters become spaces.
 * A refusal or an outage never stops the job: the app is the record, the
 * email is only a nudge.
 *
 * Run on your own machine, there is no Spryloom gateway, so the email is
 * printed instead of sent.
 */

const plain = (value, max) => String(value).replace(/(\w)\.(?=\w)/g, '$1 ').replace(/\s+/g, ' ').trim().slice(0, max);

export async function notify({ to, subject, text, button, dedupeKey }) {
  const url = process.env.SPRYLOOM_GATEWAY_URL;
  const key = process.env.SPRYLOOM_GATEWAY_KEY;
  if (!to) return { sent: false, reason: 'nobody to send it to' };
  const message = {
    to,
    subject: plain(subject, 100),
    text: plain(text, 500),
    ...(button ? { button: { label: plain(button.label, 30), path: button.path } } : {}),
    ...(dedupeKey ? { dedupeKey } : {}),
  };
  if (!url || !key) {
    console.log(`\n--- email (not sent: no Spryloom gateway here) ---\nTo:      ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n${message.button ? `\n[ ${message.button.label} ] -> ${message.button.path}\n` : ''}---`);
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
    return { sent: false, reason };
  } catch (error) {
    console.error(`email to ${to} not sent: ${error instanceof Error ? error.message : 'unknown error'}`);
    return { sent: false, reason: 'could not reach Spryloom' };
  }
}
