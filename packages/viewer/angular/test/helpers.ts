/**
 * What the browser tests share: one origin serving the built test pages (`global-setup.ts`
 * builds them) and a document, a Chromium (Playwright's own, or the local Google Chrome), the
 * page's errors, and the waits. The same as `@embedpdf/viewer-react`'s, with the warnings of
 * `<epdf-pdf-viewer>`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));

/** Where `global-setup.ts` builds the pages. */
export const pagesDist = join(here, 'pages', 'dist');
const samplePdf = resolve(here, '../../../../examples/engine-runtime-demo/public/sample.pdf');

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.css': 'text/css',
  '.map': 'application/json',
  '.pdf': 'application/pdf',
  '.html': 'text/html',
};

export interface PageHost {
  readonly origin: string;
  close(): Promise<void>;
}

/** Serve the built pages at the root and the document at `/sample.pdf`. */
export async function servePages(): Promise<PageHost> {
  const assets = new Map<string, { body: Buffer; type: string }>();
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
  walk(pagesDist, '');
  assets.set('/sample.pdf', { body: readFileSync(samplePdf), type: TYPES['.pdf']! });
  const server: Server = createServer((request, response) => {
    const pathname = decodeURIComponent((request.url ?? '/').split('?')[0]!);
    // The browser asks for an icon no page has.
    if (pathname === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    const asset = assets.get(pathname);
    if (!asset) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': asset.type }).end(asset.body);
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

/**
 * Errors with a cause outside the wrapper, which a test doesn't fail on: the measurement plugin
 * writes its state after the viewer closed it, when a page's viewports load ends with the
 * document gone (gap K8).
 */
const KNOWN = [/\[kernel\] PluginError: a state update after the instance closed/];

/**
 * What went wrong in a page: uncaught errors, console errors and failed requests, as they come.
 * `warnings` keeps the console warnings that name `<epdf-pdf-viewer>`.
 */
export function watchPage(page: Page): { errors: string[]; warnings: string[] } {
  const seen = { errors: [] as string[], warnings: [] as string[] };
  const error = (message: string) => {
    if (!KNOWN.some((known) => known.test(message))) seen.errors.push(message);
  };
  page.on('pageerror', (thrown) => error(`pageerror: ${thrown.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) error(`http ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') error(`console: ${message.text()}`);
    if (message.type() === 'warning' && message.text().includes('<epdf-pdf-viewer>')) {
      seen.warnings.push(message.text());
    }
  });
  return seen;
}

/** Whether `predicate` holds in the page within `timeout` (30 s), given `arg`. */
export function until<Arg extends string | number | boolean | undefined = undefined>(
  page: Page,
  predicate: (arg: Arg) => unknown,
  { arg, timeout = 30_000 }: { arg?: Arg; timeout?: number } = {},
): Promise<boolean> {
  // A plain value reaches the page as it is, which Playwright's type can't see for any `Arg`.
  return page
    .waitForFunction(predicate as (arg: unknown) => unknown, arg, { timeout })
    .then(() => true)
    .catch(() => false);
}
