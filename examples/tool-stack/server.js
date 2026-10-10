import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { adminCount, loadAll, numeric, pool, record, removeExamples, seen, setup } from './lib/db.js';
import { CURRENCIES, monthlyCents, parseAmount, seatWaste, spendByCategory, totalsByCurrency, wasteByCurrency } from './lib/money.js';
import { notify } from './lib/notify.js';
import {
  STATUSES, attention, canEditRegister, canWithdraw, decisionBlock, isIsoDay, nextRenewal,
  safeWebsite, todayIso, upcoming, viewerOf,
} from './lib/rules.js';
import { layout, minePage, notFound, overview, register, requestForm, requestPage, requestsPage, toolForm, toolPage } from './lib/views.js';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8080);
const ASSETS = { '/assets/app.css': 'text/css; charset=utf-8', '/assets/app.js': 'text/javascript; charset=utf-8' };

const send = (res, status, body, type = 'text/html; charset=utf-8', extra = {}) => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...extra });
  res.end(body);
};
const redirect = (res, location) => { res.writeHead(303, { location }); res.end(); };

const readForm = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; if (body.length > 100_000) reject(new Error('too large')); });
  req.on('end', () => resolve(new URLSearchParams(body)));
  req.on('error', reject);
});

/** A message shown once after a redirect, carried in the query string: `m` for news, `e` for a problem. */
const withFlash = (path, message, key = 'm') => `${path}${path.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(message)}`;
const withError = (path, message) => withFlash(path, message, 'e');

const text = (form, name, max) => String(form.get(name) ?? '').trim().slice(0, max);
const short = (email) => String(email).split('@')[0];

const people = async () => (await pool.query('SELECT email FROM people ORDER BY example, email')).rows;
const loadTool = async (id) => {
  const tool = numeric((await pool.query('SELECT * FROM tools WHERE id = $1', [id])).rows[0]);
  if (tool) tool.using = (await pool.query('SELECT count(*)::int AS n FROM tool_users WHERE tool_id = $1', [id])).rows[0].n;
  return tool;
};
const loadRequest = async (id) => numeric((await pool.query('SELECT * FROM requests WHERE id = $1', [id])).rows[0]);

/**
 * The cost fields shared by the tool form and the request form, checked.
 * Returns the values, or an error in plain words.
 */
function readCost(form, { seatsName, priceRequired }) {
  const pricing = form.get('pricing') === 'flat' ? 'flat' : 'per_seat';
  const billing = form.get('billing') === 'annual' ? 'annual' : 'monthly';
  const currency = CURRENCIES.includes(form.get('currency')) ? form.get('currency') : 'USD';
  const rawPrice = text(form, 'price', 20);
  const price = rawPrice === '' ? undefined : parseAmount(rawPrice);
  const rawSeats = text(form, seatsName, 7);
  const seats = rawSeats === '' ? null : Number(rawSeats);
  let error;
  if (rawPrice === '' && priceRequired) error = 'Enter the price, like 30 or 19.99.';
  else if (rawPrice !== '' && price === undefined) error = `"${rawPrice}" isn't a price. Use a number like 30 or 19.99.`;
  else if (seats !== null && (!Number.isInteger(seats) || seats < 0 || seats > 100_000)) error = 'Seats must be a whole number.';
  return { error, values: { pricing, billing, currency, price_cents: price ?? null, [seatsName]: seats } };
}

/** The tool form, checked. Owners must be people who have opened the app. */
function readTool(form, known) {
  const cost = readCost(form, { seatsName: 'seats_bought', priceRequired: true });
  const websiteRaw = text(form, 'website', 200);
  const values = {
    ...cost.values,
    name: text(form, 'name', 80),
    category: text(form, 'category', 40) || 'Other',
    plan: text(form, 'plan', 60),
    website: safeWebsite(websiteRaw) ?? null,
    status: STATUSES.includes(form.get('status')) ? form.get('status') : 'active',
    renews_on: isIsoDay(form.get('renews_on')) ? form.get('renews_on') : null,
    trial_ends: isIsoDay(form.get('trial_ends')) ? form.get('trial_ends') : null,
    owner: known.has(form.get('owner')) ? form.get('owner') : null,
    notes: text(form, 'notes', 1000),
  };
  let error = cost.error;
  if (!values.name) error = 'Give the tool a name.';
  else if (websiteRaw && !values.website) error = `"${websiteRaw}" doesn't look like a web address. Try something like claude.ai.`;
  else if (values.status === 'trial' && !values.trial_ends) error = 'A trial needs the date it ends.';
  if (values.status !== 'trial') values.trial_ends = null;
  return { error, values };
}

const TOOL_COLUMNS = ['name', 'category', 'plan', 'website', 'owner', 'pricing', 'price_cents', 'currency', 'billing', 'seats_bought', 'renews_on', 'status', 'trial_ends', 'notes'];

async function insertTool(values, actor) {
  const { rows: [tool] } = await pool.query(
    `INSERT INTO tools (${TOOL_COLUMNS.join(', ')}, created_by) VALUES (${TOOL_COLUMNS.map((_, i) => `$${i + 1}`).join(', ')}, $${TOOL_COLUMNS.length + 1}) RETURNING *`,
    [...TOOL_COLUMNS.map((c) => values[c]), actor],
  );
  return tool;
}

/** Admins to tell about a new request: the two most recently active, never the person asking. */
const adminsToTell = async (except) =>
  (await pool.query('SELECT email FROM people WHERE admin AND NOT example AND email <> $1 ORDER BY last_seen DESC LIMIT 2', [except])).rows.map((r) => r.email);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://app');
    if (req.method === 'GET' && ASSETS[url.pathname]) {
      const file = await readFile(join(here, 'public', url.pathname.slice('/assets/'.length)));
      return send(res, 200, file, ASSETS[url.pathname], { 'cache-control': 'public, max-age=300' });
    }

    const viewer = viewerOf(req.headers);
    if (!viewer) return send(res, 401, 'Sign in through Spryloom first.', 'text/plain; charset=utf-8');
    await seen(viewer);
    const today = todayIso();
    const path = url.pathname;
    const waiting = (await pool.query(`SELECT count(*)::int AS n FROM requests WHERE status = 'pending'`)).rows[0].n;
    const page = (title, active, body, { status = 200, error } = {}) => send(res, status, layout({
      title, viewer, active, body, waiting, flash: url.searchParams.get('m'), error: error ?? url.searchParams.get('e'),
    }));
    const hasExamples = async () => (await pool.query('SELECT EXISTS (SELECT 1 FROM tools WHERE example UNION ALL SELECT 1 FROM requests WHERE example) AS x')).rows[0].x;
    const all = async () => {
      const data = await loadAll();
      for (const t of data.tools) t.using = data.usersByTool.get(t.id) ?? 0;
      return data;
    };

    /* ---------- Overview ---------- */
    if (req.method === 'GET' && path === '/') {
      const { tools, usersByTool, requests } = await all();
      const mine = new Set((await pool.query('SELECT tool_id FROM tool_users WHERE email = $1', [viewer.email])).rows.map((r) => r.tool_id));
      return page('Overview', 'home', overview({
        viewer, today, tools, waiting,
        totals: totalsByCurrency(tools),
        categories: spendByCategory(tools),
        waste: wasteByCurrency(tools, usersByTool),
        coming: upcoming(tools, today, 60),
        attention: attention({ tools, usersByTool, requests, today }),
        mine: { using: tools.filter((t) => mine.has(t.id)), owning: tools.filter((t) => t.owner === viewer.email) },
        hasExamples: await hasExamples(),
      }));
    }

    /* ---------- The register ---------- */
    if (req.method === 'GET' && path === '/tools') {
      const { tools } = await all();
      const p = url.searchParams;
      const filters = {
        q: String(p.get('q') ?? '').trim().slice(0, 80),
        category: tools.some((t) => t.category === p.get('category')) ? p.get('category') : 'all',
        status: STATUSES.includes(p.get('status')) ? p.get('status') : 'all',
        sort: ['renewal', 'cost', 'name', 'waste'].includes(p.get('sort')) ? p.get('sort') : 'renewal',
      };
      const needle = filters.q.toLowerCase();
      const dateOf = (t) => (t.status === 'trial' ? t.trial_ends : nextRenewal(t.renews_on, t.billing, today)) ?? '9999';
      const shown = tools
        .filter((t) => filters.category === 'all' || t.category === filters.category)
        .filter((t) => filters.status === 'all' || t.status === filters.status)
        .filter((t) => !needle || [t.name, t.plan, t.category, t.owner ?? ''].some((v) => v.toLowerCase().includes(needle)))
        .sort({
          renewal: (a, b) => dateOf(a).localeCompare(dateOf(b)) || a.name.localeCompare(b.name),
          cost: (a, b) => a.currency.localeCompare(b.currency) || monthlyCents(b) - monthlyCents(a),
          name: (a, b) => a.name.localeCompare(b.name),
          waste: (a, b) => seatWaste(b, b.using).monthly - seatWaste(a, a.using).monthly || a.name.localeCompare(b.name),
        }[filters.sort]);
      return page('Tools', 'tools', register({ viewer, today, tools, shown, filters, hasExamples: await hasExamples() }));
    }

    if (path === '/tools/new') {
      if (!canEditRegister(viewer)) return redirect(res, withError('/requests/new', 'Only admins add tools to the register. Ask for it here and an admin will add it.'));
      if (req.method === 'GET') return page('Add a tool', 'tools', toolForm({ people: await people(), today }));
      const form = await readForm(req);
      const known = new Set((await people()).map((p) => p.email));
      const { error, values } = readTool(form, known);
      if (error) return page('Add a tool', 'tools', toolForm({ tool: values, people: await people(), today }), { status: 400, error });
      const tool = await insertTool(values, viewer.email);
      await record(tool.id, viewer.email, 'added');
      return redirect(res, withFlash(`/tools/${tool.id}`, `${tool.name} is in the register.`));
    }

    const t = path.match(/^\/tools\/(\d+)(?:\/([a-z/]+))?$/);
    if (t) {
      const tool = await loadTool(t[1]);
      if (!tool) return page('Not found', 'tools', notFound('No such tool', '/tools', 'All tools'), { status: 404 });
      const action = t[2];
      const back = (fallback) => (url.searchParams.get('back') === '/me' ? '/me' : fallback);

      if (req.method === 'GET' && !action) {
        const users = (await pool.query('SELECT email, since FROM tool_users WHERE tool_id = $1 ORDER BY since', [tool.id])).rows;
        const events = (await pool.query('SELECT * FROM events WHERE tool_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50', [tool.id])).rows;
        const requests = (await pool.query('SELECT * FROM requests WHERE tool_id = $1 ORDER BY created_at DESC LIMIT 20', [tool.id])).rows;
        return page(tool.name, 'tools', toolPage({ viewer, today, tool, users, events, requests, iUse: users.some((u) => u.email === viewer.email) }));
      }

      if (req.method === 'POST' && (action === 'use' || action === 'unuse')) {
        const form = await readForm(req);
        const to = form.get('back') === '/me' ? '/me' : `/tools/${tool.id}`;
        if (action === 'use') {
          const { rowCount } = await pool.query('INSERT INTO tool_users (tool_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING', [tool.id, viewer.email]);
          if (rowCount) await record(tool.id, viewer.email, 'joined');
          const over = tool.pricing === 'per_seat' && tool.seats_bought && tool.using + rowCount > tool.seats_bought;
          return redirect(res, withFlash(to, over
            ? `Marked. ${tool.name} now has more people than seats; an admin can see that on its page.`
            : `Marked: you use ${tool.name}.`));
        }
        const { rowCount } = await pool.query('DELETE FROM tool_users WHERE tool_id = $1 AND email = $2', [tool.id, viewer.email]);
        if (rowCount) await record(tool.id, viewer.email, 'left');
        return redirect(res, withFlash(to, `You're no longer marked as using ${tool.name}. That seat shows as unused.`));
      }

      if (!canEditRegister(viewer)) return redirect(res, withError(back(`/tools/${tool.id}`), 'Only admins change the register.'));

      if (action === 'edit') {
        if (req.method === 'GET') return page(`Edit ${tool.name}`, 'tools', toolForm({ tool, people: await people(), today }));
        const form = await readForm(req);
        const known = new Set((await people()).map((p) => p.email));
        const { error, values } = readTool(form, known);
        if (error) return page(`Edit ${tool.name}`, 'tools', toolForm({ tool: { ...values, id: tool.id }, people: await people(), today }), { status: 400, error });
        await pool.query(
          `UPDATE tools SET ${TOOL_COLUMNS.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
          [tool.id, ...TOOL_COLUMNS.map((c) => values[c])],
        );
        if (values.status !== tool.status) await record(tool.id, viewer.email, 'status', values.status === 'cancelling' ? 'Cancelling' : values.status === 'trial' ? 'Trial' : 'Active');
        else await record(tool.id, viewer.email, 'edited');
        return redirect(res, withFlash(`/tools/${tool.id}`, 'Saved.'));
      }
      if (req.method === 'POST' && action === 'delete') {
        await pool.query('DELETE FROM tools WHERE id = $1', [tool.id]);
        return redirect(res, withFlash('/tools', `${tool.name} is out of the register.`));
      }
      if (req.method === 'POST' && action === 'users/remove') {
        const email = String((await readForm(req)).get('email') ?? '');
        const { rowCount } = await pool.query('DELETE FROM tool_users WHERE tool_id = $1 AND email = $2', [tool.id, email]);
        if (rowCount) await record(tool.id, viewer.email, 'removed_user', email);
        return redirect(res, withFlash(`/tools/${tool.id}`, rowCount ? `Freed ${short(email)}'s seat.` : 'They were already off this tool.'));
      }
    }

    /* ---------- Requests ---------- */
    if (req.method === 'GET' && path === '/requests') {
      const requests = (await pool.query('SELECT * FROM requests ORDER BY created_at DESC LIMIT 300')).rows.map(numeric);
      const tab = ['waiting', 'decided', 'mine'].includes(url.searchParams.get('tab')) ? url.searchParams.get('tab') : 'waiting';
      return page('Requests', 'requests', requestsPage({ viewer, requests, tab, hasExamples: await hasExamples() }));
    }

    if (path === '/requests/new') {
      const tools = (await pool.query('SELECT * FROM tools ORDER BY lower(name)')).rows;
      if (req.method === 'GET') {
        const kind = url.searchParams.get('kind') === 'seat' ? 'seat' : 'new';
        return page('Request a tool', 'requests', requestForm({ kind, tools, toolId: url.searchParams.get('tool') }));
      }
      const form = await readForm(req);
      const kind = form.get('kind') === 'seat' ? 'seat' : 'new';
      const purpose = text(form, 'purpose', 600);
      const fail = (error, values) => page('Request a tool', 'requests', requestForm({ kind, tools, toolId: form.get('tool_id'), values }), { status: 400, error });

      let row;
      if (kind === 'seat') {
        const tool = tools.find((x) => String(x.id) === form.get('tool_id'));
        const seats = Number(form.get('seats') || 1);
        const values = { seats: form.get('seats'), purpose };
        if (!tool) return fail('Choose the tool you need a seat on.', values);
        if (tool.status === 'cancelling') return fail(`${tool.name} is being cancelled, so it isn't taking new seats.`, values);
        if (!Number.isInteger(seats) || seats < 1 || seats > 500) return fail('Seats must be a whole number from 1.', values);
        if (!purpose) return fail('Say what you need it for. It helps the admin decide quickly.', values);
        const dup = (await pool.query(`SELECT id FROM requests WHERE status = 'pending' AND requester = $1 AND tool_id = $2`, [viewer.email, tool.id])).rows[0];
        if (dup) return redirect(res, withError(`/requests/${dup.id}`, `You already asked for ${tool.name}. It's waiting here.`));
        row = { kind, tool_id: tool.id, tool_name: tool.name, category: tool.category, website: tool.website, purpose, pricing: tool.pricing, price_cents: Number(tool.price_cents), currency: tool.currency, billing: tool.billing, seats };
      } else {
        const cost = readCost(form, { seatsName: 'seats', priceRequired: false });
        const websiteRaw = text(form, 'website', 200);
        const values = { ...cost.values, tool_name: text(form, 'tool_name', 80), website: websiteRaw, category: text(form, 'category', 40), purpose, seats: form.get('seats') };
        if (!values.tool_name) return fail('Say which tool you want.', values);
        const existing = tools.find((x) => x.name.toLowerCase() === values.tool_name.toLowerCase());
        if (existing) return redirect(res, withError(`/requests/new?kind=seat&tool=${existing.id}`, `${existing.name} is already in the register. Ask for a seat on it instead.`));
        if (websiteRaw && !safeWebsite(websiteRaw)) return fail(`"${websiteRaw}" doesn't look like a web address. Try something like granola.ai.`, values);
        if (cost.error) return fail(cost.error, values);
        if (!purpose) return fail('Say what it is for. It helps the admin decide quickly.', values);
        const seats = cost.values.seats ?? 1;
        if (seats < 1) return fail('At least one person needs to use it.', values);
        row = { kind, tool_id: null, tool_name: values.tool_name, category: values.category || 'Other', website: safeWebsite(websiteRaw) ?? null, purpose, pricing: cost.values.pricing, price_cents: cost.values.price_cents, currency: cost.values.currency, billing: cost.values.billing, seats };
      }
      const { rows: [r] } = await pool.query(
        `INSERT INTO requests (kind, tool_id, tool_name, category, website, purpose, pricing, price_cents, currency, billing, seats, requester)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [row.kind, row.tool_id, row.tool_name, row.category, row.website, row.purpose, row.pricing, row.price_cents, row.currency, row.billing, row.seats, viewer.email],
      );
      const admins = await adminsToTell(viewer.email);
      let told = 0;
      for (const admin of admins) {
        const result = await notify({
          to: admin, kind: 'request',
          subject: `${short(viewer.email)} asked for ${r.kind === 'seat' ? 'a seat on ' : ''}${r.tool_name}`,
          text: `${viewer.email.split('@')[0]} asked for ${r.kind === 'seat' ? `${r.seats === 1 ? 'a seat' : `${r.seats} seats`} on ` : ''}${r.tool_name}. Approve or decline it in Tool Stack; the reason you give is shown to them.`,
          button: { label: 'Review the request', path: `/requests/${r.id}` },
          dedupeKey: `request-${r.id}-${admin}`,
        });
        if (result.sent) told += 1;
      }
      return redirect(res, withFlash(`/requests/${r.id}`, told
        ? 'Request sent. An admin has been emailed and will decide here.'
        : 'Request sent. Admins see it under Requests and will decide here.'));
    }

    const rq = path.match(/^\/requests\/(\d+)(?:\/(approve|decline|withdraw))?$/);
    if (rq) {
      const r = await loadRequest(rq[1]);
      if (!r) return page('Not found', 'requests', notFound('No such request', '/requests', 'All requests'), { status: 404 });
      const tool = r.tool_id ? await loadTool(r.tool_id) : undefined;
      const block = decisionBlock(viewer, r, await adminCount());

      if (req.method === 'GET' && !rq[2]) {
        const similar = r.kind === 'new' && r.status === 'pending'
          ? (await pool.query('SELECT id, name FROM tools WHERE lower(name) = lower($1) LIMIT 1', [r.tool_name])).rows[0] : undefined;
        const { tools } = await all();
        const related = tools.filter((x) => x.category === r.category && x.id !== r.tool_id).sort((a, b) => monthlyCents(b) - monthlyCents(a)).slice(0, 6);
        return page(r.tool_name, 'requests', requestPage({ viewer, today, request: r, tool, block, people: await people(), similar, related }));
      }
      if (req.method !== 'POST') return redirect(res, `/requests/${r.id}`);
      const form = await readForm(req);

      if (rq[2] === 'withdraw') {
        if (!canWithdraw(viewer, r)) return redirect(res, withError(`/requests/${r.id}`, 'Only the person who asked can withdraw a waiting request.'));
        await pool.query(`UPDATE requests SET status = 'withdrawn', decided_at = now() WHERE id = $1`, [r.id]);
        return redirect(res, withFlash('/requests?tab=mine', 'Request withdrawn.'));
      }
      if (block) return redirect(res, withError(`/requests/${r.id}`, block));

      let toolId = r.tool_id;
      let toolName = r.tool_name;
      if (rq[2] === 'decline') {
        const reason = text(form, 'reason', 600);
        if (!reason) return redirect(res, withError(`/requests/${r.id}`, `Give a reason. ${short(r.requester)} sees it, and it saves them asking again.`));
        await pool.query(`UPDATE requests SET status = 'declined', decided_by = $2, decided_at = now(), reason = $3 WHERE id = $1`, [r.id, viewer.email, reason]);
      } else if (r.kind === 'seat') {
        if (!tool) return redirect(res, withError(`/requests/${r.id}`, `${r.tool_name} is no longer in the register. Decline this one with a reason.`));
        const buy = Math.max(0, Math.min(500, Number.parseInt(form.get('buy') ?? '0', 10) || 0));
        if (buy && tool.pricing === 'per_seat') await pool.query('UPDATE tools SET seats_bought = COALESCE(seats_bought, 0) + $2, updated_at = now() WHERE id = $1', [tool.id, buy]);
        await pool.query('INSERT INTO tool_users (tool_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING', [tool.id, r.requester]);
        await pool.query(`UPDATE requests SET status = 'approved', decided_by = $2, decided_at = now(), reason = $3 WHERE id = $1`, [r.id, viewer.email, buy ? `${buy === 1 ? 'A new seat was' : `${buy} new seats were`} bought.` : 'Given a seat the team already pays for.']);
        await record(tool.id, viewer.email, 'seat_added', r.requester, r.id);
      } else {
        const known = new Set([...(await people()).map((p) => p.email), r.requester]);
        const { error, values } = readTool(form, known);
        if (error) return redirect(res, withError(`/requests/${r.id}`, error));
        const created = await insertTool(values, viewer.email);
        toolId = created.id;
        toolName = created.name;
        await pool.query('INSERT INTO tool_users (tool_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING', [created.id, r.requester]);
        await pool.query(`UPDATE requests SET status = 'approved', decided_by = $2, decided_at = now(), tool_id = $3 WHERE id = $1`, [r.id, viewer.email, created.id]);
        await record(created.id, viewer.email, 'approved', r.requester, r.id);
      }
      const approved = rq[2] === 'approve';
      if (r.requester !== viewer.email) {
        await notify({
          to: r.requester, kind: 'decision',
          subject: `Your request for ${r.tool_name} was ${approved ? 'approved' : 'declined'}`,
          text: approved
            ? `${short(viewer.email)} approved it, and you're marked as using ${toolName}.`
            : `${short(viewer.email)} declined it. The reason is on the request's page.`,
          button: { label: 'See the request', path: `/requests/${r.id}` },
          dedupeKey: `decision-${r.id}`,
        });
      }
      return redirect(res, approved
        ? withFlash(toolId ? `/tools/${toolId}` : '/requests', `Approved. ${short(r.requester)} is marked as using ${toolName}.`)
        : withFlash('/requests', `Declined. ${short(r.requester)} can see your reason.`));
    }

    /* ---------- Mine ---------- */
    if (req.method === 'GET' && path === '/me') {
      const { tools } = await all();
      const mine = new Set((await pool.query('SELECT tool_id FROM tool_users WHERE email = $1', [viewer.email])).rows.map((r) => r.tool_id));
      const requests = (await pool.query('SELECT * FROM requests WHERE requester = $1 ORDER BY created_at DESC', [viewer.email])).rows;
      return page('Your tools', 'me', minePage({
        viewer, today,
        using: tools.filter((x) => mine.has(x.id)),
        owning: tools.filter((x) => x.owner === viewer.email),
        others: tools.filter((x) => !mine.has(x.id) && x.status !== 'cancelling'),
        requests,
      }));
    }

    if (req.method === 'POST' && path === '/examples/remove') {
      if (!viewer.admin) return redirect(res, withError('/', 'Only admins remove the example data.'));
      await removeExamples();
      return redirect(res, withFlash('/', 'Example data removed. Everything your team added is still here.'));
    }

    page('Not found', '', notFound('Page not found', '/', 'Overview'), { status: 404 });
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    send(res, 500, 'Tool Stack is having trouble. Try again in a moment.', 'text/plain; charset=utf-8');
  }
});

setup().then(() => server.listen(port, '0.0.0.0', () => console.log(`tool stack listening on ${port}`)))
  .catch((error) => { console.error(error); process.exit(1); });
