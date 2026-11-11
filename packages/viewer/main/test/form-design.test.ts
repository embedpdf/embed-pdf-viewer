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
      if (field.kind !== 'text') continue;
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

/** A box of page 1, in page space. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Whether a picture (an `<img>`) sits on `box` of page 1, to the pixel. */
const pictureAt = (tab: Page, box: Box) =>
  tab.evaluate((at) => {
    const { viewer } = window.element;
    const page = viewer.documents.getPage(0);
    const viewport = (
      window.element.shadowRoot!.querySelector('[data-float]') as HTMLElement
    ).offsetParent!.getBoundingClientRect();
    const rect = viewer.get('stage').pageRectToViewport(page.ref, at);
    if (!rect) return false;
    const near = (left: number, right: number) => Math.abs(left - right) < 1.5;
    return [...window.element.shadowRoot!.querySelectorAll('img')].some((image) => {
      const frame = image.getBoundingClientRect();
      return (
        near(frame.left, viewport.left + rect.x) &&
        near(frame.top, viewport.top + rect.y) &&
        near(frame.width, rect.width) &&
        near(frame.height, rect.height)
      );
    });
  }, box);

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

  /** Make a group of `kind` with one button at (72, 72) on page 1, and select it. */
  const groupOf = (kind: 'radio' | 'checkbox', name: string) =>
    tab.evaluate(
      async ({ kind, name: called }) => {
        const { viewer } = window.element;
        const page = viewer.documents.getPage(0);
        const rect = { x: 72, y: 72, width: 16, height: 16 };
        const { field } = await viewer.get('form').create({
          kind,
          name: called,
          widgets: [
            { page: page.ref, rect, ...(kind === 'radio' ? { exportValue: 'Choice1' } : {}) },
          ],
        });
        viewer.get('annotation').selection.select([field.widgets[0].ref]);
      },
      { kind, name },
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
    // The new widget shows at once; the sidebar selects it once the engine has written it.
    await tab.waitForFunction(
      (called) => {
        const { viewer } = window.element;
        const widgets = viewer.get('form').get({ kind: 'fqn', name: called })?.widgets ?? [];
        const selected = viewer.get('annotation').selection.getSelected();
        return (
          widgets.length === 2 &&
          selected.length === 1 &&
          selected[0].ref.objectNumber === widgets[1].objectNumber
        );
      },
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
          .selection.getSelected()
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

  /** A field's widgets and what is selected, as the form and the annotation plugin hold them. */
  const stateOf = (name: string) =>
    tab.evaluate((called) => {
      const { viewer } = window.element;
      const field = viewer.get('form').get({ kind: 'fqn', name: called });
      return {
        numbers: (field?.widgets ?? []).map((widget: any) => widget.objectNumber) as number[],
        values: (field?.widgets ?? []).map((widget: any) => widget.exportValue) as string[],
        selected: viewer
          .get('annotation')
          .selection.getSelected()
          .map((record: any) => record.ref.objectNumber) as number[],
        shown: viewer.get('form').getSelectedField()?.name ?? null,
      };
    }, name);

  const selectFirst = (name: string) =>
    tab.evaluate((called) => {
      const { viewer } = window.element;
      const field = viewer.get('form').get({ kind: 'fqn', name: called });
      viewer.get('annotation').selection.select([field.widgets[0].ref]);
    }, name);

  const duplicateCommand = () =>
    tab.evaluate(() => {
      const command = window.element.viewer.commands.resolveCommand('annotation:duplicate');
      return { visible: command?.visible, enabled: command?.enabled };
    });

  it('Duplicate copies a radio button into its group, and any other field as a new field', async () => {
    // A radio button is one answer of its group: its copy is the group's next choice.
    await selectFirst('guard-plan');
    await frames(tab);
    expect(await duplicateCommand()).toEqual({ visible: true, enabled: true });
    await execute(tab, 'annotation:duplicate');
    await tab.waitForFunction(
      () =>
        window.element.viewer.get('form').get({ kind: 'fqn', name: 'guard-plan' })?.widgets
          .length === 3,
      null,
      { timeout: 10_000 },
    );
    const plan = await stateOf('guard-plan');
    expect(plan.values).toEqual(['Choice1', 'Choice2', 'Choice3']);
    // The copy is the selection, ready to drag.
    expect(plan.selected).toEqual([plan.numbers[2]]);

    // A text field is a whole question: its copy is a new field, named after it.
    await tab.evaluate(async () => {
      const { viewer } = window.element;
      const page = viewer.documents.getPage(0);
      const { field } = await viewer.get('form').create({
        kind: 'text',
        name: 'guard-city',
        widgets: [{ page: page.ref, rect: { x: 72, y: 160, width: 120, height: 20 } }],
      });
      viewer.get('annotation').selection.select([field.widgets[0].ref]);
    });
    await frames(tab);
    await execute(tab, 'annotation:duplicate');
    await tab.waitForFunction(
      () => !!window.element.viewer.get('form').get({ kind: 'fqn', name: 'guard-city_2' }),
      null,
      { timeout: 10_000 },
    );
    const city = await stateOf('guard-city_2');
    expect(city.selected).toEqual(city.numbers);
    expect(city.shown).toBe('guard-city_2');
    expect((await stateOf('guard-city')).numbers).toHaveLength(1);
  });

  it('Duplicate group copies the whole radio group as a new group, and selects it', async () => {
    await selectFirst('guard-plan');
    await until(
      tab,
      () =>
        window.element
          .shadowRoot!.querySelector('[data-epdf-panel="form-design"]')
          ?.textContent?.includes('Duplicate group'),
      'the Duplicate group button',
    );
    await tab.evaluate(() => {
      const button = [
        ...window.element.shadowRoot!.querySelectorAll<HTMLButtonElement>(
          '[data-epdf-panel="form-design"] button',
        ),
      ].find((each) => each.textContent?.includes('Duplicate group'))!;
      button.click();
    });
    // The new group shows at once; the sidebar selects it once the engine has written it.
    await tab.waitForFunction(
      () => {
        const { viewer } = window.element;
        const widgets =
          viewer.get('form').get({ kind: 'fqn', name: 'guard-plan_2' })?.widgets ?? [];
        return (
          widgets.length === 3 &&
          viewer.get('annotation').selection.getSelected().length === widgets.length
        );
      },
      null,
      { timeout: 10_000 },
    );
    await frames(tab);
    const copy = await stateOf('guard-plan_2');
    expect(copy.values).toEqual(['Choice1', 'Choice2', 'Choice3']);
    // The new group is the selection, so one drag moves it, and the sidebar shows it.
    expect([...copy.selected].sort()).toEqual([...copy.numbers].sort());
    expect(copy.shown).toBe('guard-plan_2');
    expect((await stateOf('guard-plan')).numbers).toHaveLength(3);
    // A checkbox has no such button: Duplicate copies it whole already.
    await selectFirst('guard-agree');
    await frames(tab);
    expect(await sidebar(tab)).not.toContain('Duplicate group');
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

  it("draws a moved field's picture where the field is now", async () => {
    // Design is off: the form layer draws the fields, each as the engine's picture of it.
    const was: Box = { x: 320, y: 40, width: 120, height: 20 };
    const now: Box = { ...was, x: 60, y: 90 };
    const ref = await tab.evaluate(async (rect) => {
      const { viewer } = window.element;
      const page = viewer.documents.getPage(0);
      const { field } = await viewer.get('form').create({
        kind: 'text',
        name: 'guard-moved',
        widgets: [{ page: page.ref, rect }],
      });
      return field.widgets[0].ref;
    }, was);
    await expect.poll(() => pictureAt(tab, was), { timeout: 10_000 }).toBe(true);

    // A move keeps the field's look, so the engine draws nothing again: the picture the layer
    // holds goes where the field is.
    await tab.evaluate(
      ([widget, rect]) => window.element.viewer.get('form').updateWidget(widget, { rect }),
      [ref, now] as const,
    );
    await expect.poll(() => pictureAt(tab, now), { timeout: 10_000 }).toBe(true);
    expect(await pictureAt(tab, was)).toBe(false);
  });
});
