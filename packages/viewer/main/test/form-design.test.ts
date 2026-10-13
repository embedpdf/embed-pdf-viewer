/**
 * Designing a form in the viewer. The Form mode opens for filling in; its Form design button
 * (`form:design`) switches design on: the fields are lent to be selected, moved and resized, and
 * the design sidebar lists them by page. A field selected, from the list or by a click on it,
 * shows its settings there, and its look in the Style sidebar. A radio group's Add a button
 * adds its next choice in line, a checkbox's Add a box a box that checks with it. A field tool
 * switches design on too, and design stays on after the field is placed; pressing Form design
 * again, or leaving the Form mode, ends it.
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
<title>form design</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; inset: 0; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', theme: 'light' });
</script>
</body></html>`;

declare global {
  interface Window {
    // The same shape the other viewer tests give it.
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
  }
}

interface Widget {
  name: string;
  ref: unknown;
  /** Its middle on the screen. */
  x: number;
  y: number;
}

/** Text fields whose widget shows on page 1's visible part, as lent annotations. */
const textFieldsOnScreen = (tab: Page): Promise<Widget[]> =>
  tab.evaluate(() => {
    const { viewer } = window.element;
    const stage = viewer.get('stage');
    const annotation = viewer.get('annotation');
    const page = viewer.documents.getPage(0);
    const viewport = (
      window.element.shadowRoot!.querySelector('[data-float]') as HTMLElement
    ).offsetParent!.getBoundingClientRect();
    const found: Widget[] = [];
    for (const field of viewer.get('form').list()) {
      if (field.family !== 'text') continue;
      const widget = field.widgets[0];
      if (widget?.page?.objectNumber !== page.ref.objectNumber) continue;
      const lent = annotation.get(widget.ref);
      if (!lent?.box) continue;
      const rect = stage.pageRectToViewport(page.ref, lent.box);
      if (!rect) continue;
      const x = viewport.left + rect.x + rect.width / 2;
      const y = viewport.top + rect.y + rect.height / 2;
      if (y < viewport.top + 120 || y > viewport.bottom - 80) continue;
      if (x < viewport.left + 20 || x > viewport.right - 20) continue;
      found.push({ name: field.name, ref: widget.ref, x, y });
    }
    return found;
  });

const execute = (tab: Page, command: string) =>
  tab.evaluate((id) => window.element.viewer.commands.execute(id), command);

const designing = (tab: Page) =>
  tab.evaluate(
    () => window.element.viewer.commands.resolveCommand('form:design')?.active as boolean,
  );

const selectedField = (tab: Page) =>
  tab.evaluate(() => window.element.viewer.get('form').getSelectedField()?.name ?? null);

/** The design sidebar's text, or null while it's closed. */
const sidebar = (tab: Page, panel = 'form-design') =>
  tab.evaluate(
    (id) =>
      window.element.shadowRoot!.querySelector(`[data-epdf-panel="${id}"]`)?.textContent ?? null,
    panel,
  );

const until = (tab: Page, test: () => unknown, what: string) =>
  tab.waitForFunction(test, null, { timeout: 10_000 }).catch(() => {
    throw new Error(`timed out waiting for ${what}`);
  });

/** A page-space point of page 1 on the screen. */
const onScreen = (tab: Page, point: { x: number; y: number }) =>
  tab.evaluate((at) => {
    const { viewer } = window.element;
    const page = viewer.documents.getPage(0);
    const viewport = (
      window.element.shadowRoot!.querySelector('[data-float]') as HTMLElement
    ).offsetParent!.getBoundingClientRect();
    const spot = viewer.get('stage').pageToViewport(page.ref, at);
    return { x: viewport.left + spot.x, y: viewport.top + spot.y };
  }, point);

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('designing a form', () => {
  let host: ViewerHost;
  let browser: Browser;
  let tab: Page;

  beforeAll(async () => {
    host = await serveViewer({ '/form-design.html': PAGE });
    browser = await launchChromium();
    tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await tab.goto(`${host.origin}/form-design.html`);
    await waitForDocument(tab);
    await frames(tab);
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('opens the Form mode for filling in, with Form design and Style on its bar', async () => {
    await execute(tab, 'mode:form');
    await frames(tab);
    expect(await designing(tab)).toBe(false);
    expect(await textFieldsOnScreen(tab)).toEqual([]);
    const labels = await tab.evaluate(() =>
      [...window.element.shadowRoot!.querySelectorAll('[role="toolbar"] button')].map((button) =>
        button.getAttribute('aria-label'),
      ),
    );
    expect(labels).toEqual(expect.arrayContaining(['Form design', 'Style']));
  });

  it('switches design on: the fields are lent, and the sidebar lists them by page', async () => {
    await execute(tab, 'form:design');
    await frames(tab);
    expect(await designing(tab)).toBe(true);
    await until(tab, () => window.element.viewer.get('shell').isOpen('form-design'), 'the sidebar');
    await until(
      tab,
      () =>
        window.element
          .shadowRoot!.querySelector('[data-epdf-panel="form-design"]')
          ?.textContent?.includes('Page 1'),
      'the field list',
    );
    expect((await textFieldsOnScreen(tab)).length).toBeGreaterThan(1);
  });

  it('selects a field from the list, and shows its settings', async () => {
    const name = await tab.evaluate(() => {
      const row = window.element.shadowRoot!.querySelector<HTMLButtonElement>(
        '[data-epdf-panel="form-design"] li button',
      )!;
      const text = row.textContent!;
      row.click();
      return text;
    });
    await frames(tab);
    expect(name).toContain((await selectedField(tab))!);
    await until(
      tab,
      () =>
        window.element
          .shadowRoot!.querySelector('[data-epdf-panel="form-design"]')
          ?.textContent?.includes('Tooltip'),
      'its settings',
    );
    expect(await sidebar(tab)).toContain('All fields');
  });

  it('selects a field by a click on it', async () => {
    const [, second] = await textFieldsOnScreen(tab);
    await tab.mouse.click(second!.x, second!.y);
    await frames(tab);
    expect(await selectedField(tab)).toBe(second!.name);
  });

  it("shows the field's look in the Style sidebar, and its settings only in Form design", async () => {
    await execute(tab, 'panel:style');
    await until(
      tab,
      () => !!window.element.shadowRoot!.querySelector('[data-epdf-panel="style"]'),
      'the style sidebar',
    );
    const style = (await sidebar(tab, 'style'))!;
    expect(style).toContain('Border color');
    expect(style).not.toContain('Tooltip');
    await execute(tab, 'panel:form-design');
    await frames(tab);
  });

  /** Make a group of `family` with one button at (72, 72) on page 1, and select it. */
  const groupOf = (family: 'radio' | 'checkbox', name: string) =>
    tab.evaluate(
      async ({ family: kind, name: called }) => {
        const { viewer } = window.element;
        const page = viewer.documents.getPage(0);
        const rect = { x: 72, y: 72, width: 16, height: 16 };
        const { field } = await viewer.get('form').create({
          family: kind,
          name: called,
          widgets: [
            { page: page.ref, rect, ...(kind === 'radio' ? { exportValue: 'Choice1' } : {}) },
          ],
        });
        viewer.get('annotation').selection.set([field.widgets[0].ref]);
      },
      { family, name },
    );

  /** Press the sidebar's add button and wait for the field's second widget. */
  const addOne = async (name: string, label: string) => {
    await until(
      tab,
      () =>
        window.element
          .shadowRoot!.querySelector('[data-epdf-panel="form-design"]')
          ?.textContent?.includes('Add a'),
      'the add button',
    );
    await tab.evaluate((text) => {
      const button = [
        ...window.element.shadowRoot!.querySelectorAll<HTMLButtonElement>(
          '[data-epdf-panel="form-design"] button',
        ),
      ].find((each) => each.textContent?.includes(text))!;
      button.click();
    }, label);
    await tab.waitForFunction(
      (called) =>
        window.element.viewer.get('form').get({ kind: 'fqn', name: called })?.widgets.length === 2,
      name,
      { timeout: 10_000 },
    );
    return tab.evaluate((called) => {
      const form = window.element.viewer.get('form');
      const ref = { kind: 'fqn', name: called };
      const field = form.get(ref);
      return {
        values: field.widgets.map((widget: any) => widget.exportValue),
        boxes: form.getWidgets(ref).map((row: any) => row.box),
        selected: window.element.viewer
          .get('annotation')
          .selection.list()
          .map((record: any) => record.ref.objectNumber),
        last: field.widgets[1].objectNumber,
      };
    }, name);
  };

  it("adds a radio group's next choice under its button, and selects it", async () => {
    await groupOf('radio', 'guard-plan');
    const added = await addOne('guard-plan', 'Add a button');
    expect(added.values).toEqual(['Choice1', 'Choice2']);
    expect(added.boxes[1]).toEqual({ x: 72, y: 96, width: 16, height: 16 });
    expect(added.selected).toEqual([added.last]);
  });

  it("adds a checkbox's box that checks together with it", async () => {
    await groupOf('checkbox', 'guard-agree');
    const added = await addOne('guard-agree', 'Add a box');
    expect(added.values[1]).toBe(added.values[0]);
    await tab.evaluate(() =>
      window.element.viewer
        .get('form')
        .setValue({ kind: 'fqn', name: 'guard-agree' }, { checked: true }),
    );
    const checked = await tab.evaluate(() =>
      window.element.viewer
        .get('form')
        .get({ kind: 'fqn', name: 'guard-agree' })
        .widgets.map((widget: any) => widget.checked),
    );
    expect(checked).toEqual([true, true]);
  });

  it('ends design when Form design is pressed again', async () => {
    await execute(tab, 'form:design');
    await frames(tab);
    expect(await designing(tab)).toBe(false);
    expect(await tab.evaluate(() => window.element.viewer.get('shell').isOpen('form-design'))).toBe(
      false,
    );
    expect(await textFieldsOnScreen(tab)).toEqual([]);
  });

  it('switches design on from a field tool, and keeps it on with the placed field selected', async () => {
    await execute(tab, 'tool:text-field');
    await frames(tab);
    expect(await designing(tab)).toBe(true);
    // In page 1's top margin, where the form has no field.
    await tab.evaluate(() => window.element.viewer.get('stage').goToPage(0));
    await frames(tab);
    const from = await onScreen(tab, { x: 40, y: 12 });
    const to = await onScreen(tab, { x: 180, y: 30 });
    await tab.mouse.move(from.x, from.y);
    await tab.mouse.down();
    await tab.mouse.move(to.x, to.y, { steps: 6 });
    await tab.mouse.up();
    await tab.waitForFunction(
      () => window.element.viewer.get('form').getSelectedField()?.name?.startsWith('text_'),
      null,
      { timeout: 10_000 },
    );
    // The field tool stays armed for the next field (the annotation plugin's afterCreate
    // `tool: 'stay'`), and that is design too.
    expect(
      await tab.evaluate(() => window.element.viewer.get('interaction').getActiveToolId()),
    ).toBe('form-text');
    expect(await designing(tab)).toBe(true);
  });

  it('ends design when the Form mode closes', async () => {
    await execute(tab, 'form:design');
    await execute(tab, 'form:design');
    expect(await designing(tab)).toBe(true);
    await execute(tab, 'mode:view');
    await frames(tab);
    expect(await designing(tab)).toBe(false);
    await until(
      tab,
      () => !window.element.viewer.get('shell').isOpen('form-design'),
      'the sidebar to close',
    );
  });
});
