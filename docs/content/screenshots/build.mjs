/**
 * Takes the screenshots of the examples that open on a page of their own (`<Example name
 * size="page">`, `pageExamples` in ../scripts/sync.mjs). An example's docs page shows its picture,
 * which links to that page, so the picture is the page: Chrome opens `/examples/<slug>` on a
 * running embedpdf.com, with the example 1440 by 900, and takes the example alone. It lands in
 * both sites' `public/screenshots/<name>.webp`, since an example looks the same on both.
 *
 *   pnpm --filter @embedpdf/website dev                         # or `next start` after a build
 *   pnpm --filter @embedpdf/docs-content screenshots            # every example
 *   pnpm --filter @embedpdf/docs-content screenshots reader     # one
 *
 * `SITE_URL` names another site than http://localhost:3100. Chrome is the installed Google
 * Chrome; `CHROME_PATH` names another.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import { pageExamples, SCREENSHOTS_DIR } from '../scripts/sync.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SITES = [resolve(here, '../../../website'), resolve(here, '../../../cloudpdf/website')];
const site = process.env.SITE_URL ?? 'http://localhost:3100';
const chrome =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// The example as a laptop shows it, and the picture's width: sharp in the docs column on a
// high-density screen.
const EXAMPLE = { width: 1440, height: 900 };
const PICTURE_WIDTH = 1600;
// Once the pages are drawn: time for the last tiles to fade in.
const SETTLE_MS = 2000;

const requested = process.argv.slice(2);
const examples = pageExamples('local').filter(
  ({ slug }) => requested.length === 0 || requested.includes(slug),
);
for (const slug of requested) {
  if (!examples.some((example) => example.slug === slug)) {
    throw new Error(`No example '${slug}' opens on a page of its own`);
  }
}

const browser = await chromium.launch({ executablePath: chrome });
try {
  for (const { name, slug } of examples) {
    const context = await browser.newContext({ viewport: { width: EXAMPLE.width, height: 1200 } });
    const tab = await context.newPage();
    const errors = [];
    tab.on('pageerror', (error) => errors.push(error.message));
    tab.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await tab.goto(`${site}/examples/${slug}`, { timeout: 120_000 });
    // The example fills the window below the site's header and the page's bar: make it 900 tall,
    // and open it again at that size.
    const example = tab.locator('[data-example]');
    const above = await example.evaluate((element) => element.getBoundingClientRect().top);
    await tab.setViewportSize({ width: EXAMPLE.width, height: above + EXAMPLE.height });
    await tab.reload();
    await tab.locator('[data-example] [data-demo="loaded"]').waitFor({ timeout: 120_000 });
    await tab.waitForLoadState('networkidle');
    // Next's own button, on a site that runs `next dev`.
    await tab.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await tab.waitForTimeout(SETTLE_MS);
    if (errors.length) throw new Error(`${name}: ${errors.join('\n')}`);

    // Chrome draws the clip at its scale, so the picture is as sharp as it's big.
    const box = await example.boundingBox();
    const session = await context.newCDPSession(tab);
    const { data } = await session.send('Page.captureScreenshot', {
      format: 'webp',
      quality: 90,
      clip: { ...box, scale: PICTURE_WIDTH / EXAMPLE.width },
    });
    for (const root of SITES) {
      const file = join(root, SCREENSHOTS_DIR, `${name}.webp`);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, Buffer.from(data, 'base64'));
    }
    console.log(`${name}: ${Math.round(box.width)}×${Math.round(box.height)}`);
    await context.close();
  }
} finally {
  await browser.close();
}
