// Small touches on top of server-rendered pages. Every page works without this.
document.documentElement.classList.add('js');

// Whole table rows open their tool.
document.querySelectorAll('tr[data-href]').forEach((row) => {
  row.addEventListener('click', (e) => { if (!e.target.closest('a, button, form')) location.href = row.dataset.href; });
});

// A question before anything that can't be undone.
document.querySelectorAll('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));
document.querySelectorAll('[data-confirm-click]').forEach((b) => b.addEventListener('click', (e) => { if (!confirm(b.dataset.confirmClick)) e.preventDefault(); }));

// Sorting applies as soon as it changes.
document.querySelectorAll('[data-autosubmit]').forEach((s) => s.addEventListener('change', () => s.form.submit()));

// The cost fields: what the price means, worked out as you type. Same sums as lib/money.js.
document.querySelectorAll('form').forEach((form) => {
  const price = form.querySelector('[data-price]');
  const calc = form.querySelector('[data-calc]');
  if (!price || !calc) return;
  const seats = form.querySelector('[data-seats]');
  const currency = form.querySelector('[data-currency]');
  const label = form.querySelector('[data-price-label] small');
  const picked = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value;
  const cents = (text) => {
    const m = String(text).trim().replace(/^[\s$€£₹A-Za-z]+/, '').replace(/[,\s]/g, '').match(/^(\d{1,9})(?:\.(\d{1,2}))?$/);
    return m ? Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0')) : undefined;
  };
  const fmt = (c) => {
    try { return (c / 100).toLocaleString('en-US', { style: 'currency', currency: currency.value, minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: c % 100 ? 2 : 0 }); } catch { return `${(c / 100).toFixed(2)} ${currency.value}`; }
  };
  const render = () => {
    const perSeat = picked('pricing') !== 'flat';
    const yearly = picked('billing') === 'annual';
    if (label) label.textContent = `(${perSeat ? 'a seat' : 'the whole plan'}, ${yearly ? 'a year' : 'a month'})`;
    const p = cents(price.value);
    if (p === undefined) { calc.textContent = ''; return; }
    const n = Number(seats?.value || 0);
    const period = perSeat ? p * n : p;
    if (perSeat && !n) { calc.innerHTML = `<b>${fmt(p)}</b> a seat a ${yearly ? 'year' : 'month'}. Add the seats to see the total.`; return; }
    const monthly = yearly ? Math.round(period / 12) : period;
    calc.innerHTML = `<b>${fmt(monthly)} a month</b>${yearly ? ` (billed ${fmt(period)} a year)` : ` · ${fmt(period * 12)} a year`}${perSeat ? ` for ${n} seat${n === 1 ? '' : 's'}` : ''}.`;
  };
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  render();
});

// A trial needs its end date; a paid plan needs its renewal date.
document.querySelectorAll('[data-status]').forEach((select) => {
  const form = select.form;
  const trial = form.querySelector('[data-trial-field]');
  const renew = form.querySelector('[data-renew-field]');
  const sync = () => {
    const isTrial = select.value === 'trial';
    if (trial) trial.hidden = !isTrial;
    if (renew) renew.hidden = isTrial;
  };
  select.addEventListener('change', sync);
  sync();
});
