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
import { InteractionToken as InteractionHostToken } from '@embedpdf/plugin-interaction/contract/host';
import { AnnotationLayer, annotationPlugin } from '../src/annotation';
import { interactionPlugin } from '../src/interaction';
import { FormLayer, FormToken, formPlugin } from '../src/form';
import { makePageContext, providePage } from '../src/runtime';
import { signaturePlugin, SignatureToken } from '../src/signature';
import type { PageContextValue } from '../src/runtime';
import { probe, settle, viewerWith } from './counter-plugin';

/**
 * What a field is for, in the form layer and in design mode: an empty field with a purpose shows
 * the purpose's name, as the layer's paint and never as the field's value; its text box tells
 * the browser what it holds; and a field without a purpose is drawn as it always was. A signature
 * box with a mark drawn in it holds the mark, so it shows no placeholder.
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

const PLACEHOLDER = '[data-epdf-placeholder]';

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

/** Type `value` into a text box, as a person would: the box's `input` event carries it. */
async function type(input: HTMLInputElement, value: string): Promise<void> {
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle();
}

describe('what a field is for', () => {
  it(
    'shows an empty field’s purpose while filling and in design mode, and sets autocomplete',
    { timeout: 60_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
      const engine = await realEngine();
      const context = shallowRef<PageContextValue | null>(null);
      const Page = pageWith(context, () => [
        h('div', { 'data-layer': 'annotation' }, [h(AnnotationLayer)]),
        h('div', { 'data-layer': 'form' }, [h(FormLayer)]),
      ]);
      const { kernel, wrapper } = await viewerWith(
        [interactionPlugin(), annotationPlugin(), formPlugin(), signaturePlugin()],
        () => [h(Page)],
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
        const page = kernel.documents.getPage(0, 'blank')!.ref;
        const at = (y: number) => ({ x: 72, y, width: 160, height: 20 });
        const text = (name: string, y: number, more: Record<string, unknown> = {}) =>
          form.create({
            kind: 'text',
            name,
            widgets: [{ page, rect: at(y), color: '#94a3b8', fontSize: 10 }],
            ...more,
          } as never);
        await text('who', 100, { purpose: 'name' });
        await text('mail', 130, { purpose: 'email' });
        await text('plain', 160);
        await text('ticket', 190, { purpose: 'ticket-number' });
        await text('notes', 220, { purpose: 'organization-title', multiline: true });
        await form.create({
          kind: 'combobox',
          name: 'firm',
          purpose: 'organization',
          options: [{ label: 'Fernquill', value: 'Fernquill' }],
          widgets: [{ page, rect: at(260) }],
        });
        await form.create({
          kind: 'signature',
          name: 'sign',
          purpose: 'signature',
          widgets: [{ page, rect: { x: 72, y: 300, width: 160, height: 48 } }],
        });
        await form.create({
          kind: 'checkbox',
          name: 'tick',
          purpose: 'name',
          widgets: [{ page, rect: { x: 72, y: 360, width: 18, height: 18 } }],
        });
        await form.setValue({ kind: 'fqn', name: 'mail' }, { value: 'dana@fernquill.example' });
        context.value = letterPage('blank', page);
        await settle();

        const layer = wrapper.find<HTMLElement>('[data-layer="form"]').element;
        const labelled = <Found extends HTMLElement>(label: string) =>
          layer.querySelector<Found>(`[aria-label="${label}"]`)!;
        const boxOf = (label: string) => labelled(label).parentElement as HTMLElement;
        const shownIn = (box: HTMLElement) => box.querySelector<HTMLElement>(PLACEHOLDER);

        // An empty field with a purpose shows the purpose's name, over its picture.
        const who = await found<HTMLInputElement>('input[aria-label="who"]');
        const shown = shownIn(boxOf('who'))!;
        expect(shown.textContent).toBe('Name');
        // The layer's paint, not the field's value: no pointer, no selection, hidden from a
        // screen reader, which hears it on the text box instead.
        expect(shown.getAttribute('aria-hidden')).toBe('true');
        expect(shown.style.pointerEvents).toBe('none');
        expect(shown.style.userSelect).toBe('none');
        expect(shown.style.fontSize).toBe('10px');
        expect(who.value).toBe('');
        expect(who.getAttribute('aria-placeholder')).toBe('Name');
        // The browser may offer the person's saved name: the purpose is the web's own token.
        expect(who.getAttribute('autocomplete')).toBe('name');

        // A field that holds a value shows the value, and still says what it holds.
        const mail = labelled<HTMLInputElement>('mail');
        expect(shownIn(boxOf('mail'))).toBeNull();
        expect(mail.getAttribute('autocomplete')).toBe('email');
        expect(mail.hasAttribute('aria-placeholder')).toBe(false);

        // A field without a purpose is drawn as it always was.
        const plain = labelled<HTMLInputElement>('plain');
        expect(shownIn(boxOf('plain'))).toBeNull();
        expect(plain.hasAttribute('autocomplete')).toBe(false);
        expect(plain.hasAttribute('aria-placeholder')).toBe(false);
        // So is one whose purpose is a word nobody named: no label, and no token of the web's.
        const ticket = labelled<HTMLInputElement>('ticket');
        expect(shownIn(boxOf('ticket'))).toBeNull();
        expect(ticket.hasAttribute('autocomplete')).toBe(false);

        // A box for several lines starts its placeholder at the top.
        const notes = shownIn(boxOf('notes'))!;
        expect(notes.textContent).toBe('Title');
        expect(notes.style.alignItems).toBe('flex-start');
        expect(labelled('notes').getAttribute('autocomplete')).toBe('organization-title');

        // A dropdown and a signature field show theirs; a checkbox has no room for one.
        expect(shownIn(boxOf('firm'))!.textContent).toBe('Organization');
        const sign = [...layer.querySelectorAll<HTMLElement>(PLACEHOLDER)].find(
          (element) => element.textContent === 'Signature',
        );
        expect(sign).toBeDefined();
        expect(shownIn(labelled('tick'))).toBeNull();
        expect(layer.querySelectorAll(PLACEHOLDER)).toHaveLength(4);

        // The first character typed takes the placeholder away, before anything is written.
        who.dispatchEvent(new FocusEvent('focus'));
        await type(who, 'D');
        expect(shownIn(boxOf('who'))).toBeNull();
        await type(who, '');
        expect(shownIn(boxOf('who'))!.textContent).toBe('Name');
        who.dispatchEvent(new FocusEvent('blur'));

        // Design mode: the fields are lent to the annotation layer, which shows the same words
        // on the empty ones.
        interaction.activateTool('form-edit');
        const lent = wrapper.find<HTMLElement>('[data-layer="annotation"]').element;
        const lentWords = () =>
          [...lent.querySelectorAll<HTMLElement>(PLACEHOLDER)].map(
            (element) => element.textContent,
          );
        await vi.waitFor(() =>
          expect(lentWords().sort()).toEqual(['Name', 'Organization', 'Signature', 'Title']),
        );
        for (const element of lent.querySelectorAll<HTMLElement>(PLACEHOLDER)) {
          expect(element.style.pointerEvents).toBe('none');
          expect(element.getAttribute('aria-hidden')).toBe('true');
        }
        expect(wrapper.find('[data-layer="form"] input').exists()).toBe(false);

        // Filled in from code, a field shows no placeholder in either mode.
        await form.setValue({ kind: 'fqn', name: 'who' }, { value: 'Dana Smith' });
        await vi.waitFor(() => expect(lentWords()).not.toContain('Name'));
        interaction.activateTool('pointer');
        await found<HTMLInputElement>('input[aria-label="who"]');
        expect(shownIn(boxOf('who'))).toBeNull();
        expect(layer.querySelectorAll(PLACEHOLDER)).toHaveLength(3);

        // A mark drawn into the signature field, without signing: the box holds the mark, so
        // the word goes, while filling and in design mode. Taken out, the word is back.
        const signature = kernel.capability(SignatureToken);
        const signField = { kind: 'fqn' as const, name: 'sign' };
        const mark = {
          source: new Uint8Array(await readFile(resolve(fixtures, 'signature_artwork.pdf'))),
        };
        const wordsIn = (root: Element) =>
          [...root.querySelectorAll<HTMLElement>(PLACEHOLDER)].map(
            (element) => element.textContent,
          );
        expect(wordsIn(layer).sort()).toEqual(['Organization', 'Signature', 'Title']);
        await signature.fillField(signField, mark);
        await vi.waitFor(() => expect(wordsIn(layer).sort()).toEqual(['Organization', 'Title']));
        interaction.activateTool('form-edit');
        await vi.waitFor(() => expect(lentWords().sort()).toEqual(['Organization', 'Title']));
        await signature.clearField(signField);
        await vi.waitFor(() =>
          expect(lentWords().sort()).toEqual(['Organization', 'Signature', 'Title']),
        );
        interaction.activateTool('pointer');
        await vi.waitFor(() =>
          expect(wordsIn(layer).sort()).toEqual(['Organization', 'Signature', 'Title']),
        );
      } finally {
        wrapper.unmount();
        // The kernel closes its documents first (a second destroy joins the Viewer's).
        await kernel.destroy();
        await engine.destroy();
      }
    },
  );

  it(
    'paints only the fields you fill in, shows the date as text with its hint, and outlines and ghosts a field with no look',
    { timeout: 60_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
      const engine = await realEngine();
      const EDGE = '#64748b';
      const context = shallowRef<PageContextValue | null>(null);
      const Page = pageWith(context, () => [
        h('div', { 'data-layer': 'annotation' }, [h(AnnotationLayer)]),
        h('div', { 'data-layer': 'form' }, [h(FormLayer)]),
      ]);
      const { kernel, wrapper } = await viewerWith(
        [
          interactionPlugin(),
          annotationPlugin(),
          formPlugin({
            fields: { border: EDGE },
            // A tool with no border and no background: its ghost and its field show by an outline.
            tools: [
              {
                id: 'form-bare',
                extends: 'form-name',
                defaults: { color: null, interiorColor: null },
              },
            ],
          }),
        ],
        () => [h(Page)],
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
        const page = kernel.documents.getPage(0, 'blank')!.ref;
        const at = (y: number) => ({ x: 72, y, width: 160, height: 20 });
        // No border of their own: what the viewer paints around them is all the edge they have.
        const text = (name: string, y: number, more: Record<string, unknown> = {}) =>
          form.create({ kind: 'text', name, widgets: [{ page, rect: at(y) }], ...more } as never);
        await text('open', 100, { purpose: 'email' });
        await text('locked', 140, { purpose: 'name', readOnly: true });
        await text('day', 180, {
          purpose: 'date-signed',
          readOnly: true,
          format: { kind: 'date', pattern: 'yyyy-mm-dd' },
        });
        context.value = letterPage('blank', page);
        await settle();

        const layer = wrapper.find<HTMLElement>('[data-layer="form"]').element;
        const lent = wrapper.find<HTMLElement>('[data-layer="annotation"]').element;
        const labelled = <Found extends HTMLElement>(label: string) =>
          layer.querySelector<Found>(`[aria-label="${label}"]`)!;
        const boxOf = (label: string) => labelled(label).parentElement as HTMLElement;

        // Yours: the edge `fields.border` gives, and what it's for.
        await found('[aria-label="open"]');
        expect(form.listWidgets(page).every((item) => item.look.border === null)).toBe(true);
        expect(boxOf('open').style.boxShadow).toBe(
          `inset 0 0 0 1px var(--epdf-form-field-border, ${EDGE})`,
        );
        expect(boxOf('open').querySelector(PLACEHOLDER)!.textContent).toBe('Email');
        // Read-only: as the PDF has it, no edge and no placeholder.
        expect(boxOf('locked').style.boxShadow).toBe('');
        expect(boxOf('locked').querySelector(PLACEHOLDER)).toBeNull();
        // The day of signing reads as text: no edge, nothing to type, and its hint.
        const day = labelled<HTMLInputElement>('day');
        expect(boxOf('day').style.boxShadow).toBe('');
        expect(day.disabled).toBe(true);
        expect(boxOf('day').getAttribute('title')).toBe('Filled in when you sign');
        expect(day.getAttribute('aria-description')).toBe('Filled in when you sign');
        expect(boxOf('open').hasAttribute('title')).toBe(false);
        expect(labelled('open').hasAttribute('aria-description')).toBe(false);

        // A base tint for a field in no group: its edge is the tint's, which its variable wins over.
        form.updateSettings({ fields: { tintColor: '#0ea5e9' } });
        await vi.waitFor(() =>
          expect(boxOf('open').style.boxShadow).toBe(
            'inset 0 0 0 1px var(--epdf-form-field-tint-color, #0ea5e9)',
          ),
        );
        expect(boxOf('locked').style.boxShadow).toBe('');
        form.updateSettings({ fields: { tintColor: null } });

        // Design mode: every field shows, by its own look, its tint, or the outline.
        interaction.activateTool('form-edit');
        const outlines = () => [...lent.querySelectorAll<HTMLElement>('[data-epdf-outline]')];
        await vi.waitFor(() => expect(outlines()).toHaveLength(3));
        for (const outline of outlines()) {
          expect(outline.style.boxShadow).toBe(
            `inset 0 0 0 1px var(--epdf-form-field-border, ${EDGE})`,
          );
          expect(outline.style.pointerEvents).toBe('none');
        }

        // A tool's ghost is the field it places, see-through: here its outline and what it's for.
        interaction.activateTool('form-bare');
        kernel.capability(InteractionHostToken).dispatchPointer({
          phase: 'move',
          viewport: { x: 0, y: 0 },
          page: { ref: page, point: { x: 300, y: 500 } },
          modifiers: { shift: false, alt: false, ctrl: false, meta: false },
        });
        await vi.waitFor(() => expect(outlines()).toHaveLength(4));
        // See-through as its drawing is: the ghost's opacity, which its variable wins over. (The
        // read-only field's own "Name" shows too: design mode shows every field's.)
        const seeThrough = (element: HTMLElement) =>
          element.getAttribute('style')!.includes('opacity');
        const words = [...lent.querySelectorAll<HTMLElement>(PLACEHOLDER)];
        expect(words.filter(seeThrough).map((element) => element.textContent!.trim())).toEqual([
          'Name',
        ]);
        expect(outlines().filter(seeThrough)).toHaveLength(1);
      } finally {
        wrapper.unmount();
        await kernel.destroy();
        await engine.destroy();
      }
    },
  );

  it(
    'paints a field anyone fills in in Anyone’s tint, read as "Anyone" after its name; read-only or left out by `fillable`, it shows plain',
    { timeout: 60_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
      const engine = await realEngine();
      const context = shallowRef<PageContextValue | null>(null);
      const Page = pageWith(context, () => [
        h('div', { 'data-layer': 'annotation' }, [h(AnnotationLayer)]),
        h('div', { 'data-layer': 'form' }, [h(FormLayer)]),
      ]);
      const { kernel, wrapper } = await viewerWith(
        [interactionPlugin(), annotationPlugin(), formPlugin()],
        () => [h(Page)],
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
        const page = kernel.documents.getPage(0, 'blank')!.ref;
        const at = (y: number) => ({ x: 72, y, width: 160, height: 20 });
        const text = (name: string, y: number, more: Record<string, unknown> = {}) =>
          form.create({ kind: 'text', name, widgets: [{ page, rect: at(y) }], ...more } as never);
        await text('together', 100, { assignment: { kind: 'anyone' } });
        // As a signature leaves a field it locked: read-only.
        await text('settled', 140, { assignment: { kind: 'anyone' }, readOnly: true });
        context.value = letterPage('blank', page);
        await settle();

        const layer = wrapper.find<HTMLElement>('[data-layer="form"]').element;
        const lent = wrapper.find<HTMLElement>('[data-layer="annotation"]').element;
        const boxOf = (label: string) =>
          layer.querySelector<HTMLElement>(`[aria-label="${label}"]`)!.parentElement as HTMLElement;
        const EDGE = 'inset 0 0 0 1px var(--epdf-form-field-anyone-tint-color, #0891b2)';

        // Its name says it's anyone's, and its edge is Anyone's color, which its variable wins over.
        await found('[aria-label="together, Anyone"]');
        expect(boxOf('together, Anyone').style.boxShadow).toBe(EDGE);
        expect(boxOf('settled, Anyone').style.boxShadow).toBe('');
        // A box that takes no input isn't the user's to fill in: no tint.
        form.updateSettings({ fillable: ['signature'] });
        await vi.waitFor(() => expect(boxOf('together, Anyone').style.boxShadow).toBe(''));
        form.updateSettings({ fillable: true });
        await vi.waitFor(() => expect(boxOf('together, Anyone').style.boxShadow).toBe(EDGE));

        // Placing for anyone: both fields and the tool's ghost show Anyone's color in design mode.
        form.setDesignAssignment({ kind: 'anyone' });
        interaction.activateTool('form-name');
        kernel.capability(InteractionHostToken).dispatchPointer({
          phase: 'move',
          viewport: { x: 0, y: 0 },
          page: { ref: page, point: { x: 300, y: 500 } },
          modifiers: { shift: false, alt: false, ctrl: false, meta: false },
        });
        const tinted = () =>
          [...lent.querySelectorAll<HTMLElement>('div')].filter((element) =>
            element.style.boxShadow.includes('--epdf-form-field-anyone-tint-color'),
          );
        await vi.waitFor(() => expect(tinted()).toHaveLength(3));
        // The ghost's is see-through, as its drawing is.
        const seeThrough = (element: HTMLElement) =>
          element.getAttribute('style')!.includes('opacity');
        expect(tinted().filter(seeThrough)).toHaveLength(1);
      } finally {
        wrapper.unmount();
        await kernel.destroy();
        await engine.destroy();
      }
    },
  );
});
