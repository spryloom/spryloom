import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isIsoDate, overlaps, rangeText, startOfWeek, todayIn, workingDayFrom, workingDays } from '../lib/days.js';

// 2026-10-12 is a Monday.
const span = (start, end, halfStart = false, halfEnd = false) => ({ start, end, halfStart, halfEnd });

test('a working week is five days; the weekend inside a range is not counted', () => {
  assert.equal(workingDays(span('2026-10-12', '2026-10-16')), 5);
  assert.equal(workingDays(span('2026-10-15', '2026-10-20')), 4);
  assert.equal(workingDays(span('2026-10-17', '2026-10-18')), 0);
});

test('company holidays are not counted', () => {
  const holidays = new Set(['2026-10-14']);
  assert.equal(workingDays(span('2026-10-12', '2026-10-16'), holidays), 4);
  assert.equal(workingDays(span('2026-10-14', '2026-10-14'), holidays), 0);
});

test('half days count as 0.5, at either end or on a single day', () => {
  assert.equal(workingDays(span('2026-10-12', '2026-10-12', true)), 0.5);
  assert.equal(workingDays(span('2026-10-12', '2026-10-12', false, true)), 0.5);
  assert.equal(workingDays(span('2026-10-12', '2026-10-16', true, true)), 4);
  // A half day that lands on a weekend costs nothing.
  assert.equal(workingDays(span('2026-10-10', '2026-10-13', true)), 2);
});

test('overlap is by half day: a morning and an afternoon on the same day do not clash', () => {
  assert.ok(overlaps(span('2026-10-12', '2026-10-14'), span('2026-10-14', '2026-10-16')));
  assert.ok(!overlaps(span('2026-10-12', '2026-10-13'), span('2026-10-14', '2026-10-16')));
  assert.ok(!overlaps(span('2026-10-12', '2026-10-14', false, true), span('2026-10-14', '2026-10-16', true)));
  assert.ok(overlaps(span('2026-10-14', '2026-10-14', false, true), span('2026-10-14', '2026-10-14')));
});

test('date helpers', () => {
  assert.ok(isIsoDate('2026-02-28'));
  assert.ok(!isIsoDate('2026-02-30'));
  assert.ok(!isIsoDate('12/10/2026'));
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(startOfWeek('2026-10-18'), '2026-10-12');
  assert.equal(workingDayFrom('2026-10-16', 1), '2026-10-19');
  assert.equal(workingDayFrom('2026-10-17', 0), '2026-10-19');
  assert.equal(rangeText('2026-10-12', '2026-10-16', 2026), 'Oct 12 – 16');
  assert.equal(rangeText('2026-10-30', '2026-11-03', 2026), 'Oct 30 – Nov 3');
  assert.equal(todayIn('Asia/Tokyo', new Date('2026-10-09T20:00:00Z')), '2026-10-10');
  assert.equal(todayIn('America/New_York', new Date('2026-10-09T02:00:00Z')), '2026-10-08');
});
