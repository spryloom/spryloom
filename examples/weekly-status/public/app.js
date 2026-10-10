// Small touches on top of server-rendered pages. Every page works without this.

// A question before anything that can't be undone.
document.querySelectorAll('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));
document.querySelectorAll('[data-confirm-click]').forEach((b) => b.addEventListener('click', (e) => { if (!confirm(b.dataset.confirmClick)) e.preventDefault(); }));

// Answers grow with what is typed, so nothing scrolls inside a small box.
const grow = (t) => { t.style.height = 'auto'; t.style.height = `${Math.max(t.scrollHeight + 2, 64)}px`; };
document.querySelectorAll('.ci textarea').forEach((t) => { grow(t); t.addEventListener('input', () => grow(t)); });

// Check-in: choosing Blocked asks for what is blocking it, as the server will.
document.querySelectorAll('[data-checkin]').forEach((card) => {
  const blockers = card.querySelector('textarea[name$="_blockers"]');
  const sync = () => {
    const blocked = card.querySelector('input[type="radio"][value="blocked"]').checked;
    blockers.required = blocked;
    blockers.placeholder = blocked ? 'Required when blocked: what is in the way, and who could unblock it.' : "What's in the way, and who could unblock it.";
  };
  card.addEventListener('change', sync);
  sync();
});

// Don't lose a half-written check-in by navigating away.
const guarded = document.querySelector('form[data-dirty-guard]');
if (guarded) {
  let dirty = false;
  guarded.addEventListener('input', () => { dirty = true; });
  guarded.addEventListener('change', () => { dirty = true; });
  guarded.addEventListener('submit', () => { dirty = false; });
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
}
