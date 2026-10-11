// usage: node cdp.js shot out.png | eval "<js>" | click "<selector>"
const http = require('http');
const fs = require('fs');
const get = (u) => new Promise((r, j) => http.get(u, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => r(JSON.parse(d))); }).on('error', j));
(async () => {
  const tabs = await get('http://127.0.0.1:9333/json'); const page = tabs.find((t) => t.type === 'page' && t.url.includes('renderer/index.html'));
  const ws = new WebSocket(page.webSocketDebuggerUrl); let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  await new Promise((r) => (ws.onopen = r));
  const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'shot') { const r = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(arg, Buffer.from(r.result.data, 'base64')); console.log('saved', arg); }
  else if (cmd === 'eval') { const r = await call('Runtime.evaluate', { expression: arg, awaitPromise: true, returnByValue: true }); console.log(JSON.stringify(r.result.result.value !== undefined ? r.result.result.value : r.result.exceptionDetails || r.result.result)); }
  ws.close();
})();
