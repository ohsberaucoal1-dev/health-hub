const { createHandler } = require('../server');
let handler;
module.exports = async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) throw Error('Database not configured');
    handler ??= createHandler();
    return await handler(req, res);
  } catch {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'service_unavailable', message: 'Konfigurasi backend belum siap. Hubungi pengelola server.' }));
  }
};
