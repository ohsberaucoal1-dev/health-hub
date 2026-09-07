const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, timingSafeEqual } = require('node:crypto');
const { Store, ApiError } = require('./lib/store');
const root = __dirname;
const allowed = new Set(['index.html', 'style.css', 'app.js', 'landasan-riset-ke-desain-health-hub.md', 'ringkasan-jurnal-kelelahan-kualitas-tidur.md']);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
const digest = value => createHash('sha256').update(value).digest();
function parseClients(value) {
  let clients;
  try { clients = typeof value === 'string' ? JSON.parse(value) : value; } catch { throw Error('HEALTH_HUB_CLIENTS harus berupa JSON array.'); }
  if (!Array.isArray(clients) || !clients.length) throw Error('Konfigurasi HEALTH_HUB_CLIENTS belum tersedia. Jalankan npm run setup.');
  const ids = new Set(), keys = new Set();
  return clients.map(client => {
    if (!client || !/^[a-zA-Z0-9_-]{1,64}$/.test(client.id || '') || typeof client.api_key !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(client.api_key)) throw Error('Setiap profil memerlukan id (1–64 karakter) dan api_key acak minimal 32 karakter URL-safe.');
    if (ids.has(client.id) || keys.has(client.api_key)) throw Error('ID profil dan API key tidak boleh duplikat.');
    ids.add(client.id); keys.add(client.api_key);
    return { id: client.id, hash: digest(client.api_key) };
  });
}
function send(res, status, payload, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(payload));
}
function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [], failed = false;
    const fail = error => { if (!failed) { failed = true; chunks = []; reject(error); } };
    if (Number(req.headers['content-length']) > maxBytes) { fail(new ApiError(413, 'payload_too_large', 'Batas payload adalah 2 MB.')); req.resume(); return; }
    req.on('data', chunk => {
      if (failed) return;
      size += chunk.length;
      if (size > maxBytes) { fail(new ApiError(413, 'payload_too_large', 'Batas payload adalah 2 MB.')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { fail(new ApiError(400, 'invalid_json', 'Body harus berupa JSON valid.')); }
    });
    req.on('error', () => fail(new ApiError(400, 'request_error', 'Pengiriman data terputus.')));
    req.on('aborted', () => fail(new ApiError(400, 'request_aborted', 'Pengiriman data terputus.')));
  });
}
function createServer(options = {}) {
  const clients = parseClients(options.clients ?? process.env.HEALTH_HUB_CLIENTS);
  const store = new Store(options.databasePath ?? process.env.DATABASE_PATH ?? path.join(root, 'data', 'health-hub.sqlite'));
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { send(res, 400, { error: 'invalid_url' }); return; }
    try {
      if (url.pathname === '/api/health' && req.method === 'GET') {
        store.ping(); send(res, 200, { status: 'ok', service: 'health-hub', api_version: 1 }); return;
      }
      if (url.pathname.startsWith('/api/')) {
        const token = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(req.headers.authorization || '')?.[1];
        const hash = digest(token || '');
        const client = clients.find(c => timingSafeEqual(c.hash, hash));
        if (!token || !client) { send(res, 401, { error: 'unauthorized', message: 'API key tidak valid atau belum diberikan.' }, { 'WWW-Authenticate': 'Bearer' }); req.resume(); return; }
        if (url.pathname === '/api/v1/records' && req.method === 'GET') { send(res, 200, store.read(client.id, url.searchParams)); return; }
        if (url.pathname === '/api/v1/status' && req.method === 'GET') { send(res, 200, store.status(client.id)); return; }
        if (url.pathname === '/api/v1/records' && req.method === 'POST') {
          if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '') || (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')) {
            send(res, 415, { error: 'unsupported_media_type', message: 'Gunakan Content-Type: application/json tanpa kompresi.' }); req.resume(); return;
          }
          const payload = await readJson(req, options.maxBytes ?? 2 * 1024 * 1024);
          send(res, 200, store.receive(client.id, payload)); return;
        }
        if (['/api/v1/records', '/api/v1/status', '/api/health'].includes(url.pathname)) {
          send(res, 405, { error: 'method_not_allowed' }, { Allow: url.pathname === '/api/v1/records' ? 'GET, POST' : 'GET' }); return;
        }
        send(res, 404, { error: 'not_found' }); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { send(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, HEAD' }); return; }
      let file;
      try { file = decodeURIComponent(url.pathname).slice(1) || 'index.html'; } catch { send(res, 400, { error: 'invalid_url' }); return; }
      if (!allowed.has(file)) { send(res, 404, { error: 'not_found' }); return; }
      fs.readFile(path.join(root, file), (err, buffer) => {
        if (err) { send(res, 500, { error: 'file_unavailable' }); return; }
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)], 'Cache-Control': 'no-cache' });
        res.end(req.method === 'HEAD' ? undefined : buffer);
      });
    } catch (error) {
      if (!res.destroyed && !res.headersSent) send(res, error instanceof ApiError ? error.status : 500, { error: error instanceof ApiError ? error.code : 'internal_error', message: error instanceof ApiError ? error.message : 'Server gagal memproses data. Data yang belum tersimpan dapat dikirim ulang.' });
      if (!(error instanceof ApiError)) console.error('Health Hub: internal storage/request error.');
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 15000;
  server.on('close', () => store.close());
  return server;
}
if (require.main === module) {
  try {
    if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
    const server = createServer();
    const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 3000);
    server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} sedang digunakan. Hentikan server lama atau ubah PORT.` : 'Server gagal dijalankan.'); process.exit(1); });
    server.listen(port, host, () => console.log(`Health Hub API + dashboard: http://${host}:${server.address().port}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeIdleConnections(); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { createServer, parseClients };
