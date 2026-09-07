const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const filename = path.join(__dirname, '..', '.env');
const key = randomBytes(32).toString('base64url');
try {
  fs.writeFileSync(filename, `HOST=127.0.0.1\nPORT=3000\nDATABASE_PATH=./data/health-hub.sqlite\nHEALTH_HUB_CLIENTS='${JSON.stringify([{ id: 'personal', api_key: key }])}'\n`, { flag: 'wx', mode: 0o600 });
  console.log('Konfigurasi lokal dibuat di .env. Salin api_key dari file tersebut ke aplikasi Health Hub dan menu Sumber data. Jangan unggah .env ke GitHub.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('.env sudah ada; konfigurasi dan API key tidak diubah.');
  else { console.error('Gagal membuat konfigurasi lokal.'); process.exitCode = 1; }
}
