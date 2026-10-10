import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMAIL_CAP, allowanceFor, balances, canCancel, canDecide, checkRequest, digestMessage, emailRoom, overBy, planDigest, viewerOf,
} from '../lib/rules.js';

const today = '2026-10-09'; // a Friday
const admin = { email: 'lee@acme.com', admin: true };
const member = { email: 'sam@acme.com', admin: false };
const req = (over = {}) => ({ id: 1, person: member.email, kind: 'vacation', start_date: '2026-10-12', end_date: '2026-10-16', half_start: false, half_end: false, days: 5, status: 'pending', ...over });
const form = (over = {}) => ({ kind: 'vacation', start: '2026-10-12', end: '2026-10-16', first: 'full', last: 'full', note: '', ...over });

test('identity comes only from the Spryloom headers', () => {
  assert.deepEqual(viewerOf({ 'x-spryloom-email': ' Sam@Acme.com ', 'x-spryloom-role': 'admin' }), { email: 'sam@acme.com', admin: true });
  assert.deepEqual(viewerOf({ 'x-spryloom-email': 'sam@acme.com', 'x-spryloom-role': 'owner' }), { email: 'sam@acme.com', admin: false });
  assert.equal(viewerOf({}), undefined);
});

test('a request is counted in working days, with half days', () => {
  assert.equal(checkRequest(form(), { today }).value.days, 5);
  assert.equal(checkRequest(form({ end: '', first: 'pm' }), { today }).value.days, 0.5);
  const v = checkRequest(form({ first: 'pm', last: 'am' }), { today, holidays: new Set(['2026-10-14']) }).value;
  assert.equal(v.days, 3);
  assert.ok(v.halfStart && v.halfEnd);
});

test('requests that make no sense are refused in plain words', () => {
  assert.match(checkRequest(form({ end: '2026-10-11' }), { today }).error, /last day is before the first/);
  assert.match(checkRequest(form({ start: '2026-10-17', end: '2026-10-18' }), { today }).error, /weekends or company holidays/);
  assert.match(checkRequest(form({ start: '2026-12-28', end: '2027-01-04' }), { today }).error, /two requests/);
  assert.match(checkRequest(form({ kind: 'holiday' }), { today }).error, /what kind/);
  assert.match(checkRequest(form({ first: 'am' }), { today }).error, /afternoon off, not the morning/);
});

test('vacation cannot start in the past; sick days can be recorded up to 30 days back', () => {
  assert.match(checkRequest(form({ start: '2026-10-08', end: '2026-10-08' }), { today }).error, /can't start in the past/);
  assert.ok(checkRequest(form({ kind: 'sick', start: '2026-10-08', end: '2026-10-08' }), { today }).value);
  assert.match(checkRequest(form({ kind: 'sick', start: '2026-08-03', end: '2026-08-03' }), { today }).error, /30 days back/);
});

test('a request may not overlap your own waiting or approved time off', () => {
  const mine = [req({ status: 'approved', start_date: '2026-10-15', end_date: '2026-10-15' })];
  assert.match(checkRequest(form(), { today, mine }).error, /already have time off on Oct 15/);
  assert.ok(checkRequest(form(), { today, mine: [{ ...mine[0], status: 'declined' }] }).value);
  // Morning off on the 15th, then a request starting that afternoon, is fine.
  const morning = [req({ status: 'approved', start_date: '2026-10-15', end_date: '2026-10-15', half_end: true })];
  assert.ok(checkRequest(form({ start: '2026-10-15', end: '2026-10-16', first: 'pm' }), { today, mine: morning }).value);
});

test('allowances: a person override beats the company default; empty means not counted', () => {
  const rows = [{ person: '', kind: 'vacation', days: '20' }, { person: member.email, kind: 'vacation', days: '8' }, { person: '', kind: 'other', days: null }];
  assert.equal(allowanceFor(member.email, 'vacation', rows), 8);
  assert.equal(allowanceFor(admin.email, 'vacation', rows), 20);
  assert.equal(allowanceFor(admin.email, 'other', rows), null);
  assert.equal(allowanceFor(admin.email, 'personal', []), 3);
});

test('balances count approved and waiting days in the year the time off starts', () => {
  const requests = [
    req({ status: 'approved', days: '5' }),
    req({ id: 2, status: 'pending', days: '2.5', start_date: '2026-11-02', end_date: '2026-11-04' }),
    req({ id: 3, status: 'declined', days: '3' }),
    req({ id: 4, status: 'approved', days: '4', start_date: '2025-12-01', end_date: '2025-12-04' }),
    req({ id: 5, status: 'approved', days: '1', kind: 'other' }),
  ];
  const b = balances(member.email, 2026, requests, [{ person: '', kind: 'vacation', days: '20' }, { person: '', kind: 'other', days: null }]);
  assert.deepEqual(b.vacation, { kind: 'vacation', allowance: 20, used: 5, pending: 2.5, left: 12.5 });
  assert.equal(b.other.left, null);
  assert.equal(b.other.used, 1);
});

test('going over the allowance is allowed and measured, not refused', () => {
  const b = { allowance: 8, used: 0, pending: 10, left: -2 };
  assert.equal(overBy(b, 10, true), 2);
  assert.equal(overBy({ allowance: 8, used: 5, pending: 0, left: 3 }, 5), 2);
  assert.equal(overBy({ allowance: 8, used: 0, pending: 0, left: 8 }, 5), 0);
  assert.equal(overBy({ allowance: null }, 50), 0);
});

test('an admin decides other people\'s requests, never their own unless they are the only admin', () => {
  assert.ok(canDecide(admin, req(), 0).ok);
  assert.equal(canDecide(member, req({ person: 'jo@acme.com' }), 1).ok, false);
  const own = req({ person: admin.email });
  assert.deepEqual(canDecide(admin, own, 1), { ok: false, why: 'This is your own request, so another admin approves it.' });
  assert.deepEqual(canDecide(admin, own, 0), { ok: true, self: true });
  assert.equal(canDecide(admin, req({ status: 'approved' }), 1).ok, false);
});

test('cancelling: your own while it waits or before it starts; admins any that is not over', () => {
  assert.ok(canCancel(member, req(), today));
  assert.ok(canCancel(member, req({ status: 'approved' }), today));
  assert.ok(!canCancel(member, req({ status: 'approved', start_date: '2026-10-05', end_date: '2026-10-12' }), today));
  assert.ok(canCancel(admin, req({ status: 'approved', start_date: '2026-10-05', end_date: '2026-10-12' }), today));
  assert.ok(!canCancel({ email: 'jo@acme.com', admin: false }, req(), today));
  assert.ok(!canCancel(admin, req({ status: 'declined' }), today));
});

test('email stays inside 5 a day, keeping two for the weekday digest until it has run', () => {
  assert.equal(EMAIL_CAP, 5);
  assert.equal(emailRoom({ sentToday: 0 }), 3);
  assert.equal(emailRoom({ sentToday: 3 }), 0);
  assert.equal(emailRoom({ sentToday: 3, forDigest: true }), 2);
  assert.equal(emailRoom({ sentToday: 3, digestRanToday: true }), 2);
  assert.equal(emailRoom({ sentToday: 1, digestDue: false }), 4);
  assert.equal(emailRoom({ sentToday: 7, forDigest: true }), 0);
});

test('the digest sends one email per approver, most urgent first, never more than there is room for', () => {
  const r = (id, start, ageDays) => ({ id, start_date: start, created_at: new Date(Date.now() - ageDays * 86_400_000) });
  const queue = [
    { approver: 'a@acme.com', requests: [r(1, '2026-11-20', 1)] },
    { approver: 'b@acme.com', requests: [r(2, '2026-10-13', 1), r(3, '2026-12-01', 4)] },
    { approver: 'c@acme.com', requests: [] },
    { approver: 'd@acme.com', requests: [r(4, '2026-10-13', 6)] },
    ...['e', 'f', 'g', 'h'].map((x, i) => ({ approver: `${x}@acme.com`, requests: [r(10 + i, '2027-01-10', 0)] })),
  ];
  const plan = planDigest(queue, 5);
  assert.equal(plan.length, 5);
  assert.deepEqual(plan.slice(0, 3).map((p) => p.approver), ['d@acme.com', 'b@acme.com', 'a@acme.com']);
  assert.ok(!plan.some((p) => p.approver === 'c@acme.com'));
  assert.equal(planDigest(queue, 0).length, 0);
  const message = digestMessage(queue[1].requests, today);
  assert.equal(message.subject, '2 time-off requests are waiting for you');
  assert.equal(message.button.path, '/approvals');
  assert.ok(message.text.length <= 500);
  assert.doesNotMatch(message.text, /https?:|www|\w\.\w{2,}/);
});
