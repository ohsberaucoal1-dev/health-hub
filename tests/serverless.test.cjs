const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createHandler } = require('../server');
const { Store } = require('../lib/store');
const key = 'serverless_test_key_'.padEnd(43, 's');
const payload = { source: 'Health Hub', fatigue_scale: { name: 'Source test', min: 0, max: 100 }, records: [{ date: '2026-09-07', fatigue: 42 }] };
function request(handler, url, body) {
  return new Promise((resolve, reject) => {
    const req = Readable.from([]);
    req.url = url; req.method = body === undefined ? 'GET' : 'POST'; req.body = body;
    req.headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); this.headersSent = true; }, end(text) { resolve({ status: this.status, body: JSON.parse(text) }); } };
    handler(req, res).catch(reject);
  });
}
test('serverless pre-parsed bodies and asynchronous storage return resolved data', async t => {
  const sqlite = new Store(':memory:'); t.after(() => sqlite.close());
  const store = Object.fromEntries(['ping', 'read', 'receive', 'status'].map(method => [method, async (...args) => sqlite[method](...args)]));
  const handler = createHandler({ clients: [{ id: 'serverless', api_key: key }], store });
  assert.equal((await request(handler, '/api/v1/records', payload)).body.inserted, 1);
  assert.equal((await request(handler, '/api/v1/records')).body.records[0].fatigue, 42);
  assert.equal((await request(handler, '/api/v1/status')).body.records_count, 1);
  assert.equal((await request(handler, '/api/v1/records', JSON.stringify(payload))).body.updated, 1);
  assert.equal((await request(handler, '/api/v1/records', '{')).status, 400);
});
test('pre-parsed oversized requests are rejected before writing', async t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  const handler = createHandler({ clients: [{ id: 'serverless', api_key: key }], store, maxBytes: 100 });
  assert.equal((await request(handler, '/api/v1/records', payload)).status, 413);
  assert.equal(store.read('serverless').records.length, 0);
});
