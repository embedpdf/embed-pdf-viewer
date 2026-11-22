// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { pageTransform } from '@embedpdf/core-geometry';
import { annotationKey, type Kernel } from '@embedpdf/core';
import type { AnnotationRef } from '@embedpdf/plugin-annotation/contract';
import { createLocalEngine } from '@embedpdf/engine';
import { formPlugin, FormToken, toFieldRef } from '@embedpdf/plugin-form';
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { renderPlugin } from '@embedpdf/plugin-render';
import { RenderToken as RenderHostToken } from '@embedpdf/plugin-render/contract/host';

import { FormLayer } from '../src/form';
import { makePageContext, PageProvider, useKernel, Viewer } from '../src/runtime';
import type { PageContextValue } from '../src/runtime';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '..', '..', '..', 'engine', 'main', 'test', 'fixtures');
const wasm = resolve(
  here,
  '..',
  '..',
  '..',
  'engine',
  'runtime',
  'npm',
  'wasm32',
  'lib',
  'embedpdf.wasm',
);

/**
 * `<FormLayer>` without the annotation plugin: the layer puts a real control
 * over each field box, in the colors of the form settings. Typing commits on
 * blur, a click toggles.
 */
describe('<FormLayer> over fields made from code', () => {
  afterEach(cleanup);

  it(
    'fills in a text box and a checkbox, and draws the edge of a field without a border',
    { timeout: 45_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
      // happy-dom's browser-shaped globals would steer the wasm toward fetch(); hand it over.
      const wasmBinary = new Uint8Array(await readFile(wasm));
      const engine = await createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });
      const plugins = [interactionPlugin(), formPlugin({ fields: { border: '#ea580c' } })];

      let kernel: Kernel | null = null;
      let setPage!: (page: PageContextValue) => void;
      function Grab() {
        const current = useKernel();
        useEffect(() => {
          kernel = current;
        }, [current]);
        return null;
      }
      function Page() {
        const [page, set] = useState<PageContextValue | null>(null);
        setPage = set;
        return page ? (
          <PageProvider value={page}>
            <FormLayer />
          </PageProvider>
        ) : null;
      }

      const view = render(
        <Viewer
          engine={engine}
          plugins={plugins}
          initialDocuments={[{ source: { kind: 'bytes', id: 'blank', bytes } }]}
        >
          <Grab />
          <Page />
        </Viewer>,
      );

      try {
        await waitFor(() => expect(kernel?.tryCapability(FormToken, undefined)).toBeTruthy(), {
          timeout: 20_000,
        });
        const form = kernel!.capability(FormToken);
        await form.refresh();
        const page = kernel!.documents.getPage(0, 'blank')!.ref;
        await form.create({
          kind: 'text',
          name: 'name',
          widgets: [{ page, rect: { x: 72, y: 100, width: 160, height: 20 }, color: '#94a3b8' }],
        });
        await form.create({
          kind: 'checkbox',
          name: 'agree',
          widgets: [{ page, rect: { x: 72, y: 140, width: 14, height: 14 } }],
        });

        const transform = pageTransform({
          pageSize: { width: 612, height: 792 },
          rotation: 0,
          scale: 1,
          dpr: 1,
        });
        setPage(
          makePageContext(
            'blank',
            'test-view',
            page,
            0,
            { top: 0, right: 0, bottom: 0, left: 0 },
            transform,
            () =>
              ({
                left: 0,
                top: 0,
                right: 612,
                bottom: 792,
                width: 612,
                height: 792,
                x: 0,
                y: 0,
                toJSON() {},
              }) as DOMRect,
          ),
        );

        const input = (await waitFor(() => screen.getByLabelText('name'))) as HTMLInputElement;
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'Ada Lovelace' } });
        fireEvent.blur(input);
        await waitFor(() =>
          expect(form.getValue(toFieldRef('name'))).toEqual({ value: 'Ada Lovelace' }),
        );

        const checkbox = await waitFor(() => screen.getByRole('checkbox', { name: 'agree' }));
        fireEvent.click(checkbox);
        await waitFor(() => expect(form.getValue(toFieldRef('agree'))).toEqual({ checked: true }));

        // The checkbox has no border of its own: the layer draws its edge in the setting's color.
        expect(checkbox.style.boxShadow).toContain('#ea580c');
        // The text box has its own border: no edge.
        expect((input.parentElement as HTMLElement).style.boxShadow).toBe('');

        // A press on a field stops at its box, before the page below sees it, and still reaches the
        // field's PDF actions as "mouse down" (the box's native listener sends it).
        const host = kernel!.capability(FormHostToken);
        const events: string[] = [];
        vi.spyOn(host, 'notifyWidgetEvent').mockImplementation((_field, _widget, event) => {
          events.push(event);
        });
        const pagePresses: Event[] = [];
        const pageBelow = view.container;
        const onPagePress = (event: Event) => pagePresses.push(event);
        pageBelow.addEventListener('pointerdown', onPagePress);
        fireEvent.pointerDown(input.parentElement as HTMLElement);
        pageBelow.removeEventListener('pointerdown', onPagePress);
        expect(events).toContain('mouseDown');
        expect(pagePresses).toHaveLength(0);
      } finally {
        view.unmount();
        await engine.destroy();
      }
    },
  );
});

/**
 * A radio group's buttons are placed apart on the page, with no group element around them: each
 * button is named by its group's tooltip and its own option, and says where it comes in its group.
 */
describe('<FormLayer> radio buttons', () => {
  afterEach(cleanup);

  it(
    'names each button by its option, and says where it comes in its group',
    { timeout: 45_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
      const wasmBinary = new Uint8Array(await readFile(wasm));
      const engine = await createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });
      const plugins = [interactionPlugin(), formPlugin()];

      let kernel: Kernel | null = null;
      let setPage!: (page: PageContextValue) => void;
      function Grab() {
        const current = useKernel();
        useEffect(() => {
          kernel = current;
        }, [current]);
        return null;
      }
      function Page() {
        const [page, set] = useState<PageContextValue | null>(null);
        setPage = set;
        return page ? (
          <PageProvider value={page}>
            <FormLayer />
          </PageProvider>
        ) : null;
      }

      const view = render(
        <Viewer
          engine={engine}
          plugins={plugins}
          initialDocuments={[{ source: { kind: 'bytes', id: 'blank', bytes } }]}
        >
          <Grab />
          <Page />
        </Viewer>,
      );

      try {
        await waitFor(() => expect(kernel?.tryCapability(FormToken, undefined)).toBeTruthy(), {
          timeout: 20_000,
        });
        const form = kernel!.capability(FormToken);
        await form.refresh();
        const page = kernel!.documents.getPage(0, 'blank')!.ref;
        await form.create({
          kind: 'radio',
          name: 'plan',
          alternateName: 'Plan',
          widgets: [
            { page, rect: { x: 72, y: 100, width: 16, height: 16 }, exportValue: 'Monthly' },
            { page, rect: { x: 200, y: 100, width: 16, height: 16 }, exportValue: 'Yearly' },
          ],
        });

        const transform = pageTransform({
          pageSize: { width: 612, height: 792 },
          rotation: 0,
          scale: 1,
          dpr: 1,
        });
        setPage(
          makePageContext(
            'blank',
            'test-view',
            page,
            0,
            { top: 0, right: 0, bottom: 0, left: 0 },
            transform,
            () => new DOMRect(0, 0, 612, 792),
          ),
        );

        const monthly = await waitFor(() => screen.getByRole('radio', { name: 'Plan: Monthly' }));
        const yearly = screen.getByRole('radio', { name: 'Plan: Yearly' });
        expect(monthly.getAttribute('aria-posinset')).toBe('1');
        expect(monthly.getAttribute('aria-setsize')).toBe('2');
        expect(yearly.getAttribute('aria-posinset')).toBe('2');
        expect(yearly.getAttribute('aria-setsize')).toBe('2');
      } finally {
        view.unmount();
        await engine.destroy();
      }
    },
  );
});

/**
 * A field turned a quarter (`/MK /R`): its control sits in the field's frame,
 * turned with it about its middle, so what's typed reads the way the field
 * does. An unturned field's control is placed as it always was.
 */
describe('<FormLayer> over a turned field', () => {
  afterEach(cleanup);

  it(
    'places the control in the field’s frame and turns it with the field',
    { timeout: 45_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
      const wasmBinary = new Uint8Array(await readFile(wasm));
      const engine = await createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });
      const plugins = [interactionPlugin(), formPlugin()];

      let kernel: Kernel | null = null;
      let setPage!: (page: PageContextValue) => void;
      function Grab() {
        const current = useKernel();
        useEffect(() => {
          kernel = current;
        }, [current]);
        return null;
      }
      function Page() {
        const [page, set] = useState<PageContextValue | null>(null);
        setPage = set;
        return page ? (
          <PageProvider value={page}>
            <FormLayer />
          </PageProvider>
        ) : null;
      }

      const view = render(
        <Viewer
          engine={engine}
          plugins={plugins}
          initialDocuments={[{ source: { kind: 'bytes', id: 'blank', bytes } }]}
        >
          <Grab />
          <Page />
        </Viewer>,
      );

      try {
        await waitFor(() => expect(kernel?.tryCapability(FormToken, undefined)).toBeTruthy(), {
          timeout: 20_000,
        });
        const form = kernel!.capability(FormToken);
        await form.refresh();
        const page = kernel!.documents.getPage(0, 'blank')!.ref;
        // Its frame is 160 × 20; turned 270° it stands 20 wide and 160 tall.
        await form.create({
          kind: 'text',
          name: 'side',
          widgets: [{ page, box: { x: 72, y: 300, width: 160, height: 20 }, rotation: 270 }],
        });
        await form.create({
          kind: 'text',
          name: 'flat',
          widgets: [{ page, rect: { x: 72, y: 100, width: 160, height: 20 } }],
        });

        const transform = pageTransform({
          pageSize: { width: 612, height: 792 },
          rotation: 0,
          scale: 1,
          dpr: 1,
        });
        setPage(
          makePageContext(
            'blank',
            'test-view',
            page,
            0,
            { top: 0, right: 0, bottom: 0, left: 0 },
            transform,
            () => new DOMRect(0, 0, 612, 792),
          ),
        );

        const side = (await waitFor(() => screen.getByLabelText('side'))) as HTMLInputElement;
        const box = side.parentElement as HTMLElement;
        expect(box.style.left).toBe('72px');
        expect(box.style.top).toBe('300px');
        expect(box.style.width).toBe('160px');
        expect(box.style.height).toBe('20px');
        expect(box.style.transform).toBe('rotate(270deg)');
        // The item says where it stands: the frame turned about its middle.
        const item = form.listWidgets(page).find((each) => each.label === 'side')!;
        expect(item.rotation).toBe(270);
        expect(item.rect).toEqual({ x: 142, y: 230, width: 20, height: 160 });

        const flat = (await waitFor(() => screen.getByLabelText('flat'))) as HTMLInputElement;
        expect((flat.parentElement as HTMLElement).style.transform).toBe('');
        expect((flat.parentElement as HTMLElement).style.left).toBe('72px');

        // Typing into the turned field fills it in, and it keeps its turn.
        fireEvent.focus(side);
        fireEvent.change(side, { target: { value: 'Up the page' } });
        fireEvent.blur(side);
        await waitFor(() =>
          expect(form.getValue(toFieldRef('side'))).toEqual({ value: 'Up the page' }),
        );
        expect(form.listWidgets(page).find((each) => each.label === 'side')!.rotation).toBe(270);
      } finally {
        view.unmount();
        await engine.destroy();
      }
    },
  );
});

/**
 * A dropdown is one select for as long as its field shows: a choice keeps the
 * focus where it is, and the focus ring leaves with the focus.
 */
describe('<FormLayer> dropdown', () => {
  afterEach(cleanup);

  it(
    'keeps the focus through a choice, and drops its ring on blur',
    { timeout: 45_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
      const wasmBinary = new Uint8Array(await readFile(wasm));
      const engine = await createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });
      const plugins = [interactionPlugin(), formPlugin()];

      let kernel: Kernel | null = null;
      let setPage!: (page: PageContextValue) => void;
      function Grab() {
        const current = useKernel();
        useEffect(() => {
          kernel = current;
        }, [current]);
        return null;
      }
      function Page() {
        const [page, set] = useState<PageContextValue | null>(null);
        setPage = set;
        return page ? (
          <PageProvider value={page}>
            <FormLayer />
          </PageProvider>
        ) : null;
      }

      const view = render(
        <Viewer
          engine={engine}
          plugins={plugins}
          initialDocuments={[{ source: { kind: 'bytes', id: 'blank', bytes } }]}
        >
          <Grab />
          <Page />
        </Viewer>,
      );

      try {
        await waitFor(() => expect(kernel?.tryCapability(FormToken, undefined)).toBeTruthy(), {
          timeout: 20_000,
        });
        const form = kernel!.capability(FormToken);
        await form.refresh();
        const page = kernel!.documents.getPage(0, 'blank')!.ref;
        await form.create({
          kind: 'combobox',
          name: 'framework',
          options: [
            { label: 'React', value: 'React' },
            { label: 'Vue', value: 'Vue' },
          ],
          widgets: [{ page, rect: { x: 72, y: 100, width: 160, height: 20 } }],
        });
        setPage(
          makePageContext(
            'blank',
            'test-view',
            page,
            0,
            { top: 0, right: 0, bottom: 0, left: 0 },
            pageTransform({ pageSize: { width: 612, height: 792 }, rotation: 0, scale: 1, dpr: 1 }),
            () => new DOMRect(0, 0, 612, 792),
          ),
        );
        const ring = () => document.querySelector('[data-embedpdf-form-focus-ring]');

        const select = (await waitFor(() =>
          screen.getByLabelText('framework'),
        )) as HTMLSelectElement;
        act(() => select.focus());
        expect(ring()).not.toBeNull();

        fireEvent.change(select, { target: { value: 'Vue' } });
        await waitFor(() =>
          expect(form.getValue(toFieldRef('framework'))).toEqual({ value: 'Vue' }),
        );
        await waitFor(() => expect(form.listWidgets(page)[0]).toMatchObject({ selected: ['Vue'] }));

        // The same select, still focused, showing the choice.
        expect(screen.getByLabelText('framework')).toBe(select);
        expect(document.activeElement).toBe(select);
        expect(select.value).toBe('Vue');
        expect(ring()).not.toBeNull();

        act(() => select.blur());
        expect(ring()).toBeNull();
      } finally {
        view.unmount();
        await engine.destroy();
      }
    },
  );
});

/**
 * With the render plugin, `<FormLayer>` paints each field as the engine draws
 * it: one picture per widget, the one of the state it shows. The engine
 * encodes pictures with a 2D canvas, which happy-dom doesn't have, so the
 * render plugin's pictures are stand-ins here: a URL naming widget and state.
 */
describe('<FormLayer> field pictures', () => {
  afterEach(cleanup);

  it(
    'paints each field, and a checkbox its new state once it changes',
    { timeout: 45_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
      const wasmBinary = new Uint8Array(await readFile(wasm));
      const engine = await createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });
      const plugins = [interactionPlugin(), renderPlugin(), formPlugin()];

      let kernel: Kernel | null = null;
      let setPage!: (page: PageContextValue) => void;
      function Grab() {
        const current = useKernel();
        useEffect(() => {
          kernel = current;
        }, [current]);
        return null;
      }
      function Page() {
        const [page, set] = useState<PageContextValue | null>(null);
        setPage = set;
        return page ? (
          <PageProvider value={page}>
            <FormLayer />
          </PageProvider>
        ) : null;
      }

      const view = render(
        <Viewer
          engine={engine}
          plugins={plugins}
          initialDocuments={[{ source: { kind: 'bytes', id: 'blank', bytes } }]}
        >
          <Grab />
          <Page />
        </Viewer>,
      );

      try {
        await waitFor(() => expect(kernel?.tryCapability(FormToken, undefined)).toBeTruthy(), {
          timeout: 20_000,
        });
        const form = kernel!.capability(FormToken);
        await form.refresh();
        const page = kernel!.documents.getPage(0, 'blank')!.ref;
        await form.create({
          kind: 'text',
          name: 'name',
          widgets: [{ page, rect: { x: 72, y: 100, width: 160, height: 20 }, color: '#94a3b8' }],
        });
        await form.create({
          kind: 'checkbox',
          name: 'agree',
          widgets: [{ page, rect: { x: 72, y: 140, width: 14, height: 14 } }],
        });
        const [text, check] = kernel!.capability(FormHostToken).listShownWidgets(page);
        const checkBox = { x: 72, y: 140, width: 14, height: 14 };
        const picture = (ref: AnnotationRef, state: string | null, rect: typeof checkBox) => ({
          ref,
          mode: 'normal' as const,
          state,
          rect,
          image: {
            objectUrl: () => ({
              abortWith: async () => ({
                url: `blob:${annotationKey(ref)}:${state}`,
                revoke: () => {},
              }),
            }),
          },
        });
        const drawn = [
          picture(text!.ref, null, { x: 72, y: 100, width: 160, height: 20 }),
          picture(check!.ref, 'Off', checkBox),
          picture(check!.ref, 'Yes', checkBox),
        ];
        // The render plugin's door, as it answers: the asked widgets' pictures, each at its version.
        const fetches = vi.spyOn(kernel!.capability(RenderHostToken), 'renderAppearances');
        fetches.mockImplementation(
          async (_page, { items }) =>
            drawn.map((each) => ({
              ...each,
              version:
                items.find((item) => annotationKey(item.ref) === annotationKey(each.ref))
                  ?.version ?? 0,
            })) as never,
        );
        setPage(
          makePageContext(
            'blank',
            'test-view',
            page,
            0,
            { top: 0, right: 0, bottom: 0, left: 0 },
            pageTransform({ pageSize: { width: 612, height: 792 }, rotation: 0, scale: 1, dpr: 1 }),
            () =>
              ({
                left: 0,
                top: 0,
                right: 612,
                bottom: 792,
                width: 612,
                height: 792,
                x: 0,
                y: 0,
                toJSON() {},
              }) as DOMRect,
          ),
        );

        const pictures = () =>
          [...view.container.querySelectorAll('img')].map((image) => image.src);
        await waitFor(() => expect(pictures()).toHaveLength(2));
        const checkKey = annotationKey(check!.ref);
        expect(pictures()).toEqual([
          `blob:${annotationKey(text!.ref)}:null`,
          `blob:${checkKey}:Off`,
        ]);
        // Placed at its widget's box, in page pixels.
        expect(view.container.querySelectorAll('img')[1]!.style.top).toBe('140px');

        // A checkbox switches to the picture it holds: nothing is fetched.
        const asked = fetches.mock.calls.length;
        const checkbox = await waitFor(() => screen.getByRole('checkbox', { name: 'agree' }));
        fireEvent.click(checkbox);
        await waitFor(() => expect(pictures()[1]).toBe(`blob:${checkKey}:Yes`));
        await waitFor(() =>
          expect(form.getValue({ kind: 'fqn', name: 'agree' })).toEqual({ checked: true }),
        );
        expect(fetches.mock.calls.length).toBe(asked);

        // A move takes the picture along: it is drawn where the widget is now, not where the
        // engine drew it, and nothing is fetched.
        await form.updateWidget(check!.ref, { rect: { x: 300, y: 400, width: 14, height: 14 } });
        const moved = () => view.container.querySelectorAll('img')[1]!.style;
        await waitFor(() => expect(moved().top).toBe('400px'));
        expect(moved().left).toBe('300px');
        expect(pictures()[1]).toBe(`blob:${checkKey}:Yes`);
        expect(fetches.mock.calls.length).toBe(asked);

        // A fill shows at once: the painter draws the new value while the page's newer pictures
        // load (here they never do). The check box keeps its picture: it didn't change.
        fetches.mockReturnValue(new Promise(() => {}) as never);
        await form.setValue({ kind: 'fqn', name: 'name' }, { value: 'Ada' });
        const painted = () =>
          [...view.container.querySelectorAll('svg text')]
            .map((text) => text.textContent)
            .join(' ');
        await waitFor(() => expect(painted()).toBe('Ada'));
        expect(pictures()).toEqual([`blob:${checkKey}:Yes`]);
      } finally {
        view.unmount();
        await engine.destroy();
      }
    },
  );
});
