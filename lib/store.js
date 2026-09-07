const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { validate } = require('../app');
const fields = ['fatigue', 'sleep_minutes', 'steps', 'resting_hr'];
class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
class Store {
  constructor(filename) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
    this.db = new DatabaseSync(filename, { timeout: 5000 });
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, scale TEXT, received_at TEXT);
      CREATE TABLE IF NOT EXISTS daily_records (
        profile_id TEXT NOT NULL REFERENCES profiles(id), date TEXT NOT NULL,
        fatigue REAL, sleep_minutes REAL, steps INTEGER, resting_hr REAL,
        updated_at TEXT NOT NULL, PRIMARY KEY(profile_id, date)
      ); PRAGMA user_version=1;`);
  }
  ping() { this.db.prepare('SELECT 1').get(); }
  close() { this.db.close(); }
  status(id) {
    const profile = this.db.prepare('SELECT received_at FROM profiles WHERE id=?').get(id);
    const stats = this.db.prepare('SELECT COUNT(*) AS count, MAX(date) AS latest_date FROM daily_records WHERE profile_id=?').get(id);
    return { profile_id: id, records_count: stats.count, latest_date: stats.latest_date, received_at: profile?.received_at ?? null };
  }
  read(id, params = new URLSearchParams()) {
    for (const key of params.keys()) if (!['from', 'to'].includes(key) || params.getAll(key).length !== 1) throw new ApiError(400, 'invalid_query', 'Parameter yang didukung: from dan to, masing-masing satu tanggal.');
    const from = params.get('from'), to = params.get('to');
    if ((from !== null && !validDate(from)) || (to !== null && !validDate(to)) || (from && to && from > to)) throw new ApiError(400, 'invalid_date_range', 'Gunakan rentang tanggal YYYY-MM-DD dengan from tidak melebihi to.');
    const profile = this.db.prepare('SELECT scale FROM profiles WHERE id=?').get(id);
    const records = this.db.prepare('SELECT date, fatigue, sleep_minutes, steps, resting_hr FROM daily_records WHERE profile_id=? AND date>=? AND date<=? ORDER BY date').all(id, from || '0000-01-01', to || '9999-12-31');
    return { source: 'Health Hub', fatigue_scale: profile?.scale ? JSON.parse(profile.scale) : null, records, sync: this.status(id) };
  }
  receive(id, raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError(422, 'validation_error', 'Payload harus berupa objek.');
    if (raw.export_mode === 'demo' || raw.fatigue_scale?.name === 'Indeks ilustrasi (demo)') throw new ApiError(422, 'demo_not_allowed', 'Data demo tidak boleh dikirim ke penyimpanan kesehatan asli.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const profile = this.db.prepare('SELECT scale FROM profiles WHERE id=?').get(id);
      const existingScale = profile?.scale ? JSON.parse(profile.scale) : null;
      let payload;
      try { payload = validate({ ...raw, fatigue_scale: raw.fatigue_scale ?? existingScale }); }
      catch (error) { throw new ApiError(422, 'validation_error', error.message); }
      if (existingScale && JSON.stringify(payload.fatigue_scale) !== JSON.stringify(existingScale)) throw new ApiError(409, 'scale_conflict', 'Skala fatigue berbeda dari riwayat profil. Gunakan profil baru untuk instrumen berbeda.');
      const get = this.db.prepare('SELECT date, fatigue, sleep_minutes, steps, resting_hr FROM daily_records WHERE profile_id=? AND date=?');
      const incoming = new Map(raw.records.map(r => [r.date, r]));
      let inserted = 0, updated = 0;
      const merged = payload.records.map(record => {
        const previous = get.get(id, record.date);
        if (previous) updated++; else inserted++;
        const source = incoming.get(record.date);
        // Omitted metrics preserve previous values; explicit null clears them.
        return Object.fromEntries([['date', record.date], ...fields.map(field => [field, Object.hasOwn(source, field) ? record[field] : previous?.[field] ?? null])]);
      });
      const count = this.db.prepare('SELECT COUNT(*) AS count FROM daily_records WHERE profile_id=?').get(id).count;
      if (count + inserted > 3660) throw new ApiError(409, 'history_limit', 'Batas penyimpanan profil 3.660 tanggal. Hubungi pengelola server untuk pengarsipan.');
      const receivedAt = new Date().toISOString();
      this.db.prepare('INSERT INTO profiles(id,scale,received_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET scale=excluded.scale, received_at=excluded.received_at').run(id, payload.fatigue_scale ? JSON.stringify(payload.fatigue_scale) : null, receivedAt);
      const upsert = this.db.prepare(`INSERT INTO daily_records(profile_id,date,fatigue,sleep_minutes,steps,resting_hr,updated_at) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(profile_id,date) DO UPDATE SET fatigue=excluded.fatigue,sleep_minutes=excluded.sleep_minutes,steps=excluded.steps,resting_hr=excluded.resting_hr,updated_at=excluded.updated_at`);
      for (const record of merged) upsert.run(id, record.date, ...fields.map(field => record[field]), receivedAt);
      this.db.exec('COMMIT');
      return { accepted: merged.length, inserted, updated, received_at: receivedAt, profile_id: id };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
module.exports = { Store, ApiError };
