/**
 * zod stays off the page. The viewer predicts what a write will do without validating it; the
 * engine checks every write in its worker, so the schemas and zod come in the worker's script
 * and nowhere else on a page that has one. Checked on the CDN snippet, by every script a page
 * fetches, and on an app that installs the viewer from npm, by the chunks its first load
 * imports, as Vite builds them. Without a `Worker` the engine runs in the page from one
 * self-contained chunk, zod inside it, and the document still opens.
 *
 * zod is known by issue codes only it reports. Runs against the built viewer (`pnpm build`
 * first).
 */
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Browser } from 'playwright-core';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  dist,
  launchChromium,
  serveViewer,
  waitForDocument,
  type ViewerHost,
} from './helpers/viewer-host';

const ZOD_MARKERS = ['invalid_intersection_types', 'not_multiple_of'];

const holdsZod = (text: string): boolean => ZOD_MARKERS.some((marker) => text.includes(marker));

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<title>no zod</title>
<style>body { margin: 0; } #viewer { height: 700px; }</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', theme: 'light' });
</script>
</body></html>`;

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('zod on the snippet’s page', () => {
  let host: ViewerHost;
  let browser: Browser;

  beforeAll(async () => {
    host = await serveViewer({ '/no-zod.html': PAGE });
    browser = await launchChromium();
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('comes only in the worker’s script', async () => {
    const page = await browser.newPage();
    const scripts: { path: string; text: string }[] = [];
    const reads: Promise<unknown>[] = [];
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (!path.endsWith('.js')) return;
      reads.push(
        response
          .text()
          .then((text) => scripts.push({ path, text }))
          .catch(() => {}),
      );
    });
    const workers: string[] = [];
    page.on('worker', (worker) => workers.push(new URL(worker.url()).pathname));
    await page.goto(`${host.origin}/no-zod.html`);
    await waitForDocument(page);
    // The panels and dialogs the viewer fetches once the document shows.
    await page.waitForTimeout(1500);
    await Promise.all(reads);
    const holding = scripts.filter(({ text }) => holdsZod(text)).map(({ path }) => path);
    expect(workers).toContain('/embedpdf-worker.js');
    expect(holding).toEqual(['/embedpdf-worker.js']);
    await page.close();
  });
});

/** The chunks a built page's first load imports: its entry scripts and their static imports. */
function firstLoadChunks(outDir: string): Map<string, string> {
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  const chunks = new Map<string, string>();
  const visit = (file: string) => {
    if (chunks.has(file)) return;
    const text = readFileSync(join(outDir, 'assets', file), 'utf8');
    chunks.set(file, text);
    const imports = text.matchAll(
      /(?:import|export)[^"'()]*?from\s*["']\.\/([^"']+\.js)["']|import\s*["']\.\/([^"']+\.js)["']/g,
    );
    for (const [, from, bare] of imports) visit((from ?? bare)!);
  };
  for (const [, file] of html.matchAll(/<script[^>]*src="\/assets\/([^"]+\.js)"/g)) visit(file!);
  return chunks;
}

describe.skipIf(!existsSync(join(dist, 'index.js')))('zod in an npm app’s first load', () => {
  let app: string;
  let outDir: string;

  beforeAll(async () => {
    app = realpathSync(mkdtempSync(join(tmpdir(), 'viewer-npm-app-')));
    outDir = join(app, 'dist');
    writeFileSync(
      join(app, 'index.html'),
      '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="viewer"></div>' +
        '<script type="module" src="./main.js"></script></body></html>',
    );
    writeFileSync(
      join(app, 'main.js'),
      "import EmbedPDF from '@embedpdf/viewer';\nEmbedPDF.init({ target: '#viewer', src: '/sample.pdf' });\n",
    );
    // An app's production build, as its bundler resolves the viewer's packages.
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await build({
        root: app,
        configFile: false,
        logLevel: 'silent',
        mode: 'production',
        resolve: { alias: [{ find: /^@embedpdf\/viewer$/, replacement: join(dist, 'index.js') }] },
        build: { outDir, emptyOutDir: true, chunkSizeWarningLimit: 100_000 },
      });
    } finally {
      process.env.NODE_ENV = nodeEnv;
    }
  });

  afterAll(() => {
    if (app) rmSync(app, { recursive: true, force: true });
  });

  it('is only in the chunk an engine with no Worker loads, and the document opens', async () => {
    const { origin, close } = await serveDirectory(outDir);
    const browser = await launchChromium();
    try {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        delete (window as { Worker?: unknown }).Worker;
      });
      const scripts: { path: string; text: string }[] = [];
      const reads: Promise<unknown>[] = [];
      page.on('response', (response) => {
        const path = new URL(response.url()).pathname;
        if (!path.endsWith('.js')) return;
        reads.push(
          response
            .text()
            .then((text) => scripts.push({ path, text }))
            .catch(() => {}),
        );
      });
      await page.goto(`${origin}/index.html`);
      await waitForDocument(page);
      await Promise.all(reads);
      const holding = scripts.filter(({ text }) => holdsZod(text)).map(({ path }) => path);
      expect(holding).toHaveLength(1);
      const firstLoad = [...firstLoadChunks(outDir).keys()].map((file) => `/assets/${file}`);
      expect(firstLoad).not.toContain(holding[0]);
    } finally {
      await browser.close();
      await close();
    }
  });

  it('is in no chunk the first load imports, only in the engine’s worker', () => {
    const chunks = firstLoadChunks(outDir);
    expect(chunks.size).toBeGreaterThan(0);
    expect([...chunks].filter(([, text]) => holdsZod(text)).map(([file]) => file)).toEqual([]);
    const worker = readdirSync(join(outDir, 'assets')).find((file) =>
      /^embedpdf-worker-.+\.js$/.test(file),
    );
    expect(worker).toBeDefined();
    expect(holdsZod(readFileSync(join(outDir, 'assets', worker!), 'utf8'))).toBe(true);
  });
});

const samplePdf = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../examples/engine-runtime-demo/public/sample.pdf',
);
const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.html': 'text/html',
};

/** Serve a built app at the root, and `/sample.pdf`. */
async function serveDirectory(directory: string) {
  const server: Server = createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0]!;
    const file = path === '/sample.pdf' ? samplePdf : join(directory, path);
    if (!existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  const origin = await new Promise<string>((ok) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      ok(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`);
    });
  });
  return { origin, close: () => new Promise<void>((ok) => server.close(() => ok())) };
}
