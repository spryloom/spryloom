import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  annualCents, formatMoney, monthlyCents, parseAmount, periodCents, seatWaste,
  spendByCategory, totalsByCurrency, wasteByCurrency,
} from '../lib/money.js';

const tool = (over = {}) => ({ id: 1, name: 'T', category: 'Other', pricing: 'per_seat', price_cents: 3000, currency: 'USD', billing: 'monthly', seats_bought: 10, status: 'active', ...over });

test('prices typed by people become whole cents, or nothing', () => {
  assert.equal(parseAmount('30'), 3000);
  assert.equal(parseAmount('19.99'), 1999);
  assert.equal(parseAmount('8.5'), 850);
  assert.equal(parseAmount('$1,299.00'), 129900);
  assert.equal(parseAmount('€ 20'), 2000);
  assert.equal(parseAmount('0.10'), 10);
  for (const bad of ['', 'abc', '12.345', '-5', '1e3', '30/mo']) assert.equal(parseAmount(bad), undefined, bad);
});

test('per-seat plans multiply by seats; flat plans do not', () => {
  assert.equal(periodCents(tool()), 30000);
  assert.equal(periodCents(tool({ pricing: 'flat', price_cents: 2600, seats_bought: null })), 2600);
  assert.equal(periodCents(tool({ seats_bought: null })), 0);
});

test('a yearly bill counts as a twelfth a month, rounded to the cent', () => {
  const yearly = tool({ billing: 'annual', price_cents: 30000, seats_bought: 10 }); // $300 a seat a year
  assert.equal(periodCents(yearly), 300000);
  assert.equal(monthlyCents(yearly), 25000);
  assert.equal(annualCents(yearly), 300000);
  // $95.88 a seat a year, 12 seats: $1,150.56 a year, $95.88 a month.
  assert.equal(monthlyCents(tool({ billing: 'annual', price_cents: 9588, seats_bought: 12 })), 9588);
  // $100 a year is $8.33 a month (8.333… rounds down), $200 a year is $16.67 (rounds up).
  assert.equal(monthlyCents(tool({ billing: 'annual', pricing: 'flat', price_cents: 10000 })), 833);
  assert.equal(monthlyCents(tool({ billing: 'annual', pricing: 'flat', price_cents: 20000 })), 1667);
  assert.equal(annualCents(tool({ price_cents: 875, seats_bought: 10 })), 105000);
});

test('totals are grouped by currency and never mixed', () => {
  const totals = totalsByCurrency([
    tool({ id: 1, price_cents: 3000, seats_bought: 10 }),
    tool({ id: 2, currency: 'EUR', price_cents: 2000, seats_bought: 4 }),
    tool({ id: 3, billing: 'annual', pricing: 'flat', price_cents: 10000 }),
  ]);
  assert.deepEqual(totals, [
    { currency: 'USD', monthly: 30000 + 833, annual: 360000 + 10000, count: 2 },
    { currency: 'EUR', monthly: 8000, annual: 96000, count: 1 },
  ]);
});

test('trials are left out of spend; cancelling tools are counted until they end', () => {
  const totals = totalsByCurrency([tool({ status: 'trial' }), tool({ id: 2, status: 'cancelling', price_cents: 1900 })]);
  assert.deepEqual(totals, [{ currency: 'USD', monthly: 19000, annual: 228000, count: 1 }]);
});

test('spend by category adds up to the total, per currency', () => {
  const tools = [
    tool({ id: 1, category: 'AI assistants', price_cents: 3000, seats_bought: 12 }),
    tool({ id: 2, category: 'AI assistants', billing: 'annual', price_cents: 30000, seats_bought: 10 }),
    tool({ id: 3, category: 'Design', price_cents: 1600, seats_bought: 3 }),
    tool({ id: 4, category: 'Design', currency: 'EUR', price_cents: 2000, seats_bought: 4 }),
  ];
  const groups = spendByCategory(tools);
  assert.equal(groups[0].currency, 'USD');
  assert.deepEqual(groups[0].rows.map((r) => [r.category, r.monthly]), [['AI assistants', 36000 + 25000], ['Design', 4800]]);
  assert.equal(groups[0].total, groups[0].rows.reduce((n, r) => n + r.monthly, 0));
  assert.equal(groups[0].total, totalsByCurrency(tools)[0].monthly);
  assert.deepEqual(groups[1].rows, [{ category: 'Design', monthly: 8000, count: 1 }]);
});

test('seat waste counts bought seats nobody marked, and what they cost; trials and plans being cancelled are left out', () => {
  assert.deepEqual(seatWaste(tool({ seats_bought: 10 }), 4), { unused: 6, monthly: 18000 });
  assert.deepEqual(seatWaste(tool({ seats_bought: 10 }), 12), { unused: 0, monthly: 0 });
  assert.deepEqual(seatWaste(tool({ billing: 'annual', price_cents: 30000, seats_bought: 10 }), 5), { unused: 5, monthly: 12500 });
  assert.deepEqual(seatWaste(tool({ pricing: 'flat', seats_bought: null }), 0), { unused: 0, monthly: 0 });
  const waste = wasteByCurrency([tool({ id: 1, seats_bought: 10 }), tool({ id: 2, status: 'trial', seats_bought: 10 }), tool({ id: 4, status: 'cancelling', seats_bought: 10 }), tool({ id: 3, currency: 'EUR', price_cents: 2000, seats_bought: 4 })], new Map([[1, 8], [3, 3]]));
  assert.deepEqual(waste, [{ currency: 'USD', unused: 2, monthly: 6000, tools: 1 }, { currency: 'EUR', unused: 1, monthly: 2000, tools: 1 }]);
});

test('money reads naturally', () => {
  assert.equal(formatMoney(36000, 'USD'), '$360');
  assert.equal(formatMoney(1999, 'USD'), '$19.99');
  assert.equal(formatMoney(8000, 'EUR'), '€80');
  assert.equal(formatMoney(123456, 'USD', { whole: true }), '$1,235');
});
