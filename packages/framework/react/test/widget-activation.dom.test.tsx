// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { pageTransform } from '@embedpdf/core-geometry';
import type { Kernel } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { actionsPlugin, ActionsToken } from '@embedpdf/plugin-actions';
import type { ActionDispatchEvent } from '@embedpdf/plugin-actions';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { formPlugin, FormToken } from '@embedpdf/plugin-form';
import { interactionPlugin } from '@embedpdf/plugin-interaction';

import { FormLayer } from '../src/form';
import { makePageContext, PageProvider, useKernel, Viewer } from '../src/runtime';
import type { PageContextValue } from '../src/runtime';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'engine',
  'main',
  'test',
  'fixtures',
  'action_buttons_form.pdf',
);

/**
 * THE regression net the Test Lab exposed: every prior proof activated
 * widgets through `form.activateWidget(...)` directly, so the DOM
 * click→activate routing was never exercised — and a real-world "fake
 * button" (a READ-ONLY /FT /Tx field carrying a widget /A, the Test Lab's
 * Reset/Next/Hide shape) was dead in the viewer. This test goes through the
 * REAL DOM: a rendered FormLayer over a real kernel + real engine, a click
 * on the fake button's box, and the dispatcher's own event stream as proof
 * the /A Hide executed.
 */
describe('widget activation through the DOM (the fake-button pattern)', () => {
  afterEach(cleanup);

  it('clicking a read-only text widget with /A dispatches and executes its action', { timeout: 45_000 }, async () => {
    const bytes = new Uint8Array(await readFile(fixturePath));
    // happy-dom's browser-shaped globals would steer the default wasm
    // resolution toward fetch(); hand the binary over directly instead.
    const wasmBinary = new Uint8Array(
      await readFile(
        resolve(here, '..', '..', '..', 'engine', 'runtime', 'npm', 'wasm32', 'lib', 'embedpdf.wasm'),
      ),
    );
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });
    const plugins = [
      interactionPlugin(),
      actionsPlugin({ openSequence: 'off' }), // scripting OFF — Hide is native
      annotationPlugin(),
      formPlugin(),
    ];

    let kernel: Kernel | null = null;
    let setPage!: (page: PageContextValue) => void;
    function Grab() {
      const k = useKernel();
      useEffect(() => {
        kernel = k;
      }, [k]);
      return null;
    }
    function Stagelet() {
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
        initialDocuments={[{ source: { kind: 'bytes', id: 'buttons', bytes } }]}
      >
        <Grab />
        <Stagelet />
      </Viewer>,
    );

    try {
      // Wait for the document to be ready enough that capabilities resolve
      // (the wasm runtime boots inside this window).
      await waitFor(
        () => {
          expect(kernel).not.toBeNull();
          expect(kernel!.tryCapability(FormToken, undefined)).not.toBeNull();
        },
        { timeout: 20_000 },
      );
      const form = kernel!.capability(FormToken);
      const actions = kernel!.capability(ActionsToken);
      await form.refresh();
      const snapshot = form.snapshot();
      const fake = snapshot?.fields.find((field) => field.name === 'fakeButton');
      expect(fake?.flags.readOnly).toBe(true); // the Test Lab shape, pinned
      const pon = fake!.widgets[0]!.pageObjectNumber;

      const dispatched: ActionDispatchEvent[] = [];
      actions.onAction((event) => dispatched.push(event));

      // A synthetic page context — the layer only needs the transform seam.
      const transform = pageTransform({
        pageSize: { width: 612, height: 792 },
        rotation: 0,
        scale: 1,
        dpr: 1,
      });
      setPage(
        makePageContext(
          'buttons',
          'test-view',
          pon,
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

      // The fake button renders as a fill TEXT control (disabled editor,
      // pointer-transparent); its BOX owns activation.
      const input = await waitFor(() => screen.getByLabelText('fakeButton'));
      expect((input as HTMLInputElement).disabled).toBe(true);

      fireEvent.click(input.parentElement!);

      // The full chain, proven at the dispatcher's own event stream: the
      // widget /A resolved and its Hide EXECUTED.
      await waitFor(() => {
        const hide = dispatched.find((event) => event.tree.root?.type === 'hide');
        expect(hide).toBeTruthy();
        expect(hide!.result.nodes).toEqual([
          expect.objectContaining({ type: 'hide', status: 'executed' }),
        ]);
        expect(hide!.ctx.origin).toBe('user');
      });
    } finally {
      view.unmount();
      await engine.destroy();
    }
  });
});
