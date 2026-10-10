import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoard } from '../lib/rules.js';
import { checkinPage, esc, layout, weekPage } from '../lib/views.js';

const evil = '<img src=x onerror=alert(1)>';
const viewer = { email: 'sam@acme.com', admin: false };

test('esc makes typed text inert', () => {
  assert.equal(esc(`"${evil}'&`), '&quot;&lt;img src=x onerror=alert(1)&gt;&#39;&amp;');
});

test('what people typed is escaped everywhere it is shown', () => {
  const projects = [{ id: 1, name: evil, lead: 'sam@acme.com', created_at: '2026-01-01' }];
  const members = [{ project_id: 1, email: 'sam@acme.com' }];
  const updates = [{ id: 5, project_id: 1, email: 'sam@acme.com', status: 'blocked', moved: evil, blockers: evil, next: evil }];
  const board = buildBoard({ projects, members, updates, week: '2026-10-05' });
  const html = weekPage({ viewer, board, week: '2026-10-05', today: '2026-10-07', reporting: '2026-10-05', names: new Map(), mine: { total: 1, done: 1 }, isLead: true });
  assert.ok(!html.includes(evil));
  const form = checkinPage({ viewer, week: '2026-10-05', today: '2026-10-07', projects, existing: new Map(), lastWeek: new Map([['1', { next: evil }]]), values: { 1: { moved: evil } }, errors: { 1: evil }, names: new Map() });
  assert.ok(!form.includes(evil));
  const page = layout({ title: evil, viewer, body: '', flash: evil, settings: { team_name: evil } });
  assert.ok(!page.includes(evil));
});

test('members see no admin controls; a lead sees Mark handled on their project', () => {
  const projects = [{ id: 1, name: 'Mobile', lead: 'jo@acme.com', created_at: '2026-01-01' }];
  const members = [{ project_id: 1, email: 'sam@acme.com' }];
  const updates = [{ id: 5, project_id: 1, email: 'sam@acme.com', status: 'blocked', moved: 'a', blockers: 'b', next: '' }];
  const board = buildBoard({ projects, members, updates, week: '2026-10-05' });
  const args = { board, week: '2026-10-05', today: '2026-10-07', reporting: '2026-10-05', names: new Map(), mine: { total: 1, done: 1 }, isLead: false };
  const asMember = weekPage({ viewer, ...args });
  assert.ok(!asMember.includes('Mark handled'));
  assert.ok(!asMember.includes('/projects/new'));
  assert.ok(weekPage({ viewer: { email: 'jo@acme.com', admin: false }, ...args }).includes('Mark handled'));
  const banner = layout({ title: 't', viewer, body: '', settings: { team_name: 'T' }, examples: true });
  assert.ok(!banner.includes('/examples/remove'), 'only admins get the remove button');
  assert.ok(layout({ title: 't', viewer: { ...viewer, admin: true }, body: '', settings: { team_name: 'T' }, examples: true }).includes('/examples/remove'));
});

test('someone on no project gets a designed empty check-in, not a blank form', () => {
  const html = checkinPage({ viewer, week: '2026-10-05', today: '2026-10-07', projects: [], existing: new Map(), lastWeek: new Map(), names: new Map() });
  assert.match(html, /not on a project yet/);
  assert.ok(!html.includes('<form'));
});
