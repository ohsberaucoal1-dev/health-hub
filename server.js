const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const allowed = new Set(['index.html', 'style.css', 'app.js', 'landasan-riset-ke-desain-health-hub.md', 'ringkasan-jurnal-kelelahan-kualitas-tidur.md']);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  let file;
  try { file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html'; } catch (_) { res.writeHead(400); res.end('Bad request'); return; }
  if (!allowed.has(file)) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(root, file), (err, buffer) => {
    if (err) { res.writeHead(500); res.end('Unable to read file'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)], 'X-Content-Type-Options': 'nosniff' }); res.end(buffer);
  });
});
server.listen(Number(process.env.PORT) || 3000, '127.0.0.1', () => console.log(`Health Hub: http://localhost:${server.address().port}`));
