/**
 * The viewer on a page that does everything a real site might to the
 * elements around it: a smaller root font size, body text styles that
 * inherit, a global reset and `button` rule, a transformed ancestor, a fixed
 * header above everything, its own `@font-face` named like the viewer's
 * annotation font. The viewer must look exactly as it does on a plain page,
 * keep its overlays inside its own box, and still take the page's
 * `--epdf-*` variables.
 *
 * Runs against the built snippet (`pnpm build` first), like
 * snippet-cross-origin.test.ts, with the same Chromium fallback.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  dist,
  frames,
  launchChromium,
  serveViewer,
  waitForDocument,
  type ViewerHost,
} from './helpers/viewer-host';

const VIEWER_BOX = { left: 24, top: 72, width: 860, height: 600 };
const ASIDE_BOX = { left: 900, top: 72, width: 200, height: 600 };

/** One host page: the same layout on both, the hostile one adding the CSS a site might have. */
function hostPage(hostile: boolean): string {
  const box = (rect: typeof VIEWER_BOX) =>
    `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
  const hostileCss = `
    @font-face { font-family: 'brand-sans'; src: url('/fonts/brand.ttf'); }
    html { font-size: 62.5%; }
    body {
      font-family: 'brand-sans', serif; font-size: 22px; font-style: italic; font-weight: 800;
      letter-spacing: 3px; word-spacing: 6px; line-height: 3; text-align: center;
      text-transform: uppercase; color: #c00; color-scheme: dark;
      -webkit-font-smoothing: antialiased;
    }
    *, ::before, ::after { box-sizing: content-box; margin: 0; padding: 0; border: 0 solid; }
    button { all: unset; display: block; padding: 20px; font-size: 30px; background: #f0f; }
    #frame { transform: translateX(0); }`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>host</title>
<style>
  body { margin: 0; }
  header { position: fixed; top: 0; left: 0; right: 0; height: 48px; z-index: 9999; background: #333; }
  #viewer { ${box(VIEWER_BOX)} }
  #aside { ${box(ASIDE_BOX)} }
  ${hostile ? hostileCss : ''}
</style></head>
<body>
<header id="header">site header</header>
<div id="frame"><div id="viewer"></div></div>
<aside id="aside">the page's own column</aside>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  EmbedPDF.init({
    target: '#viewer',
    src: '/sample.pdf',
    theme: 'light',
    annotations: {
      fonts: [{ key: 'brand-sans', url: '/fonts/brand.ttf', label: 'Brand Sans', familyName: 'Brand Sans' }],
    },
  });
</script>
</body></html>`;
}

/** Open a host page and wait until the document is shown and the viewer stops changing. */
async function openHost(browser: Browser, url: string): Promise<{ page: Page; shot: Buffer }> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url);
  await waitForDocument(page);
  // The registered font is fetched, registered and mounted after the first paint.
  await page.waitForFunction(
    () => [...document.fonts].some((face) => face.family.replace(/"/g, '') === 'epdf-brand-sans'),
    null,
    { timeout: 30_000 },
  );
  const viewer = page.locator('embedpdf-viewer');
  let previous = await viewer.screenshot();
  for (let attempt = 0; attempt < 40; attempt++) {
    await page.waitForTimeout(400);
    const shot = await viewer.screenshot();
    if (shot.equals(previous)) return { page, shot };
    previous = shot;
  }
  throw new Error(`${url}: the viewer never settled`);
}

/** The share of pixels that differ visibly between two same-sized PNGs. */
async function difference(browser: Browser, a: Buffer, b: Buffer): Promise<number> {
  const page = await browser.newPage();
  const result = await page.evaluate(
    async ([first, second]) => {
      const pixels = async (base64: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height);
      };
      const [left, right] = await Promise.all([pixels(first!), pixels(second!)]);
      if (left.width !== right.width || left.height !== right.height) return 1;
      let differing = 0;
      for (let i = 0; i < left.data.length; i += 4) {
        for (let channel = 0; channel < 3; channel++) {
          if (Math.abs(left.data[i + channel]! - right.data[i + channel]!) > 32) {
            differing++;
            break;
          }
        }
      }
      return differing / (left.width * left.height);
    },
    [a.toString('base64'), b.toString('base64')],
  );
  await page.close();
  return result;
}

/**
 * The toolbar band's height inside its border and that border, and the ring and shadow of a
 * pressed button in it, read inside the shadow root.
 */
const toolbarOf = (page: Page) =>
  page.evaluate(() => {
    const toolbar = document
      .querySelector('embedpdf-viewer')!
      .shadowRoot!.querySelector<HTMLElement>('[part="toolbar"]')!;
    const style = getComputedStyle(toolbar);
    const pressed = toolbar.querySelector('[part~="toolbar-button-active"]')!;
    const shadows = getComputedStyle(pressed).boxShadow;
    return {
      height: toolbar.clientHeight,
      border: `${style.borderBottomWidth} ${style.borderBottomStyle}`,
      // `ring` is a 1px spread, `shadow` a 3px blur; one variable without a default drops both.
      ring: shadows.includes('0px 0px 0px 1px'),
      shadow: shadows.includes('0px 1px 3px 0px'),
    };
  });

const menuOpen = (page: Page) =>
  page.evaluate(
    () => !!document.querySelector('embedpdf-viewer')!.shadowRoot!.querySelector('[part="menu"]'),
  );

/** What the page reports at a point, by id or tag (the viewer's internals retarget to its host). */
const elementAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const element = document.elementFromPoint(px!, py!);
      return element?.id || element?.localName || null;
    },
    [x, y],
  );

describe('the viewer on a hostile page', () => {
  let host: ViewerHost;
  let browser: Browser;
  let neutral: { page: Page; shot: Buffer };
  let hostile: { page: Page; shot: Buffer };

  beforeAll(async () => {
    expect(existsSync(join(dist, 'embedpdf.js')), 'run `pnpm build` first').toBe(true);
    host = await serveViewer({ '/neutral.html': hostPage(false), '/hostile.html': hostPage(true) });
    browser = await launchChromium();
    neutral = await openHost(browser, `${host.origin}/neutral.html`);
    hostile = await openHost(browser, `${host.origin}/hostile.html`);
  });
  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('looks the same as on a plain page', async () => {
    expect(await difference(browser, neutral.shot, hostile.shot)).toBeLessThan(0.002);
  });

  it('keeps its own sizes in px and draws its borders, rings and shadows without Tailwind on the page', async () => {
    for (const { page } of [neutral, hostile]) {
      // 32px buttons and 8px of padding above and below.
      expect(await toolbarOf(page)).toEqual({
        height: 48,
        border: '1px solid',
        ring: true,
        shadow: true,
      });
    }
  });

  it('keeps an open menu and its scrim inside its own box, and closes it on a press on the page', async () => {
    for (const { page } of [neutral, hostile]) {
      await page.bringToFront();
      await page.locator('[part="toolbar"] button[aria-haspopup="menu"]').first().click();
      await frames(page);
      expect(await menuOpen(page)).toBe(true);

      const header = { x: 640, y: 24 };
      const aside = { x: ASIDE_BOX.left + 100, y: ASIDE_BOX.top + 300 };
      expect(await elementAt(page, header.x, header.y)).toBe('header');
      expect(await elementAt(page, aside.x, aside.y)).toBe('aside');

      await page.mouse.click(aside.x, aside.y);
      await frames(page);
      expect(await menuOpen(page)).toBe(false);
      await page.mouse.move(0, 0);
    }
  });

  it("mounts its annotation font under its own family, apart from the page's", async () => {
    const families = await hostile.page.evaluate(() =>
      [...document.fonts].map((face) => face.family.replace(/"/g, '')).sort(),
    );
    expect(families).toEqual(['brand-sans', 'epdf-brand-sans']);
  });

  it('takes --epdf-accent from the page', async () => {
    const { page, shot } = hostile;
    await page.bringToFront();
    await page.addStyleTag({ content: 'embedpdf-viewer { --epdf-accent: #e91e63; }' });
    const accent = await page.evaluate(() =>
      getComputedStyle(
        document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector('[data-embedpdf-root]')!,
      )
        .getPropertyValue('--ep-accent')
        .trim(),
    );
    expect(accent).toBe('#e91e63');
    await page.waitForTimeout(300);
    const recolored = await page.locator('embedpdf-viewer').screenshot();
    expect(await difference(browser, shot, recolored)).toBeGreaterThan(0);
  });
});
