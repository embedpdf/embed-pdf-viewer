/**
 * Form fields on a page that is shown turned. A field tool places a field the way its author
 * sees the page: it shows the tool's size as seen and is turned a quarter, so what's typed
 * into it reads upright there. Its control sits in the field's frame, turned with it. In the
 * form designer, the selected field's menu turns it a quarter turn, and the Style sidebar's
 * Orientation turns its contents where it stands.
 *
 * Runs against the built snippet (`pnpm build` first).
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

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<title>upright fields</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; inset: 0; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.element = EmbedPDF.init({
    target: '#viewer',
    src: '/sample.pdf',
    theme: 'light',
    features: { 'forms.building': true },
  });
</script>
</body></html>`;

declare global {
  interface Window {
    // The same shape the other viewer tests give it.
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
  }
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The placed field's widget, as the form reads it: its frame, its turn and where it stands. */
interface Placed {
  name: string;
  rotation: number;
  box: Box;
  rect: Box;
}

const execute = (tab: Page, command: string) =>
  tab.evaluate((id) => window.element.viewer.commands.execute(id), command);

const until = (tab: Page, test: () => unknown, what: string) =>
  tab.waitForFunction(test, null, { timeout: 10_000 }).catch(() => {
    throw new Error(`timed out waiting for ${what}`);
  });

/** The labels of the buttons the bar over the selection shows. */
const selectionBarButtons = (tab: Page): Promise<string[]> =>
  tab.evaluate(() => {
    const bar = [...window.element.shadowRoot!.querySelectorAll('[role="toolbar"]')].find(
      (element) => element.parentElement?.hasAttribute('data-placement'),
    );
    return [...(bar?.querySelectorAll('button') ?? [])]
      .filter((button) => !button.closest('[aria-hidden="true"]'))
      .map((button) => button.getAttribute('aria-label') ?? button.getAttribute('title') ?? '');
  });

/** The field the text tool placed last (`text_<n>`), or null. */
const placedField = (tab: Page): Promise<Placed | null> =>
  tab.evaluate(() => {
    const form = window.element.viewer.get('form');
    const field = form
      .list()
      .filter((each: { name: string }) => /^text_\d+$/.test(each.name))
      .at(-1);
    const row = field && form.getWidgets(field.ref)[0];
    return row
      ? { name: field.name, rotation: row.rotation ?? 0, box: row.box, rect: row.rect }
      : null;
  });

/** A box of page 1 on the screen. */
const onScreen = (tab: Page, box: Box): Promise<Box> =>
  tab.evaluate((at) => {
    const { viewer } = window.element;
    const page = viewer.documents.getPage(0);
    const viewport = (
      window.element.shadowRoot!.querySelector('[data-float]') as HTMLElement
    ).offsetParent!.getBoundingClientRect();
    const rect = viewer.get('stage').pageRectToViewport(page.ref, at);
    return {
      x: viewport.left + rect.x,
      y: viewport.top + rect.y,
      width: rect.width,
      height: rect.height,
    };
  }, box);

/** A point of page 1 with no field under it or near it. */
const EMPTY_PAPER = { x: 133, y: 137 };

const near = (actual: number, expected: number, slack = 1.5) =>
  expect(Math.abs(actual - expected)).toBeLessThan(slack);

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('fields on a page shown turned', () => {
  let host: ViewerHost;
  let browser: Browser;
  let tab: Page;

  beforeAll(async () => {
    host = await serveViewer({ '/upright-fields.html': PAGE });
    browser = await launchChromium();
    tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await tab.goto(`${host.origin}/upright-fields.html`);
    await waitForDocument(tab);
    await frames(tab);
    await execute(tab, 'mode:form');
    // The view turned a quarter: every page shows turned 90° clockwise.
    await execute(tab, 'view:rotate-clockwise');
    await frames(tab);
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('a field tool places a field that shows its size as seen, turned to read upright', async () => {
    await tab.evaluate(() => window.element.viewer.get('interaction').activateTool('form-text'));
    // A click on empty paper: the sample's Fee Stamp cell, where no field is.
    const viewport = await tab.evaluate((at) => {
      const { viewer } = window.element;
      const page = viewer.documents.getPage(0);
      const box = (
        window.element.shadowRoot!.querySelector('[data-float]') as HTMLElement
      ).offsetParent!.getBoundingClientRect();
      const spot = viewer.get('stage').pageToViewport(page.ref, at);
      return { x: box.left + spot.x, y: box.top + spot.y };
    }, EMPTY_PAPER);
    await tab.mouse.move(viewport.x, viewport.y);
    await tab.mouse.click(viewport.x, viewport.y);
    await until(
      tab,
      () =>
        window.element.viewer
          .get('form')
          .list()
          .some((field: { name: string }) => /^text_\d+$/.test(field.name)),
      'the placed field',
    );
    await frames(tab);
    const placed = (await placedField(tab))!;
    // Its turn undoes the view's: 270° clockwise on a page shown turned 90°.
    expect(placed.rotation).toBe(270);
    // Its frame is the tool's click size; it stands with its sides swapped.
    expect(placed.box.width).toBeCloseTo(160, 3);
    expect(placed.box.height).toBeCloseTo(24, 3);
    expect(placed.rect.width).toBeCloseTo(24, 3);
    expect(placed.rect.height).toBeCloseTo(160, 3);
    // On the screen it is wide and low, as its author sees the page, about the click.
    const shown = await onScreen(tab, placed.rect);
    expect(shown.width / shown.height).toBeCloseTo(160 / 24, 1);
    near(shown.x + shown.width / 2, viewport.x, 3);
    near(shown.y + shown.height / 2, viewport.y, 3);
  });

  it('its control sits in its frame, turned with it, and what is typed fills it in', async () => {
    const placed = (await placedField(tab))!;
    // Filling in: the pointer tool, with nothing selected.
    await tab.evaluate(() => {
      const { viewer } = window.element;
      viewer.get('annotation').selection.clear();
      viewer.get('interaction').activateTool('pointer');
    });
    await until(
      tab,
      () => !!window.element.shadowRoot!.querySelector('input[aria-label^="text_"]'),
      'the text box',
    );
    const control = await tab.evaluate((name) => {
      const input = window.element.shadowRoot!.querySelector<HTMLInputElement>(
        `input[aria-label="${name}"]`,
      )!;
      const box = input.parentElement as HTMLElement;
      const rect = box.getBoundingClientRect();
      return {
        transform: box.style.transform,
        // The box's own size, before its turn: the frame.
        frame: { width: parseFloat(box.style.width), height: parseFloat(box.style.height) },
        screen: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      };
    }, placed.name);
    expect(control.transform).toBe('rotate(270deg)');
    expect(control.frame.width / control.frame.height).toBeCloseTo(160 / 24, 1);
    // Turned with the page it stands on, the box covers the field as the screen shows it.
    const shown = await onScreen(tab, placed.rect);
    near(control.screen.x, shown.x);
    near(control.screen.y, shown.y);
    near(control.screen.width, shown.width);
    near(control.screen.height, shown.height);

    await tab.mouse.click(shown.x + shown.width / 2, shown.y + shown.height / 2);
    await tab.keyboard.type('Upright');
    await tab.keyboard.press('Enter');
    await until(
      tab,
      () =>
        window.element.viewer
          .get('form')
          .list()
          .some((field: { value?: string }) => field.value === 'Upright'),
      'the typed value',
    );
    // Filled in, it keeps its turn.
    expect((await placedField(tab))!.rotation).toBe(270);
  });

  it("the selected field's menu turns it a quarter turn", async () => {
    const before = (await placedField(tab))!;
    await execute(tab, 'form:design');
    await tab.evaluate((name) => {
      const { viewer } = window.element;
      const field = viewer.get('form').get({ kind: 'fqn', name });
      viewer.get('annotation').selection.select([field.widgets[0].ref]);
    }, before.name);
    await frames(tab);
    const commands = await tab.evaluate(() =>
      ['annotation:rotate-clockwise', 'annotation:rotate-counterclockwise'].map((id) => {
        const command = window.element.viewer.commands.resolveCommand(id);
        return { id, visible: command?.visible, label: command?.label };
      }),
    );
    expect(commands).toEqual([
      { id: 'annotation:rotate-clockwise', visible: true, label: 'Rotate clockwise' },
      {
        id: 'annotation:rotate-counterclockwise',
        visible: true,
        label: 'Rotate counterclockwise',
      },
    ]);
    // Both are commands; the menu over the field shows one direction.
    await until(
      tab,
      () =>
        [...window.element.shadowRoot!.querySelectorAll('[role="toolbar"]')].some((bar) =>
          bar.parentElement?.hasAttribute('data-placement'),
        ),
      'the menu over the field',
    );
    const shown = await selectionBarButtons(tab);
    expect(shown).toContain('Rotate clockwise');
    expect(shown).not.toContain('Rotate counterclockwise');

    await execute(tab, 'annotation:rotate-clockwise');
    await until(
      tab,
      () => {
        const form = window.element.viewer.get('form');
        const field = form
          .list()
          .filter((each: { name: string }) => /^text_\d+$/.test(each.name))
          .at(-1);
        return (form.getWidgets(field.ref)[0].rotation ?? 0) === 0;
      },
      'the quarter turn',
    );
    const turned = (await placedField(tab))!;
    // The whole box turned about its middle: its frame is the same, it stands the other way.
    expect(turned.rotation).toBe(0);
    expect(turned.rect.width).toBeCloseTo(160, 3);
    expect(turned.rect.height).toBeCloseTo(24, 3);
    near(turned.rect.x + turned.rect.width / 2, before.rect.x + before.rect.width / 2, 0.01);
    near(turned.rect.y + turned.rect.height / 2, before.rect.y + before.rect.height / 2, 0.01);

    await execute(tab, 'annotation:rotate-counterclockwise');
    await until(
      tab,
      () => {
        const form = window.element.viewer.get('form');
        const field = form
          .list()
          .filter((each: { name: string }) => /^text_\d+$/.test(each.name))
          .at(-1);
        return form.getWidgets(field.ref)[0].rotation === 270;
      },
      'the turn back',
    );
    expect((await placedField(tab))!.rect.width).toBeCloseTo(24, 3);
  });

  it('Orientation in the Style sidebar turns its contents and leaves it where it stands', async () => {
    const before = (await placedField(tab))!;
    await execute(tab, 'panel:style');
    await until(
      tab,
      () =>
        window.element
          .shadowRoot!.querySelector('[data-epdf-panel="style"]')
          ?.textContent?.includes('Orientation'),
      'the Orientation control',
    );
    // The choice shows the field's turn, and each choice is a button.
    const pressed = await tab.evaluate(() =>
      [
        ...window.element.shadowRoot!.querySelectorAll<HTMLButtonElement>(
          '[data-epdf-panel="style"] button[aria-pressed]',
        ),
      ]
        .filter((button) => /°$/.test(button.getAttribute('aria-label') ?? ''))
        .map((button) => [button.getAttribute('aria-label'), button.getAttribute('aria-pressed')]),
    );
    expect(pressed).toEqual([
      ['0°', 'false'],
      ['90°', 'false'],
      ['180°', 'false'],
      ['270°', 'true'],
    ]);
    await tab.evaluate(() => {
      const upright = [
        ...window.element.shadowRoot!.querySelectorAll<HTMLButtonElement>(
          '[data-epdf-panel="style"] button[aria-pressed]',
        ),
      ].find((button) => button.getAttribute('aria-label') === '0°')!;
      upright.click();
    });
    await until(
      tab,
      () => {
        const form = window.element.viewer.get('form');
        const field = form
          .list()
          .filter((each: { name: string }) => /^text_\d+$/.test(each.name))
          .at(-1);
        return (form.getWidgets(field.ref)[0].rotation ?? 0) === 0;
      },
      'the new orientation',
    );
    const after = (await placedField(tab))!;
    // It stands where it stood; its frame is that rect, since it is upright now.
    expect(after.rect.x).toBeCloseTo(before.rect.x, 3);
    expect(after.rect.y).toBeCloseTo(before.rect.y, 3);
    expect(after.rect.width).toBeCloseTo(before.rect.width, 3);
    expect(after.rect.height).toBeCloseTo(before.rect.height, 3);
    expect(after.box.width).toBeCloseTo(before.rect.width, 3);
    expect(after.box.height).toBeCloseTo(before.rect.height, 3);
  });
});
