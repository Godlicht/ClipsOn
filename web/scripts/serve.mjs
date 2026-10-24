import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const production = process.argv.includes('--production');
const root = resolve(production ? 'dist' : '.');
const port = Number(process.env.PORT || 5173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    let content;
    try { content = await readFile(file); }
    catch (error) {
      if (production || error.code !== 'ENOENT') throw error;
      const asset = resolve(root, 'public', '.' + pathname);
      if (!asset.startsWith(resolve(root, 'public') + sep)) throw error;
      content = await readFile(asset);
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(content);
  } catch { res.writeHead(404).end('Nie znaleziono strony.'); }
}).listen(port, '127.0.0.1', () => console.log(`ClipsON: http://127.0.0.1:${port}`));
