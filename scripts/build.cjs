const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
fs.mkdirSync(output, { recursive: true });
const assets = ['index.html', 'app.js', 'style.css', 'landasan-riset-ke-desain-health-hub.md', 'ringkasan-jurnal-kelelahan-kualitas-tidur.md'];
for (const file of assets) fs.copyFileSync(path.join(root, file), path.join(output, file));
// Fail closed if a previous build left unexpected public files.
for (const file of fs.readdirSync(output)) if (!assets.includes(file)) throw Error('Unexpected file in dist; review output before deployment.');
console.log('Built 5 public assets. Credentials, source backend and database are excluded.');
