import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, statusChip, whenText } from '../lib/views.js';

test('anything a person typed is escaped', () => {
  assert.equal(esc('<img src=x onerror="a()">'), '&lt;img src=x onerror=&quot;a()&quot;&gt;');
  assert.equal(esc("O'Brien & co"), 'O&#39;Brien &amp; co');
});

test('dates read the way people say them', () => {
  const r = { start_date: '2026-10-12', end_date: '2026-10-12', half_start: true, half_end: false };
  assert.equal(whenText(r, 2026), 'Oct 12, afternoon');
  assert.equal(whenText({ ...r, end_date: '2026-10-16', half_end: true }, 2026), 'Oct 12 – 16 (from midday, back after lunch)');
  assert.equal(whenText({ ...r, half_start: false, start_date: '2027-01-04', end_date: '2027-01-04' }, 2026), 'Jan 4, 2027');
});

test('status is shown with a shape and an icon, not colour alone', () => {
  assert.match(statusChip('pending'), /status-pending.*<svg.*Waiting/);
  assert.match(statusChip('declined'), /Declined/);
});
