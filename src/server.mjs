import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { Store } from './store.mjs';
import { exampleWorkspace } from './example.mjs';
import { createHandler } from './app.mjs';

const port = Number(process.env.PORT || 4317);
const store = new Store(process.env.ITER_DATA_DIR || fileURLToPath(new URL('../.data/', import.meta.url)), exampleWorkspace);
await store.init();
const server = http.createServer(createHandler(store));
server.listen(port, '127.0.0.1', () => console.log('Iter Prompt: http://127.0.0.1:' + port));
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'Port ' + port + ' is already in use. Set PORT in .env.' : error.message);
  process.exitCode = 1;
});
