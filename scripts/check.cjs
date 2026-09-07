const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
// Build-time tests must never inherit production profile keys or DATABASE_URL.
const environment = { ...process.env };
for (const key of ['DATABASE_URL', 'DATABASE_PATH', 'HEALTH_HUB_CLIENTS', 'VERCEL']) delete environment[key];
const tests = fs.readdirSync(path.join(root, 'tests')).filter(file => file.endsWith('.test.cjs')).map(file => path.join('tests', file));
for (const args of [['--check', 'app.js'], ['--check', 'server.js'], ['--test', ...tests]]) {
  const result = spawnSync(process.execPath, args, { cwd: root, env: environment, stdio: 'inherit' });
  if (result.error || result.status !== 0) { process.exitCode = result.status || 1; break; }
}
