/**
 * What the browser tests that put the built snippet on a host page share: one
 * origin serving the artifact, the test's pages, a document and a font; a
 * Chromium (Playwright's own, or the local Google Chrome); and the waits.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));

/** The built artifact the tests load. */
export const dist = resolve(here, '..', '..', 'dist');
const samplePdf = resolve(here, '../../../../../examples/engine-runtime-demo/public/sample.pdf');
const fontFile = resolve(here, '..', '..', 'public', 'fonts', 'Roboto-Regular.ttf');

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.pdf': 'application/pdf',
  '.ttf': 'font/ttf',
  '.html': 'text/html',
};

export interface ViewerHost {
  readonly origin: string;
  close(): Promise<void>;
}

/**
 * Serve `dist` at the root, `/sample.pdf`, `/fonts/brand.ttf` and each page by
 * its path. The files are read once; a request only selects one of them.
 */
export async function serveViewer(pages: Readonly<Record<string, string>>): Promise<ViewerHost> {
  const assets = new Map<string, { body: Buffer | string; type: string }>();
  const walk = (directory: string, prefix: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) walk(file, `${prefix}/${entry.name}`);
      else if (entry.isFile()) {
        const type = TYPES[extname(file)] ?? 'application/octet-stream';
        assets.set(`${prefix}/${entry.name}`, { body: readFileSync(file), type });
      }
    }
  };
  walk(dist, '');
  assets.set('/sample.pdf', { body: readFileSync(samplePdf), type: TYPES['.pdf']! });
  assets.set('/fonts/brand.ttf', { body: readFileSync(fontFile), type: TYPES['.ttf']! });
  for (const [path, html] of Object.entries(pages)) {
    assets.set(path, { body: html, type: TYPES['.html']! });
  }
  const server: Server = createServer((request, response) => {
    const asset = assets.get((request.url ?? '/').split('?')[0]!);
    if (!asset) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': asset.type });
    response.end(asset.body);
  });
  const origin = await new Promise<string>((ok) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      ok(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`);
    });
  });
  return { origin, close: () => new Promise<void>((ok) => server.close(() => ok())) };
}

export async function launchChromium(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: 'chrome' });
  }
}

/** Wait until the viewer shows the opened document: the chrome reports its page count. */
export function waitForDocument(page: Page): Promise<unknown> {
  return page.waitForFunction(
    () =>
      /Page 1 of \d+/.test(
        document.querySelector('embedpdf-viewer')?.shadowRoot?.textContent ?? '',
      ),
    null,
    { timeout: 60_000 },
  );
}

/** Let the viewer render and run its effects: two frames. */
export function frames(page: Page): Promise<unknown> {
  return page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}
