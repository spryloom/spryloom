import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMAILS_PER_DAY, addWeeks, buildBoard, canHandle, canWrite, checkUpdate, isOpen, isWeek, localDay, nameOf, parseEmails,
  pickReminders, planMonday, reportingWeek, rollup, summarySubject, summaryText, viewerOf, weekNumber, weekOf, weekRange,
} from '../lib/rules.js';

const admin = { email: 'lee@acme.com', admin: true };
const member = { email: 'sam@acme.com', admin: false };

test('identity comes only from the Spryloom headers', () => {
  assert.deepEqual(viewerOf({ 'x-spryloom-email': ' Sam@Acme.com ', 'x-spryloom-role': 'admin' }), { email: 'sam@acme.com', admin: true });
  assert.deepEqual(viewerOf({ 'x-spryloom-email': 'sam@acme.com', 'x-spryloom-role': 'owner' }), { email: 'sam@acme.com', admin: false });
  assert.equal(viewerOf({}), undefined);
  assert.equal(viewerOf({ 'x-spryloom-email': '   ' }), undefined);
});

test('a week is named by its Monday, across month and year ends', () => {
  assert.equal(weekOf('2026-10-05'), '2026-10-05'); // Monday
  assert.equal(weekOf('2026-10-11'), '2026-10-05'); // Sunday
  assert.equal(weekOf('2026-10-12'), '2026-10-12');
  assert.equal(weekOf('2027-01-01'), '2026-12-28'); // Friday, week starts the year before
  assert.equal(addWeeks('2026-12-28', 1), '2027-01-04');
  assert.equal(weekRange('2026-09-28'), 'Sep 28 – Oct 4');
  assert.equal(weekRange('2026-10-05'), 'Oct 5 – 11');
  assert.equal(weekNumber('2026-10-05'), 41);
  assert.equal(weekNumber('2026-12-28'), 53);
  assert.ok(isWeek('2026-10-05'));
  assert.ok(!isWeek('2026-10-06'));
  assert.ok(!isWeek('2026-13-01'));
  assert.ok(!isWeek("2026-10-05' OR 1=1"));
});

test('today is the date in the team time zone, not on the server', () => {
  const sundayNightInNewYork = new Date('2026-10-12T02:30:00Z'); // 22:30 Sunday Oct 11 in New York
  assert.equal(localDay(sundayNightInNewYork, 'America/New_York'), '2026-10-11');
  assert.equal(localDay(sundayNightInNewYork, 'UTC'), '2026-10-12');
  assert.equal(localDay(sundayNightInNewYork, 'Not/AZone'), '2026-10-12');
  assert.equal(weekOf(localDay(sundayNightInNewYork, 'America/New_York')), '2026-10-05');
});

test('Monday to Wednesday report on the week just finished; Thursday on, the current one', () => {
  assert.equal(reportingWeek('2026-10-12'), '2026-10-05'); // Monday
  assert.equal(reportingWeek('2026-10-14'), '2026-10-05'); // Wednesday
  assert.equal(reportingWeek('2026-10-15'), '2026-10-12'); // Thursday
  assert.equal(reportingWeek('2026-10-18'), '2026-10-12'); // Sunday
});

test('only this week and last week can be written', () => {
  const today = '2026-10-13';
  assert.ok(isOpen('2026-10-12', today));
  assert.ok(isOpen('2026-10-05', today));
  assert.ok(!isOpen('2026-09-28', today));
  assert.ok(!isOpen('2026-10-19', today));
  assert.ok(canWrite(member, { memberOf: [member.email], week: '2026-10-05', today }));
  assert.ok(!canWrite(member, { memberOf: ['someone@acme.com'], week: '2026-10-05', today }), 'not on the project');
  assert.ok(!canWrite(admin, { memberOf: [member.email], week: '2026-10-05', today }), 'admins do not write for others');
  assert.ok(!canWrite(member, { memberOf: [member.email], week: '2026-09-28', today }), 'closed week');
});

test('admins and the project lead mark blockers handled; others cannot', () => {
  assert.ok(canHandle(admin, { lead: 'x@acme.com' }));
  assert.ok(canHandle(member, { lead: member.email }));
  assert.ok(!canHandle(member, { lead: 'x@acme.com' }));
  assert.ok(!canHandle(member, { lead: null }));
});

test('a project reports its worst status, and none when nobody wrote', () => {
  assert.equal(rollup([]), 'none');
  assert.equal(rollup(['on_track', 'on_track']), 'on_track');
  assert.equal(rollup(['on_track', 'at_risk']), 'at_risk');
  assert.equal(rollup(['at_risk', 'blocked', 'on_track']), 'blocked');
  assert.equal(rollup(['bogus']), 'none');
});

test('a check-in needs a status and a reason, and Blocked needs what is blocking', () => {
  assert.deepEqual(checkUpdate({}), { skip: true });
  assert.deepEqual(checkUpdate({ status: '', moved: '  ' }), { skip: true });
  assert.match(checkUpdate({ moved: 'Shipped it' }).error, /Choose On track/);
  assert.match(checkUpdate({ status: 'on_track' }).error, /what moved/);
  assert.match(checkUpdate({ status: 'blocked', moved: 'Tried' }).error, /blocking/);
  assert.match(checkUpdate({ status: 'sideways', moved: 'x' }).error, /Choose/);
  const ok = checkUpdate({ status: 'blocked', moved: ' a ', blockers: 'Legal\r\nsign-off', next: '' });
  assert.deepEqual(ok, { update: { status: 'blocked', moved: 'a', blockers: 'Legal\nsign-off', next: '' } });
  assert.equal(checkUpdate({ status: 'on_track', moved: 'x'.repeat(5000) }).update.moved.length, 2000);
});

const W = '2026-10-05';
const P = '2026-09-28';
const projects = [
  { id: 1, name: 'Checkout', lead: 'maya@acme.com', created_at: '2026-08-01T00:00:00Z' },
  { id: 2, name: 'Mobile', lead: 'jo@acme.com', created_at: '2026-08-01T00:00:00Z' },
  { id: 3, name: 'Audit', lead: 'nora@acme.com', created_at: '2026-08-01T00:00:00Z' },
  { id: 4, name: 'Brand new', lead: 'nora@acme.com', created_at: '2026-10-20T00:00:00Z' },
];
const members = [
  { project_id: 1, email: 'maya@acme.com' }, { project_id: 1, email: 'sam@acme.com' },
  { project_id: 2, email: 'jo@acme.com' }, { project_id: 2, email: 'sam@acme.com' },
  { project_id: 3, email: 'nora@acme.com' }, { project_id: 3, email: 'lena@acme.com' },
  { project_id: 4, email: 'nora@acme.com' },
];
const updates = [
  { id: 10, project_id: 1, email: 'maya@acme.com', status: 'on_track', blockers: '' },
  { id: 11, project_id: 1, email: 'sam@acme.com', status: 'at_risk', blockers: 'Waiting on sandbox' },
  { id: 12, project_id: 2, email: 'jo@acme.com', status: 'blocked', blockers: 'Legal' },
  { id: 13, project_id: 2, email: 'old@acme.com', status: 'on_track', blockers: '', handled_at: null },
];
const previous = [
  { project_id: 2, email: 'jo@acme.com', status: 'blocked', blockers: 'Legal' },
  { project_id: 1, email: 'sam@acme.com', status: 'on_track', blockers: '' },
  { project_id: 3, email: 'nora@acme.com', status: 'on_track', blockers: '' },
];

test('the week board puts blocked projects first and counts who is in', () => {
  const board = buildBoard({ projects, members, updates, previous, week: W });
  assert.deepEqual(board.projects.map((p) => [p.name, p.status]), [['Mobile', 'blocked'], ['Checkout', 'at_risk'], ['Audit', 'none']]);
  assert.equal(board.projects.find((p) => p.name === 'Mobile').inCount, 1, 'an update from someone no longer on it is shown but not counted');
  assert.deepEqual(board.counts, { expected: 6, received: 3, missingPeople: 3, blocked: 1, at_risk: 1, on_track: 0, silent: 1, openBlockers: 2 });
});

test('a project created after the week is not waiting on anyone', () => {
  const board = buildBoard({ projects, members, updates, previous, week: W });
  assert.ok(!board.projects.some((p) => p.name === 'Brand new'));
  assert.ok(!board.missing.some((m) => m.projects.some((p) => p.name === 'Brand new')));
});

test('someone added after the week is not counted as missing for it', () => {
  const late = [...members, { project_id: 1, email: 'new@acme.com', added_at: new Date('2026-10-14T10:00:00Z') }];
  assert.ok(!buildBoard({ projects, members: late, updates, previous, week: W }).missing.some((m) => m.email === 'new@acme.com'));
  assert.ok(buildBoard({ projects, members: late, updates: [], previous, week: '2026-10-12' }).missing.some((m) => m.email === 'new@acme.com'));
});

test('missing people list each project, flag silent projects and repeat misses', () => {
  const { missing } = buildBoard({ projects, members, updates, previous, week: W });
  const by = Object.fromEntries(missing.map((m) => [m.email, m]));
  assert.deepEqual(Object.keys(by).sort(), ['lena@acme.com', 'nora@acme.com', 'sam@acme.com']);
  assert.deepEqual(by['sam@acme.com'].projects.map((p) => p.name), ['Mobile']);
  assert.equal(by['nora@acme.com'].projects[0].dark, true, 'nobody on Audit wrote');
  assert.equal(by['nora@acme.com'].missedLastWeek, false);
  assert.equal(by['lena@acme.com'].missedLastWeek, true);
});

test('blockers: open before handled, blocked before at risk, running ones flagged', () => {
  const withHandled = [...updates, { id: 14, project_id: 3, email: 'nora@acme.com', status: 'blocked', blockers: 'Auditor', handled_at: '2026-10-08' }];
  const { blockers } = buildBoard({ projects, members, updates: withHandled, previous, week: W });
  assert.deepEqual(blockers.map((b) => b.id), [12, 11, 14]);
  assert.equal(blockers[0].running, true, 'Jo was blocked the week before too');
  assert.equal(blockers[1].running, false);
});

test('reminders under the cap go to whoever leaves a project silent first', () => {
  const missing = [
    { email: 'a@x.com', projects: [{ dark: false }, { dark: false }, { dark: false }], missedLastWeek: false },
    { email: 'b@x.com', projects: [{ dark: true }], missedLastWeek: false },
    { email: 'c@x.com', projects: [{ dark: false }], missedLastWeek: true },
    { email: 'd@x.com', projects: [{ dark: false }], missedLastWeek: false },
    { email: 'e@x.com', projects: [{ dark: false }, { dark: false }], missedLastWeek: false },
    { email: 'f@x.com', projects: [{ dark: false }], missedLastWeek: false },
    { email: 'g@x.com', projects: [{ dark: true }, { dark: true }], missedLastWeek: false },
  ];
  const picked = pickReminders(missing).map((m) => m.email);
  assert.equal(picked.length, EMAILS_PER_DAY);
  assert.deepEqual(picked, ['g@x.com', 'b@x.com', 'a@x.com', 'e@x.com', 'c@x.com']);
  assert.deepEqual(pickReminders(missing, 0), []);
});

test("Monday's summary goes to admins first; spare emails become last calls", () => {
  const missing = [
    { email: 'm1@x.com', projects: [{ dark: true }], missedLastWeek: false },
    { email: 'm2@x.com', projects: [{ dark: false }], missedLastWeek: false },
    { email: 'm3@x.com', projects: [{ dark: false }], missedLastWeek: true },
    { email: 'm4@x.com', projects: [{ dark: false }], missedLastWeek: false },
  ];
  assert.deepEqual(planMonday({ admins: ['pm@x.com'], missing }), { summary: ['pm@x.com'], lastCall: ['m1@x.com', 'm3@x.com', 'm2@x.com', 'm4@x.com'] });
  const two = planMonday({ admins: ['pm@x.com', 'lead@x.com'], missing });
  assert.equal(two.summary.length + two.lastCall.length, 5);
  assert.deepEqual(two.lastCall, ['m1@x.com', 'm3@x.com', 'm2@x.com']);
  const many = planMonday({ admins: ['1@x', '2@x', '3@x', '4@x', '5@x', '6@x'], missing });
  assert.deepEqual(many, { summary: ['1@x', '2@x', '3@x', '4@x', '5@x'], lastCall: [] });
  assert.deepEqual(planMonday({ admins: ['pm@x.com'], missing: [{ email: 'pm@x.com', projects: [{}] }] }).lastCall, [], 'an admin is never emailed twice');
});

test('the summary email carries counts only, within the limits', () => {
  const board = buildBoard({ projects, members, updates, previous, week: W });
  const text = summaryText(board.counts, W);
  const subject = summarySubject(board.counts, W);
  assert.equal(text, 'Week of Oct 5: 3 of 6 updates in. 1 project blocked, 1 project at risk, 1 project with no update. 2 blockers or asks for help waiting. Still to check in: 3 people.');
  assert.equal(subject, 'Weekly status, week of Oct 5: 1 blocked, 3/6 in');
  assert.ok(text.length <= 500 && subject.length <= 100);
  assert.ok(!/[a-z]\.[a-z]/i.test(text), 'nothing shaped like a web address');
  assert.ok(!text.includes('Legal') && !text.includes('sandbox'), 'nothing anyone typed');
  const calm = summaryText({ expected: 4, received: 4, missingPeople: 0, blocked: 0, at_risk: 0, on_track: 2, silent: 0, openBlockers: 0 }, P);
  assert.equal(calm, 'Week of Sep 28: 4 of 4 updates in. 2 on track. Everyone checked in.');
});

test('names and pasted address lists', () => {
  assert.equal(nameOf('maya.chen@acme.com'), 'Maya Chen');
  assert.equal(nameOf('maya.chen@acme.com', 'Maya C.'), 'Maya C.');
  assert.equal(nameOf('j_doe-smith@acme.com'), 'J Doe Smith');
  assert.deepEqual(parseEmails('Maya@Acme.com\n diego@acme.com, maya@acme.com; <tom@acme.com>\nnot-an-email'), { good: ['maya@acme.com', 'diego@acme.com', 'tom@acme.com'], bad: ['not-an-email'] });
  assert.deepEqual(parseEmails(''), { good: [], bad: [] });
});
