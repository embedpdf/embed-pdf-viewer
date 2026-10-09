// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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
const wasm = resolve(here, '..', '..', '..', 'engine', 'runtime', 'npm', 'wasm32', 'lib', 'embedpdf.wasm');

/**
 * `<FormLayer>` without the annotation plugin: the layer puts a real control
 * over each field box, in the colors of the form settings. Typing commits on
 * blur, a click toggles.
 */
describe('<FormLayer> over fields made from code', () => {
  afterEach(cleanup);

  it('fills in a text box and a checkbox, and draws the edge of a field without a border', { timeout: 45_000 }, async () => {
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
      <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: { kind: 'bytes', id: 'blank', bytes } }]}>
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
        family: 'text',
        name: 'name',
        widgets: [{ page, rect: { x: 72, y: 100, width: 160, height: 20 }, color: '#94a3b8' }],
      });
      await form.create({
        family: 'checkbox',
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
          () => ({ left: 0, top: 0, right: 612, bottom: 792, width: 612, height: 792, x: 0, y: 0, toJSON() {} }) as DOMRect,
        ),
      );

      const input = (await waitFor(() => screen.getByLabelText('name'))) as HTMLInputElement;
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'Ada Lovelace' } });
      fireEvent.blur(input);
      await waitFor(() => expect(form.getValue(toFieldRef('name'))).toEqual({ value: 'Ada Lovelace' }));

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
  });
});

/**
 * With the render plugin, `<FormLayer>` paints each field as the engine draws
 * it: one picture per widget, the one of the state it shows. The engine
 * encodes pictures with a 2D canvas, which happy-dom doesn't have, so the
 * render plugin's pictures are stand-ins here: a URL naming widget and state.
 */
describe('<FormLayer> field pictures', () => {
  afterEach(cleanup);

  it('paints each field, and a checkbox its new state once it changes', { timeout: 45_000 }, async () => {
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
      <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: { kind: 'bytes', id: 'blank', bytes } }]}>
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
        family: 'text',
        name: 'name',
        widgets: [{ page, rect: { x: 72, y: 100, width: 160, height: 20 }, color: '#94a3b8' }],
      });
      await form.create({
        family: 'checkbox',
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
      vi.spyOn(kernel!.capability(RenderHostToken), 'renderFieldAppearances').mockResolvedValue([
        picture(text!.ref, null, { x: 72, y: 100, width: 160, height: 20 }),
        picture(check!.ref, 'Off', checkBox),
        picture(check!.ref, 'Yes', checkBox),
      ] as never);
      setPage(
        makePageContext(
          'blank',
          'test-view',
          page,
          0,
          { top: 0, right: 0, bottom: 0, left: 0 },
          pageTransform({ pageSize: { width: 612, height: 792 }, rotation: 0, scale: 1, dpr: 1 }),
          () => ({ left: 0, top: 0, right: 612, bottom: 792, width: 612, height: 792, x: 0, y: 0, toJSON() {} }) as DOMRect,
        ),
      );

      const pictures = () => [...view.container.querySelectorAll('img')].map((image) => image.src);
      await waitFor(() => expect(pictures()).toHaveLength(2));
      const checkKey = annotationKey(check!.ref);
      expect(pictures()).toEqual([`blob:${annotationKey(text!.ref)}:null`, `blob:${checkKey}:Off`]);
      // Placed by the box the engine drew it into, in page pixels.
      expect(view.container.querySelectorAll('img')[1]!.style.top).toBe('140px');

      const checkbox = await waitFor(() => screen.getByRole('checkbox', { name: 'agree' }));
      fireEvent.click(checkbox);
      await waitFor(() => expect(pictures()[1]).toBe(`blob:${checkKey}:Yes`));
    } finally {
      view.unmount();
      await engine.destroy();
    }
  });
});
