import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushSync } from 'svelte';
import { fireEvent, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { pageTransform } from '@embedpdf/core-geometry';
import type { Engine, PageRef } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { actionsPlugin, ActionsToken } from '@embedpdf/plugin-actions';
import type { ActionExecutedEvent } from '@embedpdf/plugin-actions';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { FormToken, formPlugin, toFieldRef } from '../../src/form';
import { interactionPlugin } from '../../src/interaction';
import { makePageContext, type PageContextValue } from '../../src/runtime';
import FormHarness from '../fixtures/FormHarness.svelte';
import { signal } from '../fixtures/signal.svelte';
import { viewerWith } from '../fixtures/viewer';

/**
 * `<FormLayer>` over a real kernel and engine. Without the annotation plugin the field's picture
 * comes from the page raster, and the layer puts a real control over each field box, in the
 * colors of the form settings: typing commits on blur, a click toggles, and a press stops at the
 * box yet still reaches the field's "mouse down" action. A click on a widget runs its `/A`
 * action, the read-only "fake button" too.
 */

const here = dirname(fileURLToPath(import.meta.url));
const packages = resolve(here, '..', '..', '..', '..');
const fixtures = resolve(packages, 'engine', 'main', 'test', 'fixtures');
const wasmPath = resolve(packages, 'engine', 'runtime', 'npm', 'wasm32', 'lib', 'embedpdf.wasm');

const NO_FRAME = { top: 0, right: 0, bottom: 0, left: 0 };

/** A real engine on the wasm runtime. */
async function wasmEngine(): Promise<Engine> {
  // happy-dom's browser-shaped globals would steer the wasm toward fetch(): hand it over.
  const wasmBinary = new Uint8Array(await readFile(wasmPath));
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });
  return engine as unknown as Engine;
}

/** A 612 × 792 page at 100%, its box at the client origin: the layer only needs the transform. */
const letterPage = (documentId: string, ref: PageRef): PageContextValue =>
  makePageContext(
    documentId,
    'test-view',
    ref,
    0,
    NO_FRAME,
    pageTransform({ pageSize: { width: 612, height: 792 }, rotation: 0, scale: 1, dpr: 1 }),
    () => new DOMRect(0, 0, 612, 792),
  );

describe('<FormLayer> over fields made from code', () => {
  it(
    'fills in a text box and a checkbox, and draws the edge of a field without a border',
    { timeout: 45_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
      const engine = await wasmEngine();
      const page = signal<PageContextValue | null>(null);
      const stagePresses: Event[] = [];
      const { kernel, view } = await viewerWith(
        [interactionPlugin(), formPlugin({ fields: { border: '#ea580c' } })],
        FormHarness,
        { page, stagePresses },
        engine,
      );

      try {
        await kernel.documents.open({ kind: 'bytes', id: 'blank', bytes });
        await waitFor(() => expect(kernel.tryCapability(FormToken, undefined)).toBeTruthy(), {
          timeout: 20_000,
        });
        const form = kernel.capability(FormToken);
        await form.refresh();
        const ref = kernel.documents.getPage(0, 'blank')!.ref;
        await form.create({
          family: 'text',
          name: 'name',
          widgets: [{ page: ref, rect: { x: 72, y: 100, width: 160, height: 20 }, color: '#94a3b8' }],
        });
        await form.create({
          family: 'checkbox',
          name: 'agree',
          widgets: [{ page: ref, rect: { x: 72, y: 140, width: 14, height: 14 } }],
        });
        page.value = letterPage('blank', ref);
        flushSync();

        const input = (await waitFor(() => view.getByLabelText('name'))) as HTMLInputElement;
        await fireEvent.focus(input);
        await fireEvent.input(input, { target: { value: 'Ada Lovelace' } });
        await fireEvent.blur(input);
        await waitFor(() =>
          expect(form.getValue(toFieldRef('name'))).toEqual({ value: 'Ada Lovelace' }),
        );

        const checkbox = await waitFor(() => view.getByRole('checkbox', { name: 'agree' }));
        await fireEvent.click(checkbox);
        await waitFor(() => expect(form.getValue(toFieldRef('agree'))).toEqual({ checked: true }));

        // The checkbox has no border of its own: the layer draws its edge in the setting's color.
        expect(checkbox.style.boxShadow).toContain('#ea580c');
        // The text box has its own border: no edge.
        expect((input.parentElement as HTMLElement).style.boxShadow).toBe('');

        // A press on a field stops at its box, before the page below sees it, and still reaches
        // the field's PDF actions as "mouse down" (the box's native listener sends it).
        const host = kernel.capability(FormHostToken);
        const events: string[] = [];
        vi.spyOn(host, 'notifyWidgetEvent').mockImplementation((_field, _widget, event) => {
          events.push(event);
        });
        await fireEvent.pointerDown(input.parentElement as HTMLElement);
        expect(events).toEqual(['mouseDown']);
        expect(stagePresses).toHaveLength(0);
      } finally {
        view.unmount();
        // The kernel closes its documents first (a second destroy joins the viewer's).
        await kernel.destroy();
        await engine.destroy();
      }
    },
  );
});

/**
 * A dropdown is an invisible native select over the field's picture: it shows the field's value
 * whenever that changes, whoever changed it, and a choice in it writes through the plugin.
 */
describe('a dropdown in the form layer', () => {
  it('shows the field’s value and writes a choice', { timeout: 45_000 }, async () => {
    const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
    const engine = await wasmEngine();
    const page = signal<PageContextValue | null>(null);
    const { kernel, view } = await viewerWith(
      [interactionPlugin(), formPlugin()],
      FormHarness,
      { page },
      engine,
    );

    try {
      await kernel.documents.open({ kind: 'bytes', id: 'blank', bytes });
      await waitFor(() => expect(kernel.tryCapability(FormToken, undefined)).toBeTruthy(), {
        timeout: 20_000,
      });
      const form = kernel.capability(FormToken);
      await form.refresh();
      const ref = kernel.documents.getPage(0, 'blank')!.ref;
      await form.create({
        family: 'combobox',
        name: 'country',
        options: [
          { label: 'Netherlands', value: 'NL' },
          { label: 'Belgium', value: 'BE' },
        ],
        widgets: [{ page: ref, rect: { x: 72, y: 100, width: 160, height: 20 } }],
      });
      page.value = letterPage('blank', ref);
      flushSync();

      const select = (await waitFor(() => view.getByLabelText('country'))) as HTMLSelectElement;
      // Nothing chosen yet: an empty row shows.
      expect(select.value).toBe('');

      await form.setValue(toFieldRef('country'), { value: 'BE' });
      await waitFor(() => expect(select.value).toBe('BE'));

      await fireEvent.change(select, { target: { value: 'NL' } });
      await waitFor(() => expect(form.getValue(toFieldRef('country'))).toEqual({ value: 'NL' }));
      expect(select.value).toBe('NL');
    } finally {
      view.unmount();
      // The kernel closes its documents first (a second destroy joins the viewer's).
      await kernel.destroy();
      await engine.destroy();
    }
  });
});

/**
 * The regression net for DOM click → activate routing: a real-world "fake button" (a read-only
 * text field carrying a widget `/A`) must run its action from a click on its box. The proof is
 * the actions dispatcher's own event stream: the `/A` Hide executed.
 */
describe('widget activation through the DOM (the fake-button pattern)', () => {
  it(
    'clicking a read-only text widget with /A dispatches and executes its action',
    { timeout: 45_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(resolve(fixtures, 'action_buttons_form.pdf')));
      const engine = await wasmEngine();
      const page = signal<PageContextValue | null>(null);
      const { kernel, view } = await viewerWith(
        [
          interactionPlugin(),
          actionsPlugin({ openSequence: 'off' }), // scripting off: Hide is native
          annotationPlugin(),
          formPlugin(),
        ],
        FormHarness,
        { page },
        engine,
      );

      try {
        await kernel.documents.open({ kind: 'bytes', id: 'buttons', bytes });
        await waitFor(() => expect(kernel.tryCapability(FormToken, undefined)).not.toBeNull(), {
          timeout: 20_000,
        });
        const form = kernel.capability(FormToken);
        const actions = kernel.capability(ActionsToken);
        await form.refresh();
        const fake = form.getSnapshot()?.fields.find((field) => field.name === 'fakeButton');
        expect(fake?.readOnly).toBe(true); // the Test Lab shape, pinned

        const dispatched: ActionExecutedEvent[] = [];
        actions.onExecuted((event) => dispatched.push(event));
        page.value = letterPage('buttons', fake!.widgets[0]!.page!);
        flushSync();

        // The fake button is a text control with a disabled, pointer-transparent editor; its box
        // owns activation.
        const input = (await waitFor(() => view.getByLabelText('fakeButton'))) as HTMLInputElement;
        expect(input.disabled).toBe(true);

        await fireEvent.click(input.parentElement!);

        await waitFor(() => {
          const hide = dispatched.find((event) => event.tree.root?.type === 'hide');
          expect(hide).toBeTruthy();
          expect(hide!.result.nodes).toEqual([
            expect.objectContaining({ type: 'hide', status: 'executed' }),
          ]);
          expect(hide!.source).toMatchObject({ kind: 'widget' });
        });
      } finally {
        view.unmount();
        // The kernel closes its documents first (a second destroy joins the viewer's).
        await kernel.destroy();
        await engine.destroy();
      }
    },
  );
});
