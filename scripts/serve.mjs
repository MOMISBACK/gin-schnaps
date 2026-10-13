import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const port = Number(process.env.PORT || 4173);
const html = await readFile(new URL('../dist/index.html', import.meta.url));
createServer((request, response) => {
  if (request.url !== '/' && request.url !== '/index.html') { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(html);
}).listen(port, '127.0.0.1', () => console.log(`Gin Schnaps: http://127.0.0.1:${port}`));
