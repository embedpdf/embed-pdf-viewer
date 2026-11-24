import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushSync } from 'svelte';
import { waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { pageTransform } from '@embedpdf/core-geometry';
import type { Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import {
  FormToken,
  formPlugin,
  useFormEvent,
  useFormState,
  type FormDesignGroupChangedEvent,
  type FormState,
} from '../../src/form';
import { interactionPlugin } from '../../src/interaction';
import { makePageContext, type PageContextValue } from '../../src/runtime';
import FormDesignHarness from '../fixtures/FormDesignHarness.svelte';
import { signal } from '../fixtures/signal.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

const here = dirname(fileURLToPath(import.meta.url));
const packages = resolve(here, '..', '..', '..', '..');
const blank = resolve(packages, 'engine', 'main', 'test', 'fixtures', 'hello_world.pdf');
const wasmPath = resolve(packages, 'engine', 'runtime', 'npm', 'wasm32', 'lib', 'embedpdf.wasm');

const BUYER = '#2563eb';
// The edge of the buyer's color. The fill beside it is a `color-mix()`, which happy-dom doesn't
// keep in a style: `@embedpdf/web`'s own tests check it.
const EDGE = `inset 0 0 0 1px ${BUYER}`;
// The witness is named by nobody: second in the list, it gets the second of the eight colors.
const WITNESS = '#16a34a';
const WITNESS_EDGE = `inset 0 0 0 1px ${WITNESS}`;

/**
 * Fields for several people, in the form layer and in design mode: a field in a group shows in
 * its group's color (a fill and an edge), named by the app or not, nothing shows while the tint
 * is 0, and the form's state says who the groups are and who new fields are placed for.
 */
describe('fields for several people', () => {
  it(
    'shows a field in its group’s color while filling and in design mode, and names whose it is',
    { timeout: 60_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(blank));
      // happy-dom's browser-shaped globals would steer the wasm toward fetch(): hand it over.
      const wasmBinary = new Uint8Array(await readFile(wasmPath));
      const engine = (await createLocalEngine({
        runtime: { prefer: 'wasm', wasmBinary },
      })) as unknown as Engine;
      const page = signal<PageContextValue | null>(null);
      const states: Pick<FormState, 'designGroup' | 'groups'>[] = [];
      const changes: FormDesignGroupChangedEvent[] = [];
      const { kernel, view } = await viewerWith(
        [interactionPlugin(), annotationPlugin(), formPlugin()],
        FormDesignHarness,
        {
          page,
          probes: [
            {
              read: () => {
                useFormEvent(
                  (form) => form.onDesignGroupChanged,
                  (event) => changes.push(event),
                );
                return useFormState();
              },
              // Each field is read on its own: the state is one object whose fields are getters.
              pick: (state: unknown) => ({
                designGroup: (state as FormState).designGroup,
                groups: (state as FormState).groups,
              }),
              seen: states,
            },
          ],
        },
        engine,
      );

      try {
        await kernel.documents.open({ kind: 'bytes', id: 'blank', bytes });
        await waitFor(() => expect(kernel.tryCapability(FormToken, undefined)).toBeTruthy(), {
          timeout: 20_000,
        });
        const form = kernel.capability(FormToken);
        const interaction = kernel.capability(InteractionToken);
        await form.refresh();
        // The app tells the document who its groups are.
        form.setGroups([{ id: 'buyer', label: 'Dana Smith', color: BUYER }]);
        const ref = kernel.documents.getPage(0, 'blank')!.ref;
        const at = (y: number) => ({ x: 72, y, width: 160, height: 20 });
        await form.create({
          kind: 'text',
          name: 'name',
          groupId: 'buyer',
          widgets: [{ page: ref, rect: at(100), color: '#94a3b8' }],
        });
        await form.create({
          kind: 'text',
          name: 'witness',
          groupId: 'witness',
          widgets: [{ page: ref, rect: at(140), color: '#94a3b8' }],
        });
        await form.create({
          kind: 'listbox',
          name: 'choice',
          groupId: 'buyer',
          options: [{ label: 'One', value: 'One' }],
          widgets: [{ page: ref, rect: { x: 72, y: 180, width: 160, height: 50 } }],
        });

        page.value = makePageContext(
          'blank',
          'test-view',
          ref,
          0,
          { top: 0, right: 0, bottom: 0, left: 0 },
          pageTransform({ pageSize: { width: 612, height: 792 }, rotation: 0, scale: 1, dpr: 1 }),
          () => new DOMRect(0, 0, 612, 792),
        );
        flushSync();

        // Filling: the buyer's field says whose it is, and its box shows the buyer's color.
        const input = (await waitFor(() =>
          view.getByLabelText('name, Dana Smith'),
        )) as HTMLInputElement;
        const box = input.parentElement as HTMLElement;
        expect(box.style.boxShadow).toBe(EDGE);
        // A group nobody named shows too, in a color of the eight, and names nobody.
        const other = view.getByLabelText('witness').parentElement as HTMLElement;
        expect(other.style.boxShadow).toBe(WITNESS_EDGE);
        // A list draws its own border: the color is that border's.
        const list = view.getByLabelText('choice, Dana Smith') as HTMLSelectElement;
        expect(list.style.borderColor).toBe(BUYER);

        // The state: the form's groups, and who new fields are placed for.
        expect(latest(states).designGroup).toBeNull();
        expect(latest(states).groups).toEqual([
          { id: 'buyer', label: 'Dana Smith', color: BUYER },
          { id: 'witness', label: null, color: WITNESS },
        ]);
        form.setDesignGroup('buyer');
        flushSync();
        expect(latest(states).designGroup).toBe('buyer');
        expect(changes).toEqual([{ groupId: 'buyer' }]);

        // Design mode: the fields are lent to the annotation layer, which shows the buyer's
        // field in the buyer's color, above its drawing, and the other field with none.
        interaction.activateTool('form-edit');
        flushSync();
        const layer = view.container.querySelector('[data-layer="annotation"]') as HTMLElement;
        const accents = (edge = EDGE) =>
          [...layer.querySelectorAll<HTMLElement>('div')].filter(
            (element) => element.style.boxShadow === edge,
          );
        await waitFor(() => {
          expect(accents()).toHaveLength(2);
          expect(accents(WITNESS_EDGE)).toHaveLength(1);
          for (const accent of accents()) expect(accent.style.pointerEvents).toBe('none');
        });
        expect(view.container.querySelector('[data-layer="form"] input')).toBeNull();

        // With the tint at 0, no field carries a color in either mode; the names stay.
        form.updateSettings({ fields: { tint: 0 } });
        flushSync();
        await waitFor(() => expect(accents()).toHaveLength(0));
        interaction.activateTool('pointer');
        flushSync();
        const plain = (await waitFor(() =>
          view.getByLabelText('name, Dana Smith'),
        )) as HTMLInputElement;
        expect((plain.parentElement as HTMLElement).style.boxShadow).toBe('');
      } finally {
        view.unmount();
        await kernel.destroy();
        await engine.destroy();
      }
    },
  );
});
