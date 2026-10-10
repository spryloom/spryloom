import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alsoOut, outByDay, personCells, whoIsOut } from '../lib/calendar.js';
import { eachDay } from '../lib/days.js';
import { crowded } from '../lib/rules.js';

const r = (id, person, start_date, end_date, status = 'approved', extra = {}) => ({ id, person, kind: 'vacation', start_date, end_date, half_start: false, half_end: false, status, ...extra });
const week = eachDay('2026-10-12', '2026-10-18');
const requests = [
  r(1, 'ana@x.com', '2026-10-12', '2026-10-14'),
  r(2, 'ben@x.com', '2026-10-14', '2026-10-14', 'pending'),
  r(3, 'cy@x.com', '2026-10-14', '2026-10-19', 'approved', { half_start: true }),
  r(4, 'dee@x.com', '2026-10-14', '2026-10-14', 'declined'),
];

test('counts who is out each working day; waiting requests are counted apart', () => {
  const counts = outByDay(requests, week);
  assert.deepEqual(counts.map((c) => c.approved), [1, 1, 2, 1, 1, 0, 0]);
  assert.equal(counts[2].pending, 1);
  assert.equal(counts[5].working, false);
});

test('cells mark half days, the start and end of a stretch, and weekends inside it', () => {
  const cells = personCells(requests, week);
  const cy = cells.get('cy@x.com');
  assert.deepEqual([cy[2].am, cy[2].pm, cy[2].first], [false, true, true]);
  assert.equal(cy[5].bridge, true);
  assert.equal(cells.get('ben@x.com')[2].pending, true);
  assert.equal(cells.has('dee@x.com'), false);
});

test('who else is out during a request, and when a day is crowded', () => {
  assert.deepEqual(alsoOut(requests[1], requests).map((o) => o.id), [1, 3]);
  assert.equal(whoIsOut(requests, ['2026-10-14'])[0].out.length, 3);
  assert.ok(crowded(3, 40));
  assert.ok(crowded(2, 5));
  assert.ok(!crowded(2, 12));
});
