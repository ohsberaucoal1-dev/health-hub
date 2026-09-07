const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { createServer, parseClients } = require('../server');
const keyA = 'test_profile_a_'.padEnd(43, 'a'), keyB = 'test_profile_b_'.padEnd(43, 'b');
const clients = [{ id: 'alice', api_key: keyA }, { id: 'bob', api_key: keyB }];
const payload = () => ({ source: 'Health Hub', fatigue_scale: { name: 'Source index', min: 0, max: 100 }, records: [{ date: '2026-09-07', fatigue: 42, sleep_minutes: 405, steps: 0, resting_hr: 64 }] });
async function open(t, options = {}) {
  const server = createServer({ clients, databasePath: ':memory:', ...options });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const close = () => new Promise(resolve => { if (!server.listening) return resolve(); server.close(resolve); server.closeAllConnections(); });
  t.after(close);
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (url, { key = keyA, body, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) => {
    const response = await fetch(base + url, { method, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const result = await response.json(); return { status: response.status, headers: response.headers, body: result };
  };
  return { request, close, base };
}
test('startup requires valid independent profile keys', () => {
  for (const invalid of [undefined, 'bad-json', [], [{ id: 'alice', api_key: 'short' }], [clients[0], clients[0]], [clients[0], { id: 'bob', api_key: keyA }]]) assert.throws(() => parseClients(invalid));
  assert.equal(parseClients(clients).length, 2);
});
test('public health check, authenticated reads/writes, and private file isolation', async t => {
  const { request } = await open(t);
  assert.equal((await request('/api/health', { key: null })).status, 200);
  for (const key of [null, 'wrong_key'.padEnd(43, 'z')]) {
    assert.equal((await request('/api/v1/records', { key })).status, 401);
    assert.equal((await request('/api/v1/records', { key, body: payload() })).status, 401);
  }
  assert.equal((await request('/api/v1/records')).body.records.length, 0);
  for (const url of ['/.env', '/data/health-hub.sqlite', '/lib/store.js', '/.git/config', '/package.json']) assert.equal((await request(url)).status, 404);
  assert.equal((await request('/api/v1/records')).headers.get('cache-control'), 'no-store');
});
test('POST persists exact source values; retries upsert and profile data stays isolated', async t => {
  const { request } = await open(t);
  const first = await request('/api/v1/records', { body: payload() });
  assert.equal(first.status, 200); assert.equal(first.body.inserted, 1);
  const again = await request('/api/v1/records', { body: payload() });
  assert.equal(again.body.inserted, 0); assert.equal(again.body.updated, 1);
  const read = (await request('/api/v1/records')).body;
  assert.deepEqual(read.records, payload().records); assert.deepEqual(read.fatigue_scale, payload().fatigue_scale);
  assert.equal(read.sync.records_count, 1); assert.ok(read.sync.received_at);
  assert.equal((await request('/api/v1/records', { key: keyB })).body.records.length, 0);
  assert.equal((await request('/api/v1/records?profile_id=alice', { key: keyB })).status, 400);
});
test('partial updates preserve omitted metrics and explicit null clears a metric', async t => {
  const { request } = await open(t);
  await request('/api/v1/records', { body: payload() });
  const update = { source: 'Health Hub', records: [{ date: '2026-09-07', steps: 100, sleep_minutes: null }] };
  assert.equal((await request('/api/v1/records', { body: update })).status, 200);
  const [row] = (await request('/api/v1/records')).body.records;
  assert.equal(row.fatigue, 42); assert.equal(row.steps, 100); assert.equal(row.sleep_minutes, null); assert.equal(row.resting_hr, 64);
});
test('invalid batch is atomic and does not change existing records or timestamps', async t => {
  const { request } = await open(t);
  await request('/api/v1/records', { body: payload() });
  const before = (await request('/api/v1/records')).body;
  const bad = payload(); bad.records[0].fatigue = 70; bad.records.push({ date: '2026-09-08', fatigue: 101 });
  assert.equal((await request('/api/v1/records', { body: bad })).status, 422);
  assert.deepEqual((await request('/api/v1/records')).body, before);
});
test('source scale conflict, missing scale, demo data and duplicates are rejected', async t => {
  const { request } = await open(t);
  const noScale = payload(); delete noScale.fatigue_scale;
  assert.equal((await request('/api/v1/records', { body: noScale })).status, 422);
  const demo = payload(); demo.export_mode = 'demo';
  assert.equal((await request('/api/v1/records', { body: demo })).status, 422);
  const duplicate = payload(); duplicate.records.push(duplicate.records[0]);
  assert.equal((await request('/api/v1/records', { body: duplicate })).status, 422);
  await request('/api/v1/records', { body: payload() });
  const conflict = payload(); conflict.fatigue_scale.name = 'Other instrument';
  assert.equal((await request('/api/v1/records', { body: conflict })).status, 409);
  assert.equal((await request('/api/v1/records')).body.fatigue_scale.name, 'Source index');
});
test('date filtering is inclusive and malformed query parameters are rejected', async t => {
  const { request } = await open(t);
  const p = payload(); p.records.push({ ...p.records[0], date: '2026-09-08' });
  await request('/api/v1/records', { body: p });
  assert.equal((await request('/api/v1/records?from=2026-09-08&to=2026-09-08')).body.records.length, 1);
  for (const query of ['from=2026-02-30', 'from=', 'from=2026-09-09&to=2026-09-07', 'from=2026-09-07&from=2026-09-08', 'token=not-allowed']) assert.equal((await request('/api/v1/records?' + query)).status, 400);
});
test('invalid JSON, large bodies, media types and unsupported methods have explicit errors', async t => {
  const { request } = await open(t, { maxBytes: 1024 });
  assert.equal((await request('/api/v1/records', { body: '{' })).status, 400);
  assert.equal((await request('/api/v1/records', { body: 'x'.repeat(2048) })).status, 413);
  assert.equal((await request('/api/v1/records', { body: payload(), headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await request('/api/v1/records', { method: 'DELETE' })).status, 405);
});
test('SQLite data survives server restart', async t => {
  const parent = path.resolve(__dirname, '../tmp-tests'); fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, 'api-'));
  t.after(() => { const target = path.resolve(directory); if (path.dirname(target) !== parent) throw Error('Unexpected cleanup target'); fs.rmSync(target, { recursive: true, force: true }); });
  const databasePath = path.join(directory, 'test.sqlite');
  const first = await open(t, { databasePath });
  await first.request('/api/v1/records', { body: payload() }); await first.close();
  const second = await open(t, { databasePath });
  assert.equal((await second.request('/api/v1/records')).body.records[0].fatigue, 42);
  await second.close();
});
