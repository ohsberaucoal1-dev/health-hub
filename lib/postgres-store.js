const { Pool } = require('pg');
const { validate } = require('../app');
const { ApiError } = require('./errors');
const fields = ['fatigue', 'sleep_minutes', 'steps', 'resting_hr'];
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
class PostgresStore {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000, allowExitOnIdle: true });
    this.pool.on('error', () => console.error('Health Hub: database connection error.'));
    this.ready = null;
  }
  async initialize() {
    if (!this.ready) this.ready = this.migrate().catch(error => { this.ready = null; throw error; });
    return this.ready;
  }
  async migrate() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('health-hub-schema-v1'))");
      await client.query(`CREATE TABLE IF NOT EXISTS hh_profiles (id TEXT PRIMARY KEY, scale JSONB, received_at TEXT);
        CREATE TABLE IF NOT EXISTS hh_daily_records (
          profile_id TEXT NOT NULL REFERENCES hh_profiles(id), date TEXT NOT NULL,
          fatigue DOUBLE PRECISION, sleep_minutes DOUBLE PRECISION, steps DOUBLE PRECISION,
          resting_hr DOUBLE PRECISION, updated_at TEXT NOT NULL, PRIMARY KEY(profile_id,date)
        );`);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async close() { await this.pool.end(); }
  async ping() { await this.initialize(); await this.pool.query('SELECT 1'); }
  async status(id, client = this.pool) {
    await this.initialize();
    const { rows: [row] } = await client.query(`SELECT COUNT(*)::int AS records_count, MAX(date) AS latest_date,
      (SELECT received_at FROM hh_profiles WHERE id=$1) AS received_at FROM hh_daily_records WHERE profile_id=$1`, [id]);
    return { profile_id: id, ...row };
  }
  async read(id, params = new URLSearchParams()) {
    for (const key of params.keys()) if (!['from', 'to'].includes(key) || params.getAll(key).length !== 1) throw new ApiError(400, 'invalid_query', 'Parameter yang didukung: from dan to, masing-masing satu tanggal.');
    const from = params.get('from'), to = params.get('to');
    if ((from !== null && !validDate(from)) || (to !== null && !validDate(to)) || (from && to && from > to)) throw new ApiError(400, 'invalid_date_range', 'Gunakan rentang tanggal YYYY-MM-DD dengan from tidak melebihi to.');
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const { rows: [profile] } = await client.query('SELECT scale FROM hh_profiles WHERE id=$1', [id]);
      const { rows: records } = await client.query('SELECT date,fatigue,sleep_minutes,steps,resting_hr FROM hh_daily_records WHERE profile_id=$1 AND date>=$2 AND date<=$3 ORDER BY date', [id, from || '0000-01-01', to || '9999-12-31']);
      const sync = await this.status(id, client);
      await client.query('COMMIT');
      return { source: 'Health Hub', fatigue_scale: profile?.scale ?? null, records, sync };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async receive(id, raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError(422, 'validation_error', 'Payload harus berupa objek.');
    if (raw.export_mode === 'demo' || raw.fatigue_scale?.name === 'Indeks ilustrasi (demo)') throw new ApiError(422, 'demo_not_allowed', 'Data demo tidak boleh dikirim ke penyimpanan kesehatan asli.');
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Lock by profile, including the first write, across all function instances.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['health-hub-profile:' + id]);
      const { rows: [profile] } = await client.query('SELECT scale FROM hh_profiles WHERE id=$1', [id]);
      const existingScale = profile?.scale ?? null;
      let payload;
      try { payload = validate({ ...raw, fatigue_scale: raw.fatigue_scale ?? existingScale }); }
      catch (error) { throw new ApiError(422, 'validation_error', error.message); }
      if (existingScale && ['name', 'min', 'max'].some(key => payload.fatigue_scale?.[key] !== existingScale[key])) throw new ApiError(409, 'scale_conflict', 'Skala fatigue berbeda dari riwayat profil. Gunakan profil baru untuk instrumen berbeda.');
      const { rows } = await client.query('SELECT date,fatigue,sleep_minutes,steps,resting_hr FROM hh_daily_records WHERE profile_id=$1', [id]);
      const previous = new Map(rows.map(row => [row.date, row]));
      const incoming = new Map(raw.records.map(row => [row.date, row]));
      let inserted = 0, updated = 0;
      const merged = payload.records.map(record => {
        const old = previous.get(record.date), source = incoming.get(record.date);
        if (old) updated++; else inserted++;
        return Object.fromEntries([['date', record.date], ...fields.map(field => [field, Object.hasOwn(source, field) ? record[field] : old?.[field] ?? null])]);
      });
      if (rows.length + inserted > 3660) throw new ApiError(409, 'history_limit', 'Batas penyimpanan profil 3.660 tanggal. Hubungi pengelola server untuk pengarsipan.');
      const receivedAt = new Date().toISOString();
      await client.query('INSERT INTO hh_profiles(id,scale,received_at) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET scale=EXCLUDED.scale,received_at=EXCLUDED.received_at', [id, payload.fatigue_scale ? JSON.stringify(payload.fatigue_scale) : null, receivedAt]);
      await client.query(`INSERT INTO hh_daily_records(profile_id,date,fatigue,sleep_minutes,steps,resting_hr,updated_at)
        SELECT $1,date,fatigue,sleep_minutes,steps,resting_hr,$3 FROM jsonb_to_recordset($2::jsonb)
        AS rows(date TEXT,fatigue DOUBLE PRECISION,sleep_minutes DOUBLE PRECISION,steps DOUBLE PRECISION,resting_hr DOUBLE PRECISION)
        ON CONFLICT(profile_id,date) DO UPDATE SET fatigue=EXCLUDED.fatigue,sleep_minutes=EXCLUDED.sleep_minutes,
        steps=EXCLUDED.steps,resting_hr=EXCLUDED.resting_hr,updated_at=EXCLUDED.updated_at`, [id, JSON.stringify(merged), receivedAt]);
      await client.query('COMMIT');
      return { accepted: merged.length, inserted, updated, received_at: receivedAt, profile_id: id };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
module.exports = { PostgresStore };
