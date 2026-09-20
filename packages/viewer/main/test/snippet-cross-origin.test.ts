/**
 * The snippet, loaded the way the docs show it: as a native ES module from
 * ANOTHER origin (jsDelivr in production; a local "CDN" here), into a plain
 * page. The regression this guards: every sibling the artifact needs — the
 * worker chunk, `embedpdf.wasm`, lazy chunks — must resolve relative to the
 * artifact's own folder and be fetched from that origin, and nowhere else.
 * A wasm URL computed against the wrong chunk, a CDN literal creeping into
 * the code, a missing CORS-safe sibling: all fail here, before they ship.
 *
 * Runs against the BUILT artifact (`pnpm build` first). Needs a Chromium:
 * Playwright's own (`npx playwright-core install chromium`, what CI does)
 * or a local Google Chrome as the fallback.
 */
import { createServer, get, type IncomingHttpHeaders, type Server } from 'node:http';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '..', 'dist');
const samplePdf = resolve(
  here,
  '..',
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'sample.pdf',
);

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.css': 'text/css',
  '.pdf': 'application/pdf',
  '.html': 'text/html',
};

/** A static server for one directory. `cors` = what a public CDN sends. */
function serveDirectory(root: string, cors: boolean, extra: Record<string, string> = {}): Server {
  // Snapshot trusted fixtures before accepting requests. Request URLs only
  // select in-memory assets; they never reach a filesystem operation.
  const assets = new Map<string, { body: Buffer; contentType: string }>();
  const add = (pathname: string, file: string) => {
    assets.set(pathname, {
      body: readFileSync(file),
      contentType: TYPES[extname(file)] ?? 'application/octet-stream',
    });
  };
  const walk = (directory: string, prefix: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      const pathname = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(file, pathname);
      // Do not follow symlinks, which could expose files outside the root.
      else if (entry.isFile()) add(pathname, file);
    }
  };
  if (existsSync(root)) walk(root, '');
  for (const [pathname, file] of Object.entries(extra)) add(pathname, file);

  return createServer((req, res) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const asset = assets.get(pathname);
    if (!asset) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': asset.contentType,
      ...(cors ? { 'access-control-allow-origin': '*' } : {}),
    });
    res.end(asset.body);
  });
}

const listen = (server: Server) =>
  new Promise<string>((ok) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      ok(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`);
    });
  });

describe('static fixture server', () => {
  let temporary: string;
  let server: Server;
  let extraOnly: Server;
  let origin: string;
  let extraOrigin: string;

  // Keep the path verbatim: fetch/URL would normalize away dot segments.
  const request = (base: string, path: string) =>
    new Promise<{ status: number | undefined; headers: IncomingHttpHeaders; body: string }>(
      (ok, reject) => {
        get(base, { path }, (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body }));
          res.on('error', reject);
        }).on('error', reject);
      },
    );

  beforeAll(async () => {
    temporary = mkdtempSync(join(tmpdir(), 'snippet-server-'));
    const root = join(temporary, 'dist');
    const sibling = join(temporary, 'dist-private');
    mkdirSync(join(root, 'chunks'), { recursive: true });
    mkdirSync(sibling);
    writeFileSync(join(root, 'chunks', 'lazy module.js'), 'export default 42;');
    writeFileSync(join(root, 'embedpdf.wasm'), 'wasm fixture');
    writeFileSync(join(root, 'sample.pdf'), 'overridden fixture');
    writeFileSync(join(sibling, 'secret.txt'), 'private fixture');
    const pdf = join(temporary, 'sample.pdf');
    writeFileSync(pdf, 'PDF fixture');
    symlinkSync(join(sibling, 'secret.txt'), join(root, 'linked.txt'));
    symlinkSync(sibling, join(root, 'linked-directory'), 'dir');
    const extra = { '/sample.pdf': pdf };
    server = serveDirectory(root, true, extra);
    origin = await listen(server);
    extraOnly = serveDirectory(join(temporary, 'missing'), false, extra);
    extraOrigin = await listen(extraOnly);
  });

  afterAll(async () => {
    for (const fixture of [server, extraOnly]) {
      if (fixture?.listening) await new Promise<void>((ok) => fixture.close(() => ok()));
    }
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  });

  it('serves nested and encoded assets with their MIME type and CORS headers', async () => {
    expect(await request(origin, '/chunks/lazy%20module.js?v=1')).toMatchObject({
      status: 200,
      headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' },
      body: 'export default 42;',
    });
    expect(await request(origin, '/embedpdf.wasm')).toMatchObject({
      status: 200,
      headers: { 'content-type': 'application/wasm' },
      body: 'wasm fixture',
    });
  });

  it('serves explicit extra files with or without a root directory', async () => {
    for (const base of [origin, extraOrigin]) {
      expect(await request(base, '/sample.pdf')).toMatchObject({
        status: 200,
        headers: { 'content-type': 'application/pdf' },
        body: 'PDF fixture',
      });
    }
    expect((await request(extraOrigin, '/sample.pdf')).headers).not.toHaveProperty(
      'access-control-allow-origin',
    );
  });

  it.each([
    '/../dist-private/secret.txt',
    '/%2e%2e%2fdist-private%2fsecret.txt',
    '/chunks/../../dist-private/secret.txt',
    '/..%5cdist-private%5csecret.txt',
    '/linked.txt',
    '/linked-directory/secret.txt',
    '/missing.js',
    '/chunks',
    '/__proto__',
    '/',
  ])('does not serve unlisted paths: %s', async (path) => {
    expect(await request(origin, path)).toMatchObject({ status: 404, body: '' });
  });

  it.each(['/%', '/%E0%A4%A'])('rejects malformed URL encoding: %s', async (path) => {
    expect(await request(origin, path)).toMatchObject({ status: 400, body: '' });
    expect((await request(origin, '/sample.pdf')).status).toBe(200);
  });
});

// Two loopback ports stand in for two origins; Chrome's local-network-access
// check would deny that cross-origin fetch (it prompts a real user), which
// is a harness artifact, not a property of the artifact under test.
const LAUNCH = { args: ['--disable-features=LocalNetworkAccessChecks'] };

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch(LAUNCH);
  } catch {
    return chromium.launch({ ...LAUNCH, channel: 'chrome' });
  }
}

describe('snippet from a foreign origin', () => {
  let cdn: Server;
  let site: Server;
  let cdnOrigin: string;
  let siteOrigin: string;
  let browser: Browser;

  beforeAll(async () => {
    expect(existsSync(join(dist, 'embedpdf.js')), 'run `pnpm build` first').toBe(true);
    cdn = serveDirectory(dist, true);
    cdnOrigin = await listen(cdn);
    // The customer's page: nothing of the artifact lives here — only the
    // (intercepted) HTML and the document it opens.
    site = serveDirectory(resolve(here, 'site'), false, { '/sample.pdf': samplePdf });
    siteOrigin = await listen(site);
    browser = await launch();
  });
  afterAll(async () => {
    await browser?.close();
    cdn?.close();
    site?.close();
  });

  it('renders, fetching every sibling from the artifact origin and nothing from anywhere else', async () => {
    const page = await browser.newPage();
    const requests: Array<{ url: string; status: number | null }> = [];
    const failures: string[] = [];
    const errors: string[] = [];
    page.on('response', (response) =>
      requests.push({ url: response.url(), status: response.status() }),
    );
    page.on('requestfailed', (request) =>
      failures.push(`${request.url()}: ${request.failure()?.errorText}`),
    );
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
    page.on('pageerror', (error) => errors.push(error.message));

    // The page the docs show, verbatim in shape: a container, one module import.
    const html = `<!doctype html><title>snippet</title>
<div id="pdf-viewer" style="height: 520px"></div>
<script type="module">
  import EmbedPDF from '${cdnOrigin}/embedpdf.js';
  EmbedPDF.init({ target: '#pdf-viewer', src: '/sample.pdf' });
</script>`;
    await page.route(`${siteOrigin}/`, (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    await page.goto(`${siteOrigin}/`);

    // Rendered = the chrome reports a page count for the opened document.
    try {
      await page.waitForFunction(
        () =>
          /Page 1 of \d+/.test(
            document.querySelector('embedpdf-viewer')?.shadowRoot?.textContent ?? '',
          ),
        null,
        { timeout: 60_000 },
      );
    } catch (error) {
      const shadowText = await page.evaluate(
        () =>
          document.querySelector('embedpdf-viewer')?.shadowRoot?.textContent?.slice(0, 400) ??
          '<no viewer element>',
      );
      throw new Error(
        `viewer did not render.\n shadow text: ${shadowText}\n requests: ${JSON.stringify(requests, null, 1)}\n failures: ${failures.join('; ')}\n console errors: ${errors.join('; ')}\n${String(error)}`,
      );
    }

    const wasm = requests.find((r) => r.url === `${cdnOrigin}/embedpdf.wasm`);
    expect(wasm?.status, 'embedpdf.wasm fetched from the artifact folder').toBe(200);
    const foreign = requests.filter(
      (r) => !r.url.startsWith(cdnOrigin) && !r.url.startsWith(siteOrigin),
    );
    expect(foreign, 'no request left the two origins').toEqual([]);
    expect(failures).toEqual([]);
    expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
    await page.close();
  });
});
