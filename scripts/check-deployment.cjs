const { spawnSync } = require('node:child_process');
const { parseClients } = require('../server');
if (process.env.VERCEL_ENV === 'production' || process.env.DATABASE_URL) {
  try {
    if (!process.env.DATABASE_URL) throw Error('DATABASE_URL belum dikonfigurasi untuk produksi.');
    // Verify the managed database inside Vercel; never download its credentials.
    // The integration test deletes only the random synthetic profiles it creates.
    const result = spawnSync(process.execPath, ['--test', 'tests/postgres.test.cjs'], {
      cwd: require('node:path').resolve(__dirname, '..'),
      env: { ...process.env, TEST_DATABASE_URL: process.env.DATABASE_URL },
      stdio: 'inherit'
    });
    if (result.error || result.status !== 0) process.exitCode = result.status || 1;
    parseClients(process.env.HEALTH_HUB_CLIENTS);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
} else {
  console.log('Database deployment check skipped: non-production environment without DATABASE_URL.');
}
