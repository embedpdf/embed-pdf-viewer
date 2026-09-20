import { createServer } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const TYPES = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.html': 'text/html',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.pdf': 'application/pdf',
};

export function serve(root) {
  // Snapshot the build output before accepting requests. URLs only select
  // in-memory assets; they never reach a filesystem operation.
  const assets = new Map();
  const walk = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      const pathname = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(file, pathname);
      // Do not follow symlinks, which could expose files outside the root.
      else if (entry.isFile()) {
        assets.set(pathname, {
          body: readFileSync(file),
          contentType: TYPES[extname(file)] ?? 'application/octet-stream',
        });
      }
    }
    const index = assets.get(`${prefix}/index.html`);
    if (index) {
      assets.set(prefix || '/', index);
      if (prefix) assets.set(`${prefix}/`, index);
    }
  };
  walk(root, '');

  const server = createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let asset = assets.get(pathname);
    // SPA-style fallback for NAVIGATIONS only — a missing asset must 404, or a
    // wrong wasm URL would be answered with HTML and the failure misread.
    const navigation = (req.headers.accept ?? '').includes('text/html');
    if (!asset && navigation) asset = assets.get('/index.html');
    if (!asset) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': asset.contentType,
      'content-length': asset.body.length,
    });
    res.end(asset.body);
  });
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () =>
      ok({ server, origin: `http://127.0.0.1:${server.address().port}` }),
    ),
  );
}
