import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computed, h, shallowRef } from 'vue';
import type { Ref, VNodeChild } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { pageTransform } from '@embedpdf/core-geometry';
import type { Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { InteractionToken } from '@embedpdf/plugin-interaction';
import { AnnotationLayer, annotationPlugin } from '../src/annotation';
import { interactionPlugin } from '../src/interaction';
import { FormLayer, FormToken, formPlugin, useFormEvent, useFormState } from '../src/form';
import type { FormDesignGroupChangedEvent, FormGroup } from '../src/form';
import { makePageContext, providePage } from '../src/runtime';
import type { PageContextValue } from '../src/runtime';
import { probe, settle, viewerWith } from './counter-plugin';

/**
 * Fields for several people, in the form layer and in design mode: a field in a group shows in
 * its group's color (a fill and an edge), named by the app or not, nothing shows while the tint
 * is 0, and the form's state says who the groups are and who new fields are placed for.
 */

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

const BUYER = '#2563eb';
// The edge of the buyer's color. The fill beside it is a `color-mix()`, which happy-dom doesn't
// keep in a style: `@embedpdf/web`'s own tests check it.
const EDGE = `inset 0 0 0 1px ${BUYER}`;
// The witness is named by nobody: second in the list, it gets the second of the eight colors.
const WITNESS = '#16a34a';
const WITNESS_EDGE = `inset 0 0 0 1px ${WITNESS}`;

/** The real engine. happy-dom's browser-shaped globals would steer the wasm toward fetch(): hand it over. */
async function realEngine(): Promise<Engine> {
  const wasmBinary = new Uint8Array(await readFile(wasm));
  return createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } }) as unknown as Engine;
}

/** A page context at scale 1 for a US Letter page: the layers only need the transform. */
const letterPage = (documentId: string, ref: PageContextValue['ref']) =>
  makePageContext(
    documentId,
    'test-view',
    ref,
    0,
    { top: 0, right: 0, bottom: 0, left: 0 },
    pageTransform({ pageSize: { width: 612, height: 792 }, rotation: 0, scale: 1, dpr: 1 }),
    () => new DOMRect(0, 0, 612, 792),
  );

/** A page that shows `content` once the test hands it a page context. */
function pageWith(context: Ref<PageContextValue | null>, content: () => VNodeChild) {
  return probe(() => {
    providePage(computed(() => context.value as PageContextValue));
    return () => (context.value ? content() : null);
  });
}

/** The one element `selector` finds, once it is there. */
const found = <Found extends Element>(selector: string) =>
  vi.waitFor(() => {
    const element = document.querySelector<Found>(selector);
    if (!element) throw new Error(`nothing matches ${selector} yet`);
    return element;
  });

describe('fields for several people', () => {
  it(
    'shows a field in its group’s color while filling and in design mode, and names whose it is',
    { timeout: 60_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
      const engine = await realEngine();
      const context = shallowRef<PageContextValue | null>(null);
      // What app code reads next to the layers: the form's groups, who new fields are placed
      // for, and each change of that.
      let groups!: Readonly<Ref<readonly FormGroup[]>>;
      let designGroup!: Readonly<Ref<string | null>>;
      const changes: FormDesignGroupChangedEvent[] = [];
      const Reader = probe(() => {
        // State refs stay reactive when destructured.
        ({ groups, designGroup } = useFormState());
        useFormEvent(
          (form) => form.onDesignGroupChanged,
          (event) => changes.push(event),
        );
      });
      const Page = pageWith(context, () => [
        h('div', { 'data-layer': 'annotation' }, [h(AnnotationLayer)]),
        h('div', { 'data-layer': 'form' }, [h(FormLayer)]),
      ]);
      const { kernel, wrapper } = await viewerWith(
        [interactionPlugin(), annotationPlugin(), formPlugin()],
        () => [h(Reader), h(Page)],
        engine,
      );

      try {
        await kernel.documents.open({ kind: 'bytes', id: 'blank', bytes });
        await vi.waitFor(() => expect(kernel.tryCapability(FormToken, undefined)).toBeTruthy(), {
          timeout: 20_000,
        });
        const form = kernel.capability(FormToken);
        const interaction = kernel.capability(InteractionToken);
        await form.refresh();
        // The app tells the document who its groups are.
        form.setGroups([{ id: 'buyer', label: 'Dana Smith', color: BUYER }]);
        const page = kernel.documents.getPage(0, 'blank')!.ref;
        const at = (y: number) => ({ x: 72, y, width: 160, height: 20 });
        await form.create({
          kind: 'text',
          name: 'name',
          groupId: 'buyer',
          widgets: [{ page, rect: at(100), color: '#94a3b8' }],
        });
        await form.create({
          kind: 'text',
          name: 'witness',
          groupId: 'witness',
          widgets: [{ page, rect: at(140), color: '#94a3b8' }],
        });
        await form.create({
          kind: 'listbox',
          name: 'choice',
          groupId: 'buyer',
          options: [{ label: 'One', value: 'One' }],
          widgets: [{ page, rect: { x: 72, y: 180, width: 160, height: 50 } }],
        });
        context.value = letterPage('blank', page);
        await settle();

        // Filling: the buyer's field says whose it is, and its box shows the buyer's color.
        const input = await found<HTMLInputElement>('input[aria-label="name, Dana Smith"]');
        const box = input.parentElement as HTMLElement;
        expect(box.style.boxShadow).toBe(EDGE);
        // A group nobody named shows too, in a color of the eight, and names nobody.
        const other = document.querySelector<HTMLInputElement>('input[aria-label="witness"]')!;
        expect((other.parentElement as HTMLElement).style.boxShadow).toBe(WITNESS_EDGE);
        // A list draws its own border: the color is that border's.
        const list = document.querySelector<HTMLSelectElement>(
          'select[aria-label="choice, Dana Smith"]',
        )!;
        expect(list.style.borderColor).toBe(BUYER);

        // The state: the form's groups, and who new fields are placed for.
        expect(designGroup.value).toBeNull();
        expect(groups.value).toEqual([
          { id: 'buyer', label: 'Dana Smith', color: BUYER },
          { id: 'witness', label: null, color: WITNESS },
        ]);
        form.setDesignGroup('buyer');
        await settle();
        expect(designGroup.value).toBe('buyer');
        expect(changes).toEqual([{ groupId: 'buyer' }]);

        // Design mode: the fields are lent to the annotation layer, which shows the buyer's
        // field in the buyer's color, above its drawing, and the other field with none.
        interaction.activateTool('form-edit');
        const layer = wrapper.find<HTMLElement>('[data-layer="annotation"]').element;
        const accents = (edge = EDGE) =>
          [...layer.querySelectorAll<HTMLElement>('div')].filter(
            (element) => element.style.boxShadow === edge,
          );
        await vi.waitFor(() => {
          expect(accents()).toHaveLength(2);
          expect(accents(WITNESS_EDGE)).toHaveLength(1);
          for (const accent of accents()) expect(accent.style.pointerEvents).toBe('none');
        });
        expect(wrapper.find('[data-layer="form"] input').exists()).toBe(false);

        // With the tint at 0, no field carries a color in either mode; the names stay.
        form.updateSettings({ fields: { tint: 0 } });
        await vi.waitFor(() => expect(accents()).toHaveLength(0));
        interaction.activateTool('pointer');
        const plain = await found<HTMLInputElement>('input[aria-label="name, Dana Smith"]');
        expect((plain.parentElement as HTMLElement).style.boxShadow).toBe('');
      } finally {
        wrapper.unmount();
        // The kernel closes its documents first (a second destroy joins the Viewer's).
        await kernel.destroy();
        await engine.destroy();
      }
    },
  );
});
