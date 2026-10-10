import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBoard } from '../lib/rules.js';
import { describeCron, emailTimes, jobSchedules } from '../lib/schedule.js';
import { weekPage } from '../lib/views.js';

test('the shapes people write are put into words', () => {
  assert.equal(describeCron('0 14 * * 5'), 'Friday, 2 pm');
  assert.equal(describeCron('0 15 * * 5'), 'Friday, 3 pm');
  assert.equal(describeCron('30 9 * * 1'), 'Monday, 9:30 am');
  assert.equal(describeCron('0 0 * * 0'), 'Sunday, 12 am');
  assert.equal(describeCron('0 12 * * 7'), 'Sunday, 12 pm');
  assert.equal(describeCron('0 9 * * 1-5'), 'Weekdays, 9 am');
  assert.equal(describeCron('0 18 * * *'), 'Every day, 6 pm');
});

test('anything else is left for a plain label rather than guessed', () => {
  for (const e of ['*/15 * * * *', '0 9 1 * *', '0 9 * * 1,3', '0 25 * * 1', '', undefined, 'not a schedule']) {
    assert.equal(describeCron(e), undefined, String(e));
  }
});

test('the starter manifest itself reads as Friday 2 pm and Monday 9 am', () => {
  const jobs = jobSchedules(readFileSync(new URL('../spryloom.yaml', import.meta.url), 'utf8'));
  assert.equal(describeCron(jobs.get('friday-reminder').schedule), 'Friday, 2 pm');
  assert.equal(describeCron(jobs.get('monday-summary').schedule), 'Monday, 9 am');
  assert.equal(jobs.get('friday-reminder').timezone, 'America/New_York');
});

// The bug this fixes: the page said "Friday, 2 pm" after the reminder moved.
test('moving the reminder in spryloom.yaml moves it on the week page', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weekly-status-'));
  const yaml = readFileSync(new URL('../spryloom.yaml', import.meta.url), 'utf8').replace('"0 14 * * 5"', '"0 15 * * 5"');
  writeFileSync(join(dir, 'spryloom.yaml'), yaml);
  const emails = emailTimes(join(dir, 'spryloom.yaml'));
  assert.deepEqual(emails, { reminder: 'Friday, 3 pm', summary: 'Monday, 9 am' });
  const board = buildBoard({ projects: [], members: [], updates: [], week: '2026-10-05' });
  const html = weekPage({ viewer: { email: 'a@acme.com', admin: true }, board, week: '2026-10-05', today: '2026-10-07', reporting: '2026-10-05', names: new Map(), mine: { total: 0, done: 0 }, isLead: false, emails });
  assert.ok(html.includes('Friday, 3 pm'));
  assert.ok(!html.includes('Friday, 2 pm'));
});

test('no manifest means plain labels, not wrong times', () => {
  assert.deepEqual(emailTimes('/nonexistent/spryloom.yaml'), { reminder: 'Weekly reminder', summary: 'Weekly summary' });
});
