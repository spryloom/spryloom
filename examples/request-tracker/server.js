import { createServer } from 'node:http';
import { Pool } from 'pg';
import { canChangeStatus, isRequestStatus, signedInEmail } from './auth.js';

const port = Number(process.env.PORT ?? 8080);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const csv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

const person = (request) => signedInEmail(request.headers);
const mayChangeStatus = (request, item) => canChangeStatus(request.headers, item);

async function setup() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS requests (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
      assignee TEXT,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS comments (
      id BIGSERIAL PRIMARY KEY,
      request_id BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

const page = (request, rows, commentsByRequest, pageNumber, hasMore, message = '') => {
  const email = person(request);
  const cards = rows.map((item) => `<article class="card">
    <h2>#${item.id} ${escapeHtml(item.title)}</h2>
    <p>${escapeHtml(item.description)}</p>
    <p class="meta">${escapeHtml(item.status)} · ${escapeHtml(item.assignee ?? 'unassigned')} · by ${escapeHtml(item.created_by)}</p>
    ${(commentsByRequest.get(String(item.id)) ?? []).map((comment) => `<p class="comment"><strong>${escapeHtml(comment.author)}</strong> · ${escapeHtml(comment.body)}</p>`).join('')}
    <form method="post" action="/requests/${item.id}/comments"><label>Comment<textarea name="body" maxlength="2000" required></textarea></label><button>Add comment</button></form>
    ${mayChangeStatus(request, item) ? `<form method="post" action="/requests/${item.id}/status">
      <label>Status <select name="status"><option${item.status === 'open' ? ' selected' : ''}>open</option><option${item.status === 'in_progress' ? ' selected' : ''}>in_progress</option><option${item.status === 'done' ? ' selected' : ''}>done</option></select></label>
      <button>Update</button>
    </form>` : '<p class="meta">Only the assignee or an admin can update status.</p>'}
  </article>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Request Tracker</title>
  <style>body{max-width:48rem;margin:2rem auto;padding:0 1rem;font:16px system-ui;color:#17202b;background:#f5f7f9}.card,form{background:white;border:1px solid #d6dce4;border-radius:8px;padding:1rem;margin:1rem 0}input,textarea,select{display:block;width:100%;padding:.55rem;margin:.3rem 0 .8rem;box-sizing:border-box}button,.page-button{display:inline-block;padding:.55rem .8rem;border:1px solid #9ca8b5;border-radius:5px;background:white;color:#17202b;text-decoration:none;margin:.8rem .35rem .8rem 0}.meta{color:#5b6675;font-size:.9rem}</style></head><body>
  <p>Signed in as <strong>${escapeHtml(email ?? 'nobody')}</strong> · <a href="/export.csv">Download CSV export</a></p><h1>Request Tracker</h1>${message ? `<p>${escapeHtml(message)}</p>` : ''}
  <form method="post" action="/requests"><h2>New request</h2><label>Title<input name="title" required maxlength="160"></label><label>Description<textarea name="description" maxlength="4000"></textarea></label><label>Assign to (email)<input name="assignee" type="email"></label><button>Create request</button></form>
  ${cards || '<p>No requests yet.</p>'}
  ${(pageNumber > 1 || hasMore) ? `<nav aria-label="Request pages"><strong>Page ${pageNumber}</strong>${pageNumber > 1 ? ` <a class="page-button" href="/?page=${pageNumber - 1}">Previous page</a>` : ''}${hasMore ? ` <a class="page-button" href="/?page=${pageNumber + 1}">Next page</a>` : ''}</nav>` : ''}
  </body></html>`;
};

const readForm = async (request) => {
  const body = await new Promise((resolve, reject) => { let value = ''; request.on('data', (chunk) => { value += chunk; if (value.length > 16_384) reject(new Error('body too large')); }); request.on('end', () => resolve(value)); request.on('error', reject); });
  return new URLSearchParams(body);
};

const respond = (response, status, body, type = 'text/html; charset=utf-8') => { response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); response.end(body); };

const server = createServer(async (request, response) => {
  try {
    const email = person(request);
    if (email === undefined) return respond(response, 401, 'Sign in through Spryloom first.', 'text/plain; charset=utf-8');
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (request.method === 'GET' && url.pathname === '/') {
      const requestedPage = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
      const pageNumber = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
      const pageSize = 20;
      const { rows } = await pool.query(
        'SELECT * FROM requests ORDER BY updated_at DESC, id DESC LIMIT $1 OFFSET $2',
        [pageSize + 1, (pageNumber - 1) * pageSize],
      );
      const hasMore = rows.length > pageSize;
      const visible = rows.slice(0, pageSize);
      const comments = await Promise.all(visible.map(async (item) => [String(item.id), (await pool.query('SELECT author, body FROM comments WHERE request_id = $1 ORDER BY created_at ASC, id ASC', [item.id])).rows]));
      return respond(response, 200, page(request, visible, new Map(comments), pageNumber, hasMore));
    }
    if (request.method === 'GET' && url.pathname === '/export.csv') {
      const requests = (await pool.query('SELECT id, title, description, status, assignee, created_by, created_at, updated_at FROM requests ORDER BY id ASC')).rows;
      const comments = (await pool.query('SELECT request_id, author, body, created_at FROM comments ORDER BY id ASC')).rows;
      const lines = [
        ['type', 'request_id', 'title', 'description', 'status', 'assignee', 'created_by', 'author', 'body', 'created_at', 'updated_at'].map(csv).join(','),
        ...requests.map((item) => ['request', item.id, item.title, item.description, item.status, item.assignee, item.created_by, '', '', item.created_at, item.updated_at].map(csv).join(',')),
        ...comments.map((item) => ['comment', item.request_id, '', '', '', '', '', item.author, item.body, item.created_at, ''].map(csv).join(',')),
      ];
      return respond(response, 200, `${lines.join('\n')}\n`, 'text/csv; charset=utf-8');
    }
    if (request.method === 'POST' && url.pathname === '/requests') {
      const form = await readForm(request);
      const title = String(form.get('title') ?? '').trim();
      if (title === '') return respond(response, 400, 'A title is required.', 'text/plain; charset=utf-8');
      await pool.query('INSERT INTO requests (title, description, assignee, created_by) VALUES ($1, $2, $3, $4)', [title, String(form.get('description') ?? '').trim(), String(form.get('assignee') ?? '').trim().toLowerCase() || null, email]);
      response.writeHead(303, { location: '/' }); response.end(); return;
    }
    const statusMatch = url.pathname.match(/^\/requests\/(\d+)\/status$/);
    if (request.method === 'POST' && statusMatch) {
      const item = (await pool.query('SELECT * FROM requests WHERE id = $1', [statusMatch[1]])).rows[0];
      if (item === undefined) return respond(response, 404, 'Request not found.', 'text/plain; charset=utf-8');
      if (!mayChangeStatus(request, item)) return respond(response, 403, 'Only the assignee or an admin can update status.', 'text/plain; charset=utf-8');
      const form = await readForm(request);
      const status = String(form.get('status') ?? '');
      if (!isRequestStatus(status)) return respond(response, 400, 'Invalid status.', 'text/plain; charset=utf-8');
      await pool.query('UPDATE requests SET status = $1, updated_at = now() WHERE id = $2', [status, statusMatch[1]]);
      response.writeHead(303, { location: '/' }); response.end(); return;
    }
    const commentMatch = url.pathname.match(/^\/requests\/(\d+)\/comments$/);
    if (request.method === 'POST' && commentMatch) {
      const requestId = commentMatch[1];
      const exists = (await pool.query('SELECT 1 FROM requests WHERE id = $1', [requestId])).rowCount ?? 0;
      if (exists === 0) return respond(response, 404, 'Request not found.', 'text/plain; charset=utf-8');
      const form = await readForm(request);
      const body = String(form.get('body') ?? '').trim();
      if (body === '') return respond(response, 400, 'A comment is required.', 'text/plain; charset=utf-8');
      await pool.query('INSERT INTO comments (request_id, author, body) VALUES ($1, $2, $3)', [requestId, email, body]);
      response.writeHead(303, { location: '/' }); response.end(); return;
    }
    respond(response, 404, 'Not found.', 'text/plain; charset=utf-8');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'request failed');
    respond(response, 500, 'The request tracker is temporarily unavailable.', 'text/plain; charset=utf-8');
  }
});

setup().then(() => server.listen(port, '0.0.0.0')).catch((error) => { console.error(error); process.exit(1); });
