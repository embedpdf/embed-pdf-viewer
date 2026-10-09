import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computed, h, nextTick, shallowRef, watch } from 'vue';
import type { Ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageTransform } from '@embedpdf/core-geometry';
import { annotationKey, type Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import type { AnnotationRef } from '@embedpdf/plugin-annotation/contract';
import { RenderToken as RenderHostToken } from '@embedpdf/plugin-render/contract/host';
import { interactionPlugin } from '../src/interaction';
import { renderPlugin } from '../src/render';
import {
  FormLayer,
  FormToken,
  formPlugin,
  toFieldRef,
  useFormState,
  useFormValue,
} from '../src/form';
import type { FormFieldValue } from '../src/form';
import { makePageContext, providePage } from '../src/runtime';
import type { PageContextValue } from '../src/runtime';
import { probe, settle, viewerWith } from './counter-plugin';

/**
 * `<FormLayer>` without the annotation plugin, against the real engine: the
 * layer puts a real control over each field box, in the colors of the form
 * settings. Typing commits on blur, a click toggles, and a press stays out of
 * the page below while still reaching the field's PDF actions. With the render
 * plugin, it paints each field's picture too.
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

/** The real engine. happy-dom's browser-shaped globals would steer the wasm toward fetch(): hand it over. */
async function realEngine(): Promise<Engine> {
  const wasmBinary = new Uint8Array(await readFile(wasm));
  return createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } }) as unknown as Engine;
}

/** A page context at scale 1 for a US Letter page: the layer only needs the transform. */
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
function pageWith(context: Ref<PageContextValue | null>, content: () => ReturnType<typeof h>) {
  return probe(() => {
    providePage(computed(() => context.value as PageContextValue));
    return () => (context.value ? content() : null);
  });
}

afterEach(() => vi.restoreAllMocks());

describe('<FormLayer> over fields made from code', () => {
  it(
    'fills in a text box and a checkbox, and draws the edge of a field without a border',
    { timeout: 45_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
      const engine = await realEngine();
      const context = shallowRef<PageContextValue | null>(null);
      // What app code reads next to the layer: one field's value, and the fields.
      let name!: Readonly<Ref<FormFieldValue | null>>;
      let fieldCount!: Readonly<Ref<number>>;
      const nameChanges: Array<FormFieldValue | null> = [];
      const Reader = probe(() => {
        name = useFormValue(toFieldRef('name'));
        fieldCount = useFormState((state) => state.fields.length);
        watch(name, (value) => nameChanges.push(value));
      });
      const { kernel, wrapper } = await viewerWith(
        [interactionPlugin(), formPlugin({ fields: { border: '#ea580c' } })],
        () => [h(Reader), h(pageWith(context, () => h(FormLayer)))],
        engine,
      );

      try {
        await kernel.documents.open({ kind: 'bytes', id: 'blank', bytes });
        await vi.waitFor(() => expect(kernel.tryCapability(FormToken, undefined)).toBeTruthy(), {
          timeout: 20_000,
        });
        const form = kernel.capability(FormToken);
        await form.refresh();
        const page = kernel.documents.getPage(0, 'blank')!.ref;
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
        context.value = letterPage('blank', page);
        await settle();
        expect(fieldCount.value).toBe(2);

        const input = await vi.waitFor(() => {
          const found = document.querySelector<HTMLInputElement>('input[aria-label="name"]');
          if (!found) throw new Error('no text box yet');
          return found;
        });
        // The editor's listeners attach once the box is there.
        await nextTick();
        input.dispatchEvent(new FocusEvent('focus'));
        input.value = 'Ada Lovelace';
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new FocusEvent('blur'));
        await vi.waitFor(() =>
          expect(form.getValue(toFieldRef('name'))).toEqual({ value: 'Ada Lovelace' }),
        );
        await settle();
        expect(name.value).toEqual({ value: 'Ada Lovelace' });

        const checkbox = document.querySelector<HTMLElement>('[role="checkbox"][aria-label="agree"]')!;
        checkbox.click();
        await vi.waitFor(() =>
          expect(form.getValue(toFieldRef('agree'))).toEqual({ checked: true }),
        );
        await settle();
        // Another field changed: the name's ref kept its value.
        expect(nameChanges.at(-1)).toEqual({ value: 'Ada Lovelace' });
        expect(
          nameChanges.filter((value) => value && 'value' in value && value.value === 'Ada Lovelace'),
        ).toHaveLength(1);

        // The checkbox has no border of its own: the layer draws its edge in the setting's color.
        expect(checkbox.style.boxShadow).toContain('#ea580c');
        // The text box has its own border: no edge.
        expect((input.parentElement as HTMLElement).style.boxShadow).toBe('');

        // A press on a field stops at its box, before the page below sees it, and still reaches
        // the field's PDF actions as "mouse down" (the box's own native listener sends it).
        const host = kernel.capability(FormHostToken);
        const events: string[] = [];
        vi.spyOn(host, 'notifyWidgetEvent').mockImplementation((_field, _widget, event) => {
          events.push(event);
        });
        const pagePresses: Event[] = [];
        const pageBelow = wrapper.find('[data-testid="mounted"]').element;
        const onPagePress = (event: Event) => pagePresses.push(event);
        pageBelow.addEventListener('pointerdown', onPagePress);
        input.parentElement!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        pageBelow.removeEventListener('pointerdown', onPagePress);
        expect(events).toContain('mouseDown');
        expect(pagePresses).toHaveLength(0);
      } finally {
        wrapper.unmount();
        // The kernel closes its documents first (a second destroy joins the Viewer's).
        await kernel.destroy();
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
  it(
    'paints each field, and a checkbox its new state once it changes',
    { timeout: 45_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
      const engine = await realEngine();
      const context = shallowRef<PageContextValue | null>(null);
      const { kernel, wrapper } = await viewerWith(
        [interactionPlugin(), renderPlugin(), formPlugin()],
        () => h(pageWith(context, () => h(FormLayer))),
        engine,
      );

      try {
        await kernel.documents.open({ kind: 'bytes', id: 'blank', bytes });
        await vi.waitFor(() => expect(kernel.tryCapability(FormToken, undefined)).toBeTruthy(), {
          timeout: 20_000,
        });
        const form = kernel.capability(FormToken);
        await form.refresh();
        const page = kernel.documents.getPage(0, 'blank')!.ref;
        await form.create({
          family: 'text',
          name: 'name',
          widgets: [{ page, rect: { x: 72, y: 100, width: 160, height: 20 } }],
        });
        await form.create({
          family: 'checkbox',
          name: 'agree',
          widgets: [{ page, rect: { x: 72, y: 140, width: 14, height: 14 } }],
        });
        const [text, check] = kernel.capability(FormHostToken).listShownWidgets(page);
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
        vi.spyOn(kernel.capability(RenderHostToken), 'renderFieldAppearances').mockResolvedValue([
          picture(text!.ref, null, { x: 72, y: 100, width: 160, height: 20 }),
          picture(check!.ref, 'Off', checkBox),
          picture(check!.ref, 'Yes', checkBox),
        ] as never);
        context.value = letterPage('blank', page);

        const pictures = () =>
          [...wrapper.element.ownerDocument.querySelectorAll('img')].map((image) =>
            image.getAttribute('src'),
          );
        await vi.waitFor(() => expect(pictures()).toHaveLength(2));
        const checkKey = annotationKey(check!.ref);
        expect(pictures()).toEqual([
          `blob:${annotationKey(text!.ref)}:null`,
          `blob:${checkKey}:Off`,
        ]);
        // Placed by the box the engine drew it into, in page pixels.
        expect(document.querySelectorAll('img')[1]!.style.top).toBe('140px');

        document.querySelector<HTMLElement>('[role="checkbox"][aria-label="agree"]')!.click();
        await vi.waitFor(() =>
          expect(form.getValue(toFieldRef('agree'))).toEqual({ checked: true }),
        );
        await vi.waitFor(() => expect(pictures()[1]).toBe(`blob:${checkKey}:Yes`));
      } finally {
        wrapper.unmount();
        await kernel.destroy();
        await engine.destroy();
      }
    },
  );
});
