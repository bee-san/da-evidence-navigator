// Local server: the built site plus the api/ functions, as on Vercel.
//   npm run build && node scripts/serve.mjs
// Set EMAIL_DRY_RUN=1 to try "send it for me" without sending anything.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../_site/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png' };
const port = Number(process.env.PORT || 4173);

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const api = url.pathname.match(/^\/api\/([\w-]+)$/);
  if (api) {
    try {
      const mod = await import(`../api/${api[1]}.js`);
      const handler = mod[req.method];
      if (!handler) { res.writeHead(405); res.end(); return; }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(404); res.end(); }
    return;
  }
  const file = join(root, normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = await readFile(file.endsWith('/') ? join(file, 'index.html') : file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/check.html${process.env.EMAIL_DRY_RUN === '1' ? ' (email dry run)' : ''}`));
