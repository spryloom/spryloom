// Small touches on top of server-rendered pages. Every page works without this;
// the server checks everything again when a form is sent.

const form = document.getElementById('request-form');
if (form) {
  const read = (name) => { try { return JSON.parse(form.dataset[name] || 'null'); } catch { return null; } };
  const today = form.dataset.today;
  const holidays = new Map(read('holidays') || []);
  const balances = read('balances') || {};
  const team = read('team') || [];
  const back = read('back') || {};
  const LABEL = { vacation: 'Vacation', sick: 'Sick', personal: 'Personal', other: 'Other' };
  const $ = (sel) => form.querySelector(sel);
  const out = {
    days: $('[data-sum-days]'), unit: $('[data-sum-unit]'), when: $('[data-sum-when]'), bal: $('[data-sum-bal]'),
    kind: $('[data-sum-kind]'), after: $('[data-sum-after]'), notes: $('[data-sum-notes]'),
  };
  const lastField = $('[data-last-field]');
  const firstLabel = $('[data-first-label]');

  // The same rules as lib/days.js, so the number here is the number saved.
  const at = (d) => new Date(`${d}T00:00:00Z`);
  const add = (d, n) => { const x = at(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const working = (d) => { const w = at(d).getUTCDay(); return w !== 0 && w !== 6 && !holidays.has(d); };
  const fmt = (d, o) => at(d).toLocaleDateString('en-US', { timeZone: 'UTC', ...o });
  const short = (d) => fmt(d, { weekday: 'short', month: 'short', day: 'numeric' });
  const num = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const word = (n) => `${num(n)} ${n === 1 ? 'day' : 'days'}`;
  const icon = (kind) => kind === 'bad'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.2L21 19.5H3z"/><path d="M12 10v4.2M12 16.9v.1"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="8.4"/><path d="M12 11v5.2M12 7.9v.1"/></svg>';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const render = () => {
    const kind = (form.querySelector('input[name="kind"]:checked') || {}).value || 'vacation';
    const start = form.start.value;
    const end = form.end.value || start;
    const single = !form.end.value || form.end.value === start;
    lastField.hidden = single;
    firstLabel.textContent = single ? 'The day is' : 'First day is';
    const notes = [];
    out.bal.hidden = true;
    if (!start) {
      out.days.textContent = '–'; out.unit.textContent = 'working days';
      out.when.textContent = 'Choose your dates to see how many working days this is.';
      out.notes.innerHTML = '';
      return;
    }
    if (end < start) {
      out.days.textContent = '–';
      out.when.textContent = '';
      out.notes.innerHTML = `<li class="n-bad">${icon('bad')}<span>The last day is before the first day.</span></li>`;
      return;
    }
    const first = form.first.value;
    const halfStart = first === 'pm';
    const halfEnd = single ? first === 'am' : form.last.value === 'am';
    let days = 0;
    const skipped = [];
    for (let d = start, i = 0; d <= end && i < 400; d = add(d, 1), i += 1) {
      if (!working(d)) { if (holidays.has(d)) skipped.push(`${short(d)}: ${holidays.get(d)}`); continue; }
      days += (d === start && halfStart ? 0 : 0.5) + (d === end && halfEnd ? 0 : 0.5);
    }
    out.days.textContent = num(days);
    out.unit.textContent = days === 1 ? 'working day' : 'working days';
    out.when.textContent = single ? `${short(start)}${halfStart ? ', afternoon' : halfEnd ? ', morning' : ''}` : `${short(start)} to ${short(end)}`;

    const earliest = add(today, -(back[kind] ?? 0));
    if (start < earliest) notes.push(['bad', back[kind] ? `${LABEL[kind]} days can be recorded up to ${back[kind]} days back.` : `${LABEL[kind]} can't start in the past.`]);
    if (!single && first === 'am') notes.push(['bad', 'On the first day of a longer break you can take the afternoon off, not the morning.']);
    if (start.slice(0, 4) !== end.slice(0, 4)) notes.push(['bad', 'Time off that runs into a new year needs one request per year.']);
    if (days === 0) notes.push(['bad', 'Those dates are weekends or company holidays.']);
    skipped.slice(0, 2).forEach((s) => notes.push(['info', `${s}, a company holiday. Not counted.`]));

    const b = balances[kind];
    if (b && b.allowance !== null && days > 0) {
      const after = b.left - days;
      const total = Math.max(b.allowance, b.used + b.pending + days, 0.5);
      out.bal.hidden = false;
      out.bal.className = `sum-bal bal-${kind}`;
      out.kind.textContent = `${LABEL[kind]} left after this`;
      out.after.textContent = after < 0 ? `${num(-after)} over` : `${num(after)} of ${num(b.allowance)}`;
      const [used, pending, mine] = out.bal.querySelectorAll('.meter i');
      used.style.width = `${(b.used / total) * 100}%`;
      pending.style.width = `${(b.pending / total) * 100}%`;
      mine.style.width = `${(days / total) * 100}%`;
      if (after < 0) notes.push(['warn', `This is ${word(-after)} more than your ${LABEL[kind].toLowerCase()} allowance. You can still ask; the approver sees it and decides.`]);
    }
    const overlapping = team.filter(([, s, e]) => s <= end && e >= start);
    if (overlapping.length) {
      const names = overlapping.slice(0, 3).map(([n, , , p]) => `${n}${p ? ' (waiting)' : ''}`).join(', ');
      notes.push([overlapping.length >= 3 ? 'warn' : 'info', `Also out then: ${names}${overlapping.length > 3 ? ` and ${overlapping.length - 3} more` : ''}.`]);
    }
    out.notes.innerHTML = notes.map(([k, t]) => `<li class="n-${k}">${icon(k === 'info' ? 'info' : 'bad')}<span>${esc(t)}</span></li>`).join('');
  };
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  // Choosing a first day fills an empty last day's minimum, so the picker opens in the right month.
  form.start.addEventListener('change', () => { form.end.min = form.start.value || form.end.min; });
  render();
}

// The month grid opens scrolled to today on narrow screens.
const grid = document.querySelector('[data-scroll-today]');
if (grid) {
  const today = grid.querySelector('th.c-today');
  if (today && grid.scrollWidth > grid.clientWidth) grid.scrollLeft = Math.max(0, today.offsetLeft - 120);
}

// A question before anything that can't be undone.
document.querySelectorAll('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));

// Only one allowance editor open at a time.
document.querySelectorAll('details.pop').forEach((d) => d.addEventListener('toggle', () => {
  if (d.open) document.querySelectorAll('details.pop[open]').forEach((o) => { if (o !== d) o.open = false; });
}));
