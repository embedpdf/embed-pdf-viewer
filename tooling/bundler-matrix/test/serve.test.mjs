import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { serve } from '../serve.mjs';

// Send paths verbatim; fetch/URL would normalize away traversal segments.
function request(origin, path, accept = '*/*') {
  return new Promise((ok, reject) => {
    get(origin, { path, headers: { accept } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () =>
        ok({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
      );
      res.on('error', reject);
    }).on('error', reject);
  });
}

describe('bundler matrix static server', () => {
  let temporary;
  let server;
  let origin;
  const index = '<!doctype html><title>app</title>';
  const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);

  before(async () => {
    temporary = mkdtempSync(join(tmpdir(), 'bundler-matrix-server-'));
    const root = join(temporary, 'dist');
    const sibling = join(temporary, 'dist-private');
    mkdirSync(join(root, 'chunks'), { recursive: true });
    mkdirSync(join(root, 'nested'));
    mkdirSync(sibling);
    writeFileSync(join(root, 'index.html'), index);
    writeFileSync(join(root, 'nested', 'index.html'), 'nested index');
    writeFileSync(join(root, 'chunks', 'lazy module.mjs'), 'export default "€";');
    writeFileSync(join(root, 'embedpdf.wasm'), wasm);
    writeFileSync(join(sibling, 'secret.txt'), 'private fixture');
    writeFileSync(join(temporary, 'secret.txt'), 'private fixture');
    symlinkSync(join(sibling, 'secret.txt'), join(root, 'linked.txt'));
    symlinkSync(sibling, join(root, 'linked-directory'), 'dir');
    ({ server, origin } = await serve(root));
  });

  after(async () => {
    if (server?.listening) await new Promise((ok) => server.close(ok));
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  });

  it('serves encoded nested assets with MIME types and byte-accurate content lengths', async () => {
    const response = await request(origin, '/chunks/lazy%20module.mjs?v=1');
    assert.equal(response.status, 200);
    assert.equal(response.body.toString(), 'export default "€";');
    assert.equal(response.headers['content-type'], 'text/javascript');
    assert.equal(Number(response.headers['content-length']), response.body.length);
    const binary = await request(origin, '/embedpdf.wasm');
    assert.equal(binary.status, 200);
    assert.deepEqual(binary.body, wasm);
    assert.equal(binary.headers['content-type'], 'application/wasm');
    assert.equal(Number(binary.headers['content-length']), wasm.length);
  });

  it('serves root and nested directory indexes with or without trailing slashes', async () => {
    for (const path of ['/', '/index.html', '/nested', '/nested/', '/nested/index.html']) {
      const response = await request(origin, path);
      assert.equal(response.status, 200, path);
      assert.equal(response.body.toString(), path.startsWith('/nested') ? 'nested index' : index);
      assert.equal(response.headers['content-type'], 'text/html');
    }
  });

  it('falls back to the app index only for HTML navigations', async () => {
    for (const path of ['/client/route', '/chunks']) {
      const response = await request(origin, path, 'text/html,application/xhtml+xml');
      assert.equal(response.status, 200);
      assert.equal(response.body.toString(), index);
      assert.equal(response.headers['content-type'], 'text/html');
      assert.equal((await request(origin, path)).status, 404);
    }
    const missingWasm = await request(origin, '/wrong/embedpdf.wasm');
    assert.equal(missingWasm.status, 404);
    assert.equal(missingWasm.body.length, 0);
  });

  for (const path of [
    '/../secret.txt',
    '/../dist-private/secret.txt',
    '/%2e%2e%2fdist-private%2fsecret.txt',
    '/chunks/../../dist-private/secret.txt',
    '/..%5cdist-private%5csecret.txt',
    '/linked.txt',
    '/linked-directory/secret.txt',
    '/__proto__',
  ]) {
    it(`does not expose files outside the asset set: ${path}`, async () => {
      const response = await request(origin, path);
      assert.equal(response.status, 404);
      assert.equal(response.body.length, 0);
      const navigation = await request(origin, path, 'text/html');
      assert.equal(navigation.status, 200);
      assert.equal(navigation.body.toString(), index);
    });
  }

  for (const path of ['/%', '/%E0%A4%A']) {
    it(`returns 400 for malformed encoding and keeps serving: ${path}`, async () => {
      assert.equal((await request(origin, path)).status, 400);
      assert.equal((await request(origin, '/')).status, 200);
    });
  }

  it('returns 404 when a navigation has no root index to fall back to', async (t) => {
    const root = join(temporary, 'no-index');
    mkdirSync(root);
    const fixture = await serve(root);
    t.after(() => new Promise((ok) => fixture.server.close(ok)));
    assert.equal((await request(fixture.origin, '/missing', 'text/html')).status, 404);
  });
});
