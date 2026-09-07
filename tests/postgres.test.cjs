const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PostgresStore } = require('../lib/postgres-store');
test('real PostgreSQL: transactions, concurrent upserts, isolation, scale and reconnect', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const store = new PostgresStore(process.env.TEST_DATABASE_URL);
  const prefix = 'integration_' + randomUUID().replaceAll('-', '');
  const ids = [prefix + '_a', prefix + '_b'];
  await store.ping();
  t.after(async () => {
    // Delete only the random synthetic profiles owned by this test run.
    await store.pool.query('DELETE FROM hh_daily_records WHERE profile_id=ANY($1::text[])', [ids]);
    await store.pool.query('DELETE FROM hh_profiles WHERE id=ANY($1::text[])', [ids]);
    await store.close();
  });
  const p = { source: 'Health Hub', fatigue_scale: { name: 'Integration test scale', min: 0, max: 100 }, records: [{ date: '2026-09-07', fatigue: 42, sleep_minutes: 420 }] };
  assert.equal((await store.receive(ids[0], p)).inserted, 1);
  assert.equal((await store.read(ids[1])).records.length, 0);
  await Promise.all(Array.from({ length: 5 }, () => store.receive(ids[0], { source: 'Health Hub', records: [{ date: '2026-09-07', steps: 10 }] })));
  assert.equal((await store.status(ids[0])).records_count, 1);
  assert.equal((await store.read(ids[0])).records[0].fatigue, 42);
  await store.receive(ids[0], { source: 'Health Hub', records: [{ date: '2026-09-07', sleep_minutes: null }] });
  const before = await store.read(ids[0]);
  assert.equal(before.records[0].sleep_minutes, null);
  await assert.rejects(store.receive(ids[0], { ...p, records: [{ date: '2026-09-07', fatigue: 60 }, { date: '2026-09-08', fatigue: 200 }] }), error => error.status === 422);
  assert.deepEqual(await store.read(ids[0]), before);
  await assert.rejects(store.receive(ids[0], { ...p, fatigue_scale: { name: 'Wrong scale', min: 0, max: 100 } }), error => error.status === 409);
  const second = new PostgresStore(process.env.TEST_DATABASE_URL);
  try { assert.equal((await second.read(ids[0])).records[0].fatigue, 42); } finally { await second.close(); }
});
