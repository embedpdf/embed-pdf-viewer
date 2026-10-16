/**
 * The viewer under the strict Content Security Policy that
 * docs/content/viewer/concepts/security.mdx publishes, Trusted Types enforced,
 * in the two ways its folder is served: from the page's own origin
 * (`worker-src 'self'`), and from a CDN (the CDN's origin added to
 * `script-src` and `connect-src`, and `worker-src blob:`). A page must render,
 * and not one `securitypolicyviolation` may fire. In both, a signature typed in
 * each default handwriting font is saved with its font: the fonts come as lazy
 * chunks of the viewer's folder and go to the engine as bytes, so the policy
 * needs no `font-src`.
 *
 * Runs against the built artifact (`pnpm build` first). Needs a Chromium:
 * Playwright's own (`npx playwright-core install chromium`, what CI's engine
 * job installs) or the machine's Google Chrome as the fallback (what CI's
 * packages job runs).
 */
import { createServer, type Server } from 'node:http';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright-core';

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

/** The policy on the security page, directive by directive. */
const STRICT_POLICY: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'"],
  'style-src': ["'self'"],
  'worker-src': ["'self'"],
  'img-src': ["'self'", 'blob:', 'data:'],
  'connect-src': ["'self'"],
  'require-trusted-types-for': ["'script'"],
  'trusted-types': ['embedpdf'],
};

const policyText = (policy: Record<string, string[]>) =>
  Object.entries(policy)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.css': 'text/css',
  '.pdf': 'application/pdf',
  '.html': 'text/html',
};

type Asset = { body: Buffer; contentType: string };

/** Every file under `root`, keyed by its URL path under `prefix`. Symlinks are not followed. */
function filesOf(root: string, prefix: string): Map<string, Asset> {
  const assets = new Map<string, Asset>();
  const walk = (directory: string, path: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) walk(file, `${path}/${entry.name}`);
      else if (entry.isFile()) {
        assets.set(`${path}/${entry.name}`, {
          body: readFileSync(file),
          contentType: TYPES[extname(file)] ?? 'application/octet-stream',
        });
      }
    }
  };
  walk(root, prefix);
  return assets;
}

/** A static server for in-memory assets: request URLs only select an entry, never a file. */
function serve(
  assets: Map<string, Asset>,
  headers: Record<string, string>,
): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    const pathname = (request.url ?? '/').split('?')[0];
    const asset = assets.get(pathname === '/' ? '/index.html' : pathname);
    if (!asset) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': asset.contentType, ...headers });
    response.end(asset.body);
  });
  return new Promise((ok) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      ok({
        server,
        origin: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`,
      });
    });
  });
}

const text = (body: string, contentType: string): Asset => ({
  body: Buffer.from(body),
  contentType,
});

/**
 * The customer's page, as the policy allows it: no inline script, no inline style. Its script
 * imports the viewer from `viewerUrl` and opens the sample.
 */
function pageAssets(viewerUrl: string): Map<string, Asset> {
  return new Map([
    [
      '/index.html',
      text(
        '<!doctype html><title>strict CSP</title><link rel="icon" href="data:,">' +
          '<link rel="stylesheet" href="/page.css">' +
          '<div id="pdf-viewer"></div><script type="module" src="/main.js"></script>',
        'text/html',
      ),
    ],
    ['/page.css', text('#pdf-viewer { height: 520px; }', 'text/css')],
    [
      '/main.js',
      text(
        `import EmbedPDF from '${viewerUrl}';\n` +
          "EmbedPDF.init({ target: '#pdf-viewer', src: '/sample.pdf' });\n",
        'text/javascript',
      ),
    ],
    ['/sample.pdf', { body: readFileSync(samplePdf), contentType: 'application/pdf' }],
  ]);
}

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

/** True once the chrome shows the page count and a page picture has loaded. */
function pageRendered(): boolean {
  const root = document.querySelector('embedpdf-viewer')?.shadowRoot;
  if (!root || !/Page 1 of \d+/.test(root.textContent ?? '')) return false;
  return [...root.querySelectorAll('img')].some(
    (image) => image.src.startsWith('blob:') && image.complete && image.naturalWidth > 0,
  );
}

/** The default handwriting fonts, by their labels, and the name each embeds as. */
const SIGNATURE_FONTS = [
  { label: 'Allura', embedded: 'Allura' },
  { label: 'Great Vibes', embedded: 'GreatVibes' },
  { label: 'Caveat', embedded: 'Caveat' },
];

/**
 * Types a signature in each default handwriting font and saves it, as a person does in the
 * signature maker, and reports, per font, whether the saved library embeds the font.
 */
async function typeSignatures(page: Page): Promise<Record<string, boolean>> {
  const embedded: Record<string, boolean> = {};
  for (const font of SIGNATURE_FONTS) {
    const person = `Ada ${font.embedded}`;
    await page.evaluate(() =>
      (document.querySelector('embedpdf-viewer') as unknown as { viewer: any }).viewer
        .get('shell')
        .open('signature-maker', { exclusive: 'modal' }),
    );
    const dialog = page.locator('embedpdf-viewer [role="dialog"]');
    await dialog.waitFor({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Type' }).first().click();
    await dialog.locator('input').first().fill(person);
    await dialog.locator('select').first().selectOption({ label: font.label });
    await dialog.getByPlaceholder('Type your name').first().fill(person);
    await dialog
      .getByRole('button', { name: 'Save' })
      .click({ timeout: 15_000 })
      .catch(async () => {
        // Save waits for a name and a mark; say which of them the dialog has.
        const fields = await dialog.evaluate((element) => ({
          inputs: [...element.querySelectorAll('input')].map((input) => input.value),
          selects: [...element.querySelectorAll('select')].map((select) => select.value),
        }));
        throw new Error(
          `Save stayed disabled for ${font.label}, the dialog holding ${JSON.stringify(fields)}`,
        );
      });
    const library = await page.waitForFunction(
      (name) =>
        (document.querySelector('embedpdf-viewer') as unknown as { viewer: any }).viewer
          .get('stamp')
          .listLibraries({ kind: 'signatures' })
          .find(
            (each: { name: string; assetIds: string[] }) =>
              each.name === name && each.assetIds.length > 0,
          )?.id ?? null,
      person,
      { timeout: 20_000 },
    );
    embedded[font.label] = await page.evaluate(
      async ({ id, name }) => {
        const viewer = (document.querySelector('embedpdf-viewer') as unknown as { viewer: any })
          .viewer;
        const bytes: Uint8Array = await viewer.get('stamp').exportLibrary(id);
        const text = new TextDecoder('latin1').decode(bytes);
        return (
          new RegExp(`/FontName\\s*/[A-Z]{6}\\+${name}`).test(text) && text.includes('/FontFile2')
        );
      },
      { id: await library.jsonValue(), name: font.embedded },
    );
  }
  return embedded;
}

/**
 * Opens `url`, waits until a page has rendered (or, for the harness's own check, until a
 * violation is reported), does what `act` does there, waits a moment more for late work (the
 * thumbnails, the encoder workers), and reports what happened.
 */
async function openViewer<Acted = undefined>(
  browser: Browser,
  url: string,
  until: 'rendered' | 'violation' = 'rendered',
  act?: (page: Page) => Promise<Acted>,
) {
  const page = await browser.newPage();
  const violations: string[] = [];
  const errors: string[] = [];
  const failures: string[] = [];
  const requests: string[] = [];
  const workers: string[] = [];
  // Everything the page and its workers log, for the report when something fails.
  const logs: string[] = [];
  await page.exposeFunction('reportViolation', (violation: string) => violations.push(violation));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { reportViolation: (violation: string) => void })
        .reportViolation;
      report(
        `${event.effectiveDirective} blocked ${event.blockedURI || '(inline)'} at ` +
          `${event.sourceFile}:${event.lineNumber} ${event.sample}`,
      );
    });
  });
  page.on('console', (message) => {
    // The browser also logs each violation, including ones inside a worker.
    if (/Content Security Policy|Trusted ?Type/i.test(message.text()))
      violations.push(message.text());
    if (message.type() === 'error') errors.push(message.text());
    logs.push(`[${message.type()}] ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) =>
    failures.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  page.on('request', (request) => requests.push(request.url()));
  page.on('worker', (worker) => {
    workers.push(worker.url());
    worker.on('console', (message) => logs.push(`[worker ${message.type()}] ${message.text()}`));
  });

  /** What the page showed and said: the end of every failure's message. */
  const report = async () => {
    const shadowText = await page.evaluate(
      () => document.querySelector('embedpdf-viewer')?.shadowRoot?.textContent?.slice(0, 400) ?? '',
    );
    return [
      `browser: ${page.context().browser()?.version()}`,
      `shadow text: ${shadowText}`,
      `violations: ${violations.join('\n  ')}`,
      `errors: ${errors.join('\n  ')}`,
      `failures: ${failures.join('\n  ')}`,
      `console: ${logs.join('\n  ')}`,
    ]
      .map((line) => `\n ${line}`)
      .join('');
  };

  await page.goto(url);
  const deadline = Date.now() + 60_000;
  const done = async () =>
    until === 'violation' ? violations.length > 0 : await page.evaluate(pageRendered);
  while (!(await done())) {
    if (Date.now() > deadline) {
      throw new Error(
        `${until === 'violation' ? 'no violation reported' : 'no page rendered'}.${await report()}`,
      );
    }
    await page.waitForTimeout(100);
  }
  let acted: Acted | undefined;
  try {
    acted = act ? await act(page) : undefined;
  } catch (error) {
    throw new Error(`${(error as Error).message}${await report()}`);
  }
  await page.waitForTimeout(1500);
  await page.close();
  return { violations, errors, failures, requests, workers, acted };
}

describe('the viewer under the strict policy', () => {
  const servers: Server[] = [];
  let browser: Browser;

  beforeAll(async () => {
    expect(existsSync(join(dist, 'embedpdf.js')), 'run `pnpm build` first').toBe(true);
    browser = await launch();
  });
  afterAll(async () => {
    await browser?.close();
    for (const server of servers) server.close();
  });

  it("ships the engine's worker files in the folder, next to embedpdf.wasm", () => {
    for (const file of ['embedpdf.wasm', 'embedpdf-worker.js', 'encoder-worker.js']) {
      expect(existsSync(join(dist, file)), file).toBe(true);
    }
  });

  // The harness's own check: a policy the viewer can't run under is reported, not missed.
  it.each([
    ['refuses every worker', { 'worker-src': ["'none'"] }, /worker-src/],
    ['names another Trusted Types policy', { 'trusted-types': ['other'] }, /trusted-types/],
  ])('hears the violation of a policy that %s', async (_name, change, directive) => {
    const assets = pageAssets('/embedpdf/embedpdf.js');
    for (const [path, asset] of filesOf(dist, '/embedpdf')) assets.set(path, asset);
    const policy = { ...STRICT_POLICY, ...change };
    const site = await serve(assets, { 'content-security-policy': policyText(policy) });
    servers.push(site.server);

    const result = await openViewer(browser, `${site.origin}/`, 'violation');

    expect(result.violations.join('\n')).toMatch(directive);
  });

  it("renders from the page's own origin with worker-src 'self', types a signature in each default font, and nothing violates the policy", async () => {
    const assets = pageAssets('/embedpdf/embedpdf.js');
    for (const [path, asset] of filesOf(dist, '/embedpdf')) assets.set(path, asset);
    const site = await serve(assets, { 'content-security-policy': policyText(STRICT_POLICY) });
    servers.push(site.server);

    const result = await openViewer(browser, `${site.origin}/`, 'rendered', typeSignatures);

    expect(result.violations).toEqual([]);
    expect(result.acted).toEqual({ Allura: true, 'Great Vibes': true, Caveat: true });
    expect(
      result.requests.filter((request) => /\/chunks\/(allura|great-vibes|caveat)-/.test(request)),
    ).toHaveLength(3);
    expect(result.workers).toContain(`${site.origin}/embedpdf/embedpdf-worker.js`);
    expect(result.workers.every((worker) => worker.startsWith(`${site.origin}/embedpdf/`))).toBe(
      true,
    );
    expect(
      result.requests.filter(
        (request) => !request.startsWith(site.origin) && !request.startsWith('blob:'),
      ),
    ).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('renders from a CDN with the CDN variant (worker-src blob:), types a signature in each default font, and nothing violates the policy', async () => {
    // What a public CDN sends: the folder, with CORS, and no policy of its own.
    const cdn = await serve(filesOf(dist, ''), { 'access-control-allow-origin': '*' });
    servers.push(cdn.server);
    const policy = {
      ...STRICT_POLICY,
      'script-src': ["'self'", cdn.origin, "'wasm-unsafe-eval'"],
      'worker-src': ['blob:'],
      'connect-src': ["'self'", cdn.origin],
    };
    const site = await serve(pageAssets(`${cdn.origin}/embedpdf.js`), {
      'content-security-policy': policyText(policy),
    });
    servers.push(site.server);

    const result = await openViewer(browser, `${site.origin}/`, 'rendered', typeSignatures);

    expect(result.violations).toEqual([]);
    expect(result.acted).toEqual({ Allura: true, 'Great Vibes': true, Caveat: true });
    expect(
      result.requests.filter((request) =>
        new RegExp(`^${cdn.origin}/chunks/(allura|great-vibes|caveat)-`).test(request),
      ),
    ).toHaveLength(3);
    expect(result.workers.length).toBeGreaterThan(0);
    expect(result.workers.every((worker) => worker.startsWith('blob:'))).toBe(true);
    const foreign = result.requests.filter(
      (request) =>
        !request.startsWith(site.origin) &&
        !request.startsWith(cdn.origin) &&
        !request.startsWith('blob:'),
    );
    expect(foreign).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});
