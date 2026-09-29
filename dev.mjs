import http from 'node:http';
import { readFile } from 'node:fs/promises';
import handler from './api/game.js';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const portIndex = process.argv.indexOf('--port');
const port = Number((portIndex >= 0 ? process.argv[portIndex + 1] : null) || process.env.PORT || 3000);
http.createServer(async (req, res) => {
  if (req.url === '/api/game') {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 4096) { res.writeHead(413).end(); return; } }
    req.body = body;
    res.status = function(code) { this.statusCode = code; return this; };
    res.json = function(data) { this.setHeader('Content-Type', 'application/json'); this.end(JSON.stringify(data)); };
    return handler(req, res);
  }
  const name = new URL(req.url, 'http://localhost').pathname;
  const allowed = ['index.html', 'style.css', 'app.js', 'favicon.svg'];
  const file = name === '/' ? 'index.html' : name.slice(1);
  if (!allowed.includes(file)) { res.writeHead(404).end('Não encontrado'); return; }
  try { res.setHeader('Content-Type', types[file.slice(file.lastIndexOf('.'))]); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
}).listen(port, '0.0.0.0', () => console.log('Servidor Quem eu sou? iniciado.'));
