/* ӨртБақылау — демо-сервер без зависимостей.
   Раздаёт панель и хранит опубликованные карточки для пожарных, чтобы их можно было
   открыть на телефоне в той же сети по QR. Запуск: node server.js  (порт: PORT, по умолчанию 8080) */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = +process.env.PORT || 8080;
const ROOT = __dirname;
const cards = new Map(); // token -> { expiresAt, data }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };

function lanIps() {
  const out = [];
  Object.values(os.networkInterfaces()).forEach((list) => (list || []).forEach((i) => { if (i.family === 'IPv4' && !i.internal) out.push(i.address); }));
  // сначала типичные домашние/офисные сети, виртуальные адаптеры (172.16–31.x) — в конце
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b));
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (p === '/api/ping') return json(res, 200, { ok: true, t: Date.now() });
  if (p === '/api/info') return json(res, 200, { ips: lanIps(), port: PORT });
  if (p === '/api/card' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end', () => {
      try {
        const { token, expiresAt, data } = JSON.parse(body);
        if (!/^[a-z0-9]{6,32}$/.test(token)) return json(res, 400, { error: 'bad token' });
        cards.set(token, { expiresAt: +expiresAt, data });
        json(res, 200, { ok: true });
      } catch (e) { json(res, 400, { error: 'bad json' }); }
    });
    return;
  }
  const m = p.match(/^\/api\/card\/([a-z0-9]{6,32})$/);
  if (m) {
    const c = cards.get(m[1]);
    if (!c) return json(res, 404, { error: 'not found' });
    if (Date.now() > c.expiresAt || (c.data && c.data.expired)) return json(res, 410, { expired: true });
    return json(res, 200, c.data);
  }
  // статика
  let file = path.normalize(path.join(ROOT, decodeURIComponent(p === '/' ? '/index.html' : p)));
  if (!file.startsWith(ROOT) || path.basename(file) === 'server.js') { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Не найдено'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('ӨртБақылау: панель оператора  http://localhost:' + PORT);
  lanIps().forEach((ip) => console.log('               в локальной сети  http://' + ip + ':' + PORT));
  console.log('Демо-сценарий сразу:          http://localhost:' + PORT + '/#demo');
});
