import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const page = fileURLToPath(new URL('../public/index.html', import.meta.url));
const port = Number(process.env.PORT || 4317);
const server = http.createServer(async (request, response) => {
  if (request.url === '/api/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  try {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(await readFile(page));
  } catch {
    response.writeHead(500);
    response.end('Unable to read the application.');
  }
});
server.listen(port, '127.0.0.1', () => console.log('Iter Prompt: http://127.0.0.1:' + port));
