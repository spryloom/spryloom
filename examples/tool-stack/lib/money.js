/**
 * Money, kept as whole cents with a currency on every tool.
 *
 * A tool's price is what one billing period costs: per seat or for the whole
 * plan, every month or every year. Totals are "monthly equivalent": an annual
 * bill counts as a twelfth a month. Different currencies are never added
 * together; every total is grouped by currency.
 */

/** Currencies with two decimal places, so a cent is always 1/100. */
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'SGD', 'INR'];

/**
 * What someone typed as a price, as cents. "1,299.5", "$30" and "30.00" all
 * work. Returns undefined for anything that isn't a plain amount, so a typo
 * never becomes a price.
 */
export function parseAmount(text) {
  const s = String(text ?? '').trim().replace(/^[\s$€£₹A-Za-z]+/, '').replace(/,/g, '').replace(/\s/g, '');
  const m = s.match(/^(\d{1,9})(?:\.(\d{1,2}))?$/);
  if (!m) return undefined;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** Cents as the plain amount a form field shows: 3000 → "30", 1999 → "19.99". */
export const amountField = (cents) => (cents === null || cents === undefined ? '' : cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

/** What one billing period costs in total. */
export const periodCents = (tool) => (tool.pricing === 'per_seat' ? tool.price_cents * Math.max(0, tool.seats_bought ?? 0) : tool.price_cents);

/** What the tool costs a month: an annual bill counts as a twelfth, to the nearest cent. */
export const monthlyCents = (tool) => (tool.billing === 'annual' ? Math.round(periodCents(tool) / 12) : periodCents(tool));

/** What the tool costs a year. */
export const annualCents = (tool) => (tool.billing === 'annual' ? periodCents(tool) : periodCents(tool) * 12);

/** One seat a month, for per-seat plans. */
export const seatMonthlyCents = (tool) => (tool.pricing !== 'per_seat' ? 0 : tool.billing === 'annual' ? Math.round(tool.price_cents / 12) : tool.price_cents);

/**
 * Whether a tool is being paid for now. Trials aren't yet; a tool being
 * cancelled is until its renewal date.
 */
export const isPaid = (tool) => tool.status === 'active' || tool.status === 'cancelling';

/**
 * Monthly and yearly totals of the paid tools, one row per currency, the
 * largest first. Each total is the sum of each tool's own monthly figure, so
 * the rows on screen add up to the total shown.
 */
export function totalsByCurrency(tools) {
  const by = new Map();
  for (const tool of tools.filter(isPaid)) {
    const row = by.get(tool.currency) ?? { currency: tool.currency, monthly: 0, annual: 0, count: 0 };
    row.monthly += monthlyCents(tool);
    row.annual += annualCents(tool);
    row.count += 1;
    by.set(tool.currency, row);
  }
  return [...by.values()].sort((a, b) => b.monthly - a.monthly || a.currency.localeCompare(b.currency));
}

/** Monthly spend per category, per currency: [{ currency, total, rows: [{ category, monthly, count }] }]. */
export function spendByCategory(tools) {
  const by = new Map();
  for (const tool of tools.filter(isPaid)) {
    const group = by.get(tool.currency) ?? { currency: tool.currency, total: 0, rows: new Map() };
    const row = group.rows.get(tool.category) ?? { category: tool.category, monthly: 0, count: 0 };
    row.monthly += monthlyCents(tool);
    row.count += 1;
    group.rows.set(tool.category, row);
    group.total += monthlyCents(tool);
    by.set(tool.currency, group);
  }
  return [...by.values()]
    .map((g) => ({ ...g, rows: [...g.rows.values()].sort((a, b) => b.monthly - a.monthly || a.category.localeCompare(b.category)) }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Seats bought that nobody has marked "I use this". Only per-seat plans have
 * seats to waste. The monthly figure is what those seats cost a month.
 */
export function seatWaste(tool, using) {
  if (tool.pricing !== 'per_seat' || !tool.seats_bought) return { unused: 0, monthly: 0 };
  const unused = Math.max(0, tool.seats_bought - using);
  const monthly = tool.billing === 'annual' ? Math.round((unused * tool.price_cents) / 12) : unused * tool.price_cents;
  return { unused, monthly };
}

/**
 * Unused seats and their cost, summed per currency, for active plans. A plan
 * being cancelled is left out: its seats go when it ends.
 */
export function wasteByCurrency(tools, usersByTool) {
  const by = new Map();
  for (const tool of tools.filter((t) => t.status === 'active')) {
    const w = seatWaste(tool, usersByTool.get(tool.id) ?? 0);
    if (!w.unused) continue;
    const row = by.get(tool.currency) ?? { currency: tool.currency, unused: 0, monthly: 0, tools: 0 };
    row.unused += w.unused;
    row.monthly += w.monthly;
    row.tools += 1;
    by.set(tool.currency, row);
  }
  return [...by.values()].sort((a, b) => b.monthly - a.monthly);
}

/**
 * Cents as money: "$1,240" when whole, "$19.99" otherwise. `whole` rounds to
 * the unit for headline figures.
 */
export function formatMoney(cents, currency = 'USD', { whole = false } = {}) {
  const value = (whole ? Math.round(cents / 100) * 100 : cents) / 100;
  const digits = whole || cents % 100 === 0 ? 0 : 2;
  try {
    return value.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
  } catch {
    return `${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${currency}`;
  }
}
