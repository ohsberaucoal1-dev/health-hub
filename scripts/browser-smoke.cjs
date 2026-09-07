// Optional browser integration check: Node 24+ and a local Chrome installation.
const { createServer } = require('../server');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run() {
  const executable = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (!fs.existsSync(executable)) throw Error('Set CHROME_PATH to a Chrome executable.');
  const key = 'browser_test_key_'.padEnd(43, 'a');
  const server = createServer({ clients: [{ id: 'browser-test', api_key: key }], databasePath: ':memory:' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const parent = path.resolve(__dirname, '../tmp-tests'); fs.mkdirSync(parent, { recursive: true });
  const profile = fs.mkdtempSync(path.join(parent, 'browser-'));
  const browser = spawn(executable, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let ws;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    let port;
    for (let i = 0; !port && i < 80; i++) {
      try { const candidate = fs.readFileSync(portFile, 'utf8').split('\n')[0]; if (/^\d+$/.test(candidate)) port = candidate; } catch {}
      if (!port) await sleep(250);
    }
    if (!port) throw Error('Chrome debugging endpoint unavailable.');
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const tab = tabs.find(item => item.type === 'page' && item.url === 'about:blank');
    if (!tab) throw Error('Chrome test page was not created.');
    ws = new WebSocket(tab.webSocketDebuggerUrl); await once(ws, 'open');
    let sequence = 0; const pending = new Map();
    ws.addEventListener('message', event => { const msg = JSON.parse(event.data); if (pending.has(msg.id)) { const { resolve, reject, timer } = pending.get(msg.id); clearTimeout(timer); pending.delete(msg.id); msg.error ? reject(Error(msg.error.message)) : resolve(msg.result); } });
    const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(Error(`Timed out: ${method}`)); }, 10000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => { const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.text); return result.result.value; };
    const waitFor = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(100); } const state = await evaluate("JSON.stringify({url:location.href,title:document.title,text:document.body?.innerText?.slice(0,300)})"); throw Error(`UI condition failed: ${expression} ${state}`); };
    await cdp('Page.enable'); await cdp('Page.navigate', { url: base + '/#connection' });
    await waitFor("document.readyState === 'complete' && !!document.getElementById('api-form')");
    const send = async fatigue => {
      const response = await fetch(base + '/api/v1/records', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'Health Hub', fatigue_scale: { name: 'Browser test instrument', min: 0, max: 100 }, records: [{ date: '2026-09-07', fatigue, sleep_minutes: 420, steps: 6000, resting_hr: 64 }] }) });
      assert.equal(response.status, 200);
    };
    await send(42);
    await evaluate(`document.getElementById('api-key').value=${JSON.stringify(key)}; document.getElementById('api-form').requestSubmit();`);
    await waitFor("document.getElementById('mode-label').textContent === 'Data server' && document.getElementById('fatigue-value').textContent === '42'");
    assert.equal(await evaluate("localStorage.getItem('healthhub-data-v1')"), null);
    assert.equal(await evaluate("document.getElementById('api-key').value"), '');
    await send(77); await evaluate("document.getElementById('refresh-api').click()");
    await waitFor("document.getElementById('fatigue-value').textContent === '77'");
    await evaluate("location.hash='dashboard'");
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
    await evaluate("location.hash='connection'");
    await evaluate("document.getElementById('disconnect-api').click()");
    await waitFor("document.getElementById('fatigue-value').textContent === '—'");
    await evaluate(`document.getElementById('api-key').value=${JSON.stringify('invalid_key_'.padEnd(43, 'b'))}; document.getElementById('api-form').requestSubmit();`);
    await waitFor("document.getElementById('api-message').classList.contains('error')");
    assert.equal(await evaluate("document.getElementById('fatigue-value').textContent"), '—');
    console.log('Browser checks passed: API connect, exact score, refresh, no local persistence, disconnect, rejected key, mobile width.');
    await cdp('Browser.close').catch(() => {});
  } finally {
    ws?.close(); browser.kill(); await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    // Profiles contain synthetic test state only and stay under ignored tmp-tests/.
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
