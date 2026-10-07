/**
 * Servidor estático mínimo para o build de produção (`dist/moneylog/browser`), usado pela suíte
 * E2E. Serve o service worker de verdade (localhost é contexto seguro) e faz fallback de SPA para
 * o `index.html`. Sem dependências: só `node:http`.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'dist', 'moneylog', 'browser');
const port = Number(process.env.E2E_DIST_PORT ?? 4300);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

if (!existsSync(join(root, 'index.html'))) {
  console.error(`Build não encontrado em ${root}. Rode "npm run build" antes.`);
  process.exit(1);
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = join(root, relative);
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  const isFile = existsSync(file) && statSync(file).isFile();
  if (!isFile) {
    // Arquivo com extensão que não existe é 404 de verdade; rota da SPA cai no index.html.
    if (extname(relative)) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    file = join(root, 'index.html');
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`dist servido em http://localhost:${port}`);
});
