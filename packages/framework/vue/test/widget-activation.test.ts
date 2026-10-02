import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computed, h, shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { pageTransform } from '@embedpdf/core-geometry';
import type { Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { actionsPlugin, ActionsToken } from '../src/actions';
import type { ActionExecutedEvent } from '../src/actions';
import { FormLayer, FormToken, formPlugin } from '../src/form';
import { interactionPlugin } from '../src/interaction';
import { makePageContext, providePage } from '../src/runtime';
import type { PageContextValue } from '../src/runtime';
import { probe, viewerWith } from './counter-plugin';

/**
 * A widget's action through the DOM: a click on a rendered `<FormLayer>` over
 * a real kernel and engine, on a real-world "fake button" (a read-only text
 * field carrying a widget `/A`, which Acrobat runs), proven by the actions
 * plugin's own event stream: the Hide executed.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(
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

describe('widget activation through the DOM (the fake-button pattern)', () => {
  it(
    'clicking a read-only text widget with an /A runs its action',
    { timeout: 45_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(fixture));
      // happy-dom's browser-shaped globals would steer the wasm toward fetch(): hand it over.
      const wasmBinary = new Uint8Array(await readFile(wasm));
      const engine = (await createLocalEngine({
        runtime: { prefer: 'wasm', wasmBinary },
      })) as unknown as Engine;
      const context = shallowRef<PageContextValue | null>(null);
      const Page = probe(() => {
        providePage(computed(() => context.value as PageContextValue));
        return () => (context.value ? h(FormLayer) : null);
      });
      const { kernel, wrapper } = await viewerWith(
        [
          interactionPlugin(),
          actionsPlugin({ openSequence: 'off' }), // scripting off: Hide is native
          annotationPlugin(),
          formPlugin(),
        ],
        () => h(Page),
        engine,
      );

      try {
        await kernel.documents.open({ kind: 'bytes', id: 'buttons', bytes });
        await vi.waitFor(() => expect(kernel.tryCapability(FormToken, undefined)).toBeTruthy(), {
          timeout: 20_000,
        });
        const form = kernel.capability(FormToken);
        const actions = kernel.capability(ActionsToken);
        await form.refresh();
        const fake = form.getSnapshot()?.fields.find((field) => field.name === 'fakeButton');
        expect(fake?.readOnly).toBe(true); // the shape this test is about
        const page = fake!.widgets[0]!.page!;

        const dispatched: ActionExecutedEvent[] = [];
        actions.onExecuted((event) => dispatched.push(event));

        context.value = makePageContext(
          'buttons',
          'test-view',
          page,
          0,
          { top: 0, right: 0, bottom: 0, left: 0 },
          pageTransform({ pageSize: { width: 612, height: 792 }, rotation: 0, scale: 1, dpr: 1 }),
          () => new DOMRect(0, 0, 612, 792),
        );

        // The fake button is a text control whose editor is disabled (and lets the pointer
        // through); its box runs the action.
        const input = await vi.waitFor(() => {
          const found = document.querySelector<HTMLInputElement>('input[aria-label="fakeButton"]');
          if (!found) throw new Error('no fake button yet');
          return found;
        });
        expect(input.disabled).toBe(true);

        input.parentElement!.click();

        await vi.waitFor(() => {
          const hide = dispatched.find((event) => event.tree.root?.type === 'hide');
          expect(hide).toBeTruthy();
          expect(hide!.result.nodes).toEqual([
            expect.objectContaining({ type: 'hide', status: 'executed' }),
          ]);
          expect(hide!.source).toMatchObject({ kind: 'widget' });
        });
      } finally {
        wrapper.unmount();
        // The kernel closes its documents first (a second destroy joins the Viewer's).
        await kernel.destroy();
        await engine.destroy();
      }
    },
  );
});
