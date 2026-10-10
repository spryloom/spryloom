import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleData } from '../lib/examples.js';
import {
  DIGEST_LIMIT, addMonths, attention, canEditRegister, canWithdraw, decisionBlock, digestEmail,
  nextRenewal, planDigest, safeWebsite, upcoming, viewerOf,
} from '../lib/rules.js';

const admin = { email: 'lee@acme.com', admin: true };
const member = { email: 'sam@acme.com', admin: false };
const TODAY = '2026-10-09';
const tool = (over = {}) => ({ id: 1, name: 'Claude', category: 'AI assistants', pricing: 'per_seat', price_cents: 3000, currency: 'USD', billing: 'monthly', seats_bought: 10, status: 'active', owner: 'priya@acme.com', renews_on: '2026-10-18', trial_ends: null, ...over });

test('identity comes only from the Spryloom headers', () => {
  assert.deepEqual(viewerOf({ 'x-spryloom-email': ' Sam@Acme.com ', 'x-spryloom-role': 'admin' }), { email: 'sam@acme.com', admin: true });
  assert.deepEqual(viewerOf({ 'x-spryloom-email': 'sam@acme.com', 'x-spryloom-role': 'owner' }), { email: 'sam@acme.com', admin: false });
  assert.equal(viewerOf({}), undefined);
  assert.equal(viewerOf({ 'x-spryloom-email': '   ' }), undefined);
});

test('only admins edit the register', () => {
  assert.equal(canEditRegister(admin), true);
  assert.equal(canEditRegister(member), false);
});

test('admins decide requests, but not their own unless they are the only admin', () => {
  const theirs = { status: 'pending', requester: member.email };
  const own = { status: 'pending', requester: admin.email };
  assert.equal(decisionBlock(admin, theirs, 2), undefined);
  assert.match(decisionBlock(member, theirs, 2), /Only admins/);
  assert.match(decisionBlock(admin, own, 2), /another admin decides/);
  assert.equal(decisionBlock(admin, own, 1), undefined);
  assert.match(decisionBlock(admin, { ...theirs, status: 'approved' }, 2), /already been decided/);
});

test('only the person who asked withdraws, and only while it waits', () => {
  assert.equal(canWithdraw(member, { status: 'pending', requester: member.email }), true);
  assert.equal(canWithdraw(admin, { status: 'pending', requester: member.email }), false);
  assert.equal(canWithdraw(member, { status: 'declined', requester: member.email }), false);
});

test('months add without drifting off month ends', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-01-31', 2), '2026-03-31');
  assert.equal(addMonths('2026-11-15', 3), '2027-02-15');
  assert.equal(addMonths('2026-03-15', -3), '2025-12-15');
});

test('the next renewal rolls forward from any past renewal', () => {
  assert.equal(nextRenewal('2026-10-18', 'monthly', TODAY), '2026-10-18');
  assert.equal(nextRenewal('2026-10-09', 'monthly', TODAY), '2026-10-09');
  assert.equal(nextRenewal('2026-03-20', 'monthly', TODAY), '2026-10-20');
  assert.equal(nextRenewal('2026-03-05', 'monthly', TODAY), '2026-11-05');
  assert.equal(nextRenewal('2024-11-02', 'annual', TODAY), '2026-11-02');
  assert.equal(nextRenewal('2025-10-01', 'annual', TODAY), '2027-10-01');
  // Counted from the original date: a plan bought on Jan 31 renews on Oct 31, not Oct 28.
  assert.equal(nextRenewal('2026-01-31', 'monthly', '2026-10-01'), '2026-10-31');
  assert.equal(nextRenewal(null, 'monthly', TODAY), undefined);
  assert.equal(nextRenewal('not a date', 'monthly', TODAY), undefined);
});

test('upcoming lists renewals, endings and trials inside the window, soonest first', () => {
  const items = upcoming([
    tool({ id: 1, name: 'Slack', renews_on: '2026-10-14' }),
    tool({ id: 2, name: 'Copilot', status: 'cancelling', renews_on: '2026-09-20' }),
    tool({ id: 3, name: 'Perplexity', status: 'trial', trial_ends: '2026-10-13', renews_on: null }),
    tool({ id: 4, name: 'Notion', billing: 'annual', renews_on: '2027-03-01' }),
    tool({ id: 5, name: 'Old trial', status: 'trial', trial_ends: '2026-10-01' }),
  ], TODAY, 30);
  assert.deepEqual(items.map((i) => [i.tool.name, i.kind, i.date, i.days]), [
    ['Perplexity', 'trial', '2026-10-13', 4],
    ['Slack', 'renews', '2026-10-14', 5],
    ['Copilot', 'ends', '2026-10-20', 11],
  ]);
  assert.equal(items[1].amount, 30000);
});

test('attention puts this week first, then the next two weeks, then the rest', () => {
  const tools = [
    tool({ id: 1, name: 'Renews soon', renews_on: '2026-10-12' }),
    tool({ id: 2, name: 'Renews later', renews_on: '2026-10-20' }),
    tool({ id: 3, name: 'Nobody owns', owner: null, renews_on: '2026-12-01', billing: 'annual' }),
    tool({ id: 4, name: 'Half empty', renews_on: '2027-01-01', billing: 'annual' }),
    tool({ id: 5, name: 'Trial over', status: 'trial', trial_ends: '2026-10-05' }),
  ];
  const usersByTool = new Map([[1, 10], [2, 10], [3, 10], [4, 4], [5, 2]]);
  const requests = [{ id: 9, status: 'pending', created_at: '2026-10-08T12:00:00Z', tool_name: 'Granola' }, { id: 10, status: 'approved', created_at: '2026-10-01T00:00:00Z' }];
  const list = attention({ tools, usersByTool, requests, today: TODAY });
  assert.deepEqual(list.map((a) => [a.kind, a.severity, a.tool?.name ?? a.request.tool_name]), [
    ['trial_over', 'urgent', 'Trial over'],
    ['renews', 'urgent', 'Renews soon'],
    ['renews', 'soon', 'Renews later'],
    ['unused_seats', 'soon', 'Half empty'],
    ['request', 'info', 'Granola'],
    ['no_owner', 'info', 'Nobody owns'],
  ]);
  assert.equal(list[3].unused, 6);
});

test('the morning email goes to the lead admin first, then owners by urgency, within the limit', () => {
  const people = [
    { email: 'lee@acme.com', admin: true, last_seen: '2026-10-08T10:00:00Z' },
    { email: 'kim@acme.com', admin: true, last_seen: '2026-10-01T10:00:00Z' },
    { email: 'ann@acme.com', admin: false, last_seen: '2026-10-02T10:00:00Z' },
    { email: 'bo@acme.com', admin: false, last_seen: '2026-10-02T10:00:00Z' },
    { email: 'cy@acme.com', admin: false, last_seen: '2026-10-02T10:00:00Z' },
    { email: 'priya@example.com', admin: false, example: true, last_seen: '2026-10-08T10:00:00Z' },
  ];
  const items = upcoming([
    tool({ id: 1, name: 'A', owner: 'ann@acme.com', renews_on: '2026-10-20' }),
    tool({ id: 2, name: 'B', owner: 'bo@acme.com', renews_on: '2026-10-11' }),
    tool({ id: 3, name: 'C', owner: 'cy@acme.com', renews_on: '2026-10-15' }),
    tool({ id: 4, name: 'D', owner: 'priya@example.com', renews_on: '2026-10-10' }),
    tool({ id: 5, name: 'E', owner: null, renews_on: '2026-10-12' }),
    tool({ id: 6, name: 'F', owner: 'lee@acme.com', renews_on: '2026-10-13' }),
  ], TODAY, 14);
  const plan = planDigest({ items, people, limit: DIGEST_LIMIT });
  assert.equal(DIGEST_LIMIT, 3);
  assert.deepEqual(plan.map((p) => [p.to, p.scope, p.items.map((i) => i.tool.name).join('')]), [
    ['lee@acme.com', 'team', 'DBEFCA'],
    ['bo@acme.com', 'own', 'B'],
    ['cy@acme.com', 'own', 'C'],
  ]);
  // With room to spare, the remaining owner and then the other admin follow.
  assert.deepEqual(planDigest({ items, people, limit: 10 }).map((p) => p.to), ['lee@acme.com', 'bo@acme.com', 'cy@acme.com', 'ann@acme.com', 'kim@acme.com']);
  // No slots left today, or nothing coming up: no email.
  assert.deepEqual(planDigest({ items, people, limit: 0 }), []);
  assert.deepEqual(planDigest({ items: [], people, limit: 3 }), []);
  // Example people are never emailed, even as admins.
  assert.deepEqual(planDigest({ items, people: [{ email: 'x@example.com', admin: true, example: true, last_seen: '2026-10-08' }], limit: 3 }), []);
});

test('the morning email stays inside Spryloom limits and has no prices that look like addresses', () => {
  const many = Array.from({ length: 30 }, (_, i) => tool({ id: i, name: `Tool number ${i} with a long name`, renews_on: '2026-10-20', price_cents: 1999 }));
  const { subject, text } = digestEmail({ to: 'lee@acme.com', scope: 'team', items: upcoming(many, TODAY, 14) });
  assert.ok(subject.length <= 100);
  assert.ok(text.length <= 500, String(text.length));
  assert.match(text, /And \d+ more\./);
  assert.doesNotMatch(text, /\d\.\d/);
  const one = digestEmail({ to: 'a', scope: 'own', items: upcoming([tool({ status: 'trial', trial_ends: '2026-10-13' })], TODAY, 14) });
  assert.equal(one.subject, 'Claude trial ends in 4 days');
  assert.match(one.text, /^Coming up for the tools you own: Claude trial ends in 4 days, then \$300 a month\./);
});

test('websites are stored as ordinary web addresses only', () => {
  assert.equal(safeWebsite('notion.so'), 'https://notion.so/');
  assert.equal(safeWebsite('https://claude.ai'), 'https://claude.ai/');
  assert.equal(safeWebsite('javascript:alert(1)'), undefined);
  assert.equal(safeWebsite('localhost'), undefined);
  assert.equal(safeWebsite(''), undefined);
});

test('the example team is fresh, plausible and marked', () => {
  const data = exampleData(TODAY);
  assert.ok(data.tools.length >= 12 && data.tools.length <= 18);
  assert.ok(data.people.length >= 8 && data.people.length <= 10);
  assert.ok(data.people.every((p) => p.endsWith('@example.com')));
  assert.equal(data.requests.filter((r) => r.status === 'pending').length, 2);
  for (const t of data.tools) {
    assert.ok(Number.isInteger(t.price_cents) && t.price_cents > 0, t.name);
    assert.ok(t.users.every((u) => data.people.includes(u)), t.name);
    if (t.status === 'trial') assert.ok(t.trial_ends > TODAY, t.name);
    else assert.ok(t.renews_on >= TODAY, t.name);
  }
  assert.ok(new Set(data.tools.map((t) => t.currency)).size > 1, 'shows more than one currency');
  assert.ok(new Set(data.tools.map((t) => t.category)).size >= 4);
  // Something renews this week, so the overview always has something to show.
  assert.ok(upcoming(data.tools, TODAY, 7).length >= 2);
});
