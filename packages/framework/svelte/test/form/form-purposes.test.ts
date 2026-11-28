import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushSync } from 'svelte';
import { fireEvent, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { pageTransform } from '@embedpdf/core-geometry';
import type { Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { FormToken, formPlugin } from '../../src/form';
import { interactionPlugin } from '../../src/interaction';
import { makePageContext, type PageContextValue } from '../../src/runtime';
import { signaturePlugin, SignatureToken } from '../../src/signature';
import FormDesignHarness from '../fixtures/FormDesignHarness.svelte';
import { signal } from '../fixtures/signal.svelte';
import { viewerWith } from '../fixtures/viewer';

const here = dirname(fileURLToPath(import.meta.url));
const packages = resolve(here, '..', '..', '..', '..');
const blank = resolve(packages, 'engine', 'main', 'test', 'fixtures', 'hello_world.pdf');
const wasmPath = resolve(packages, 'engine', 'runtime', 'npm', 'wasm32', 'lib', 'embedpdf.wasm');
/** A one-page PDF to draw into a signature field as its mark. */
const artwork = resolve(packages, 'engine', 'main', 'test', 'fixtures', 'signature_artwork.pdf');

const PLACEHOLDER = '[data-epdf-placeholder]';

/**
 * What a field is for, in the form layer and in design mode: an empty field with a purpose shows
 * the purpose's name, as the layer's paint and never as the field's value; its text box tells
 * the browser what it holds; and a field without a purpose is drawn as it always was. A signature
 * box with a mark drawn in it holds the mark, so it shows no placeholder.
 */
describe('what a field is for', () => {
  it(
    'shows an empty field’s purpose while filling and in design mode, and sets autocomplete',
    { timeout: 60_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(blank));
      // happy-dom's browser-shaped globals would steer the wasm toward fetch(): hand it over.
      const wasmBinary = new Uint8Array(await readFile(wasmPath));
      const engine = (await createLocalEngine({
        runtime: { prefer: 'wasm', wasmBinary },
      })) as unknown as Engine;
      const page = signal<PageContextValue | null>(null);
      const { kernel, view } = await viewerWith(
        [interactionPlugin(), annotationPlugin(), formPlugin(), signaturePlugin()],
        FormDesignHarness,
        { page },
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
        const ref = kernel.documents.getPage(0, 'blank')!.ref;
        const at = (y: number) => ({ x: 72, y, width: 160, height: 20 });
        const text = (name: string, y: number, more: Record<string, unknown> = {}) =>
          form.create({
            kind: 'text',
            name,
            widgets: [{ page: ref, rect: at(y), color: '#94a3b8', fontSize: 10 }],
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
          widgets: [{ page: ref, rect: at(260) }],
        });
        await form.create({
          kind: 'signature',
          name: 'sign',
          purpose: 'signature',
          widgets: [{ page: ref, rect: { x: 72, y: 300, width: 160, height: 48 } }],
        });
        await form.create({
          kind: 'checkbox',
          name: 'tick',
          purpose: 'name',
          widgets: [{ page: ref, rect: { x: 72, y: 360, width: 18, height: 18 } }],
        });
        await form.setValue({ kind: 'fqn', name: 'mail' }, { value: 'dana@fernquill.example' });

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

        const layer = view.container.querySelector('[data-layer="form"]') as HTMLElement;
        const boxOf = (label: string) => view.getByLabelText(label).parentElement as HTMLElement;
        const shownIn = (box: HTMLElement) => box.querySelector<HTMLElement>(PLACEHOLDER);
        // The text a box holds itself, beside its elements: a blank left between two blocks of
        // a component's template would be one.
        const ownTextOf = (box: HTMLElement) =>
          [...box.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent)
            .join('');

        // An empty field with a purpose shows the purpose's name, over its picture.
        const who = (await waitFor(() => view.getByLabelText('who'))) as HTMLInputElement;
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
        const mail = view.getByLabelText('mail') as HTMLInputElement;
        expect(shownIn(boxOf('mail'))).toBeNull();
        expect(mail.getAttribute('autocomplete')).toBe('email');
        expect(mail.hasAttribute('aria-placeholder')).toBe(false);

        // A field without a purpose is drawn as it always was.
        const plain = view.getByLabelText('plain') as HTMLInputElement;
        expect(shownIn(boxOf('plain'))).toBeNull();
        expect(plain.hasAttribute('autocomplete')).toBe(false);
        expect(plain.hasAttribute('aria-placeholder')).toBe(false);
        // Its box holds its text box and nothing else: no element beside it, and no text, not
        // even a blank.
        expect(boxOf('plain').children).toHaveLength(1);
        expect(ownTextOf(boxOf('plain'))).toBe('');
        // So is one whose purpose is a word nobody named: no label, and no token of the web's.
        const ticket = view.getByLabelText('ticket') as HTMLInputElement;
        expect(shownIn(boxOf('ticket'))).toBeNull();
        expect(ticket.hasAttribute('autocomplete')).toBe(false);

        // A box for several lines starts its placeholder at the top.
        const notes = shownIn(boxOf('notes'))!;
        expect(notes.textContent).toBe('Title');
        expect(notes.style.alignItems).toBe('flex-start');
        expect(view.getByLabelText('notes').getAttribute('autocomplete')).toBe(
          'organization-title',
        );

        // A dropdown and a signature field show theirs; a checkbox has no room for one.
        expect(shownIn(boxOf('firm'))!.textContent).toBe('Organization');
        const sign = [...layer.querySelectorAll<HTMLElement>(PLACEHOLDER)].find(
          (element) => element.textContent === 'Signature',
        );
        expect(sign).toBeDefined();
        expect(ownTextOf(sign!.parentElement as HTMLElement)).toBe('');
        expect(shownIn(view.getByLabelText('tick'))).toBeNull();
        expect(layer.querySelectorAll(PLACEHOLDER)).toHaveLength(4);

        // The first character typed takes the placeholder away, before anything is written.
        await fireEvent.focus(who);
        await fireEvent.input(who, { target: { value: 'D' } });
        expect(shownIn(boxOf('who'))).toBeNull();
        await fireEvent.input(who, { target: { value: '' } });
        expect(shownIn(boxOf('who'))!.textContent).toBe('Name');
        await fireEvent.blur(who);

        // Design mode: the fields are lent to the annotation layer, which shows the same words
        // on the empty ones.
        interaction.activateTool('form-edit');
        flushSync();
        const lent = view.container.querySelector('[data-layer="annotation"]') as HTMLElement;
        await waitFor(() =>
          expect(
            [...lent.querySelectorAll<HTMLElement>(PLACEHOLDER)]
              .map((element) => element.textContent)
              .sort(),
          ).toEqual(['Name', 'Organization', 'Signature', 'Title']),
        );
        for (const element of lent.querySelectorAll<HTMLElement>(PLACEHOLDER)) {
          expect(element.style.pointerEvents).toBe('none');
          expect(element.getAttribute('aria-hidden')).toBe('true');
          expect(ownTextOf(element.parentElement as HTMLElement)).toBe('');
        }
        expect(layer.querySelector('input')).toBeNull();

        // Filled in from code, a field shows no placeholder in either mode.
        await form.setValue({ kind: 'fqn', name: 'who' }, { value: 'Dana Smith' });
        flushSync();
        await waitFor(() =>
          expect(
            [...lent.querySelectorAll<HTMLElement>(PLACEHOLDER)].map(
              (element) => element.textContent,
            ),
          ).not.toContain('Name'),
        );
        interaction.activateTool('pointer');
        flushSync();
        await waitFor(() => view.getByLabelText('who'));
        expect(shownIn(boxOf('who'))).toBeNull();
        expect(layer.querySelectorAll(PLACEHOLDER)).toHaveLength(3);

        // A mark drawn into the signature field, without signing: the box holds the mark, so
        // the word goes, while filling and in design mode. Taken out, the word is back.
        const signature = kernel.capability(SignatureToken);
        const signField = { kind: 'fqn' as const, name: 'sign' };
        const mark = { source: new Uint8Array(await readFile(artwork)) };
        const wordsIn = (root: Element) =>
          [...root.querySelectorAll<HTMLElement>(PLACEHOLDER)].map(
            (element) => element.textContent,
          );
        expect(wordsIn(layer).sort()).toEqual(['Organization', 'Signature', 'Title']);
        await signature.fillField(signField, mark);
        flushSync();
        await waitFor(() => expect(wordsIn(layer).sort()).toEqual(['Organization', 'Title']));
        interaction.activateTool('form-edit');
        flushSync();
        await waitFor(() => expect(wordsIn(lent).sort()).toEqual(['Organization', 'Title']));
        await signature.clearField(signField);
        flushSync();
        await waitFor(() =>
          expect(wordsIn(lent).sort()).toEqual(['Organization', 'Signature', 'Title']),
        );
        interaction.activateTool('pointer');
        flushSync();
        await waitFor(() =>
          expect(wordsIn(layer).sort()).toEqual(['Organization', 'Signature', 'Title']),
        );
      } finally {
        view.unmount();
        await kernel.destroy();
        await engine.destroy();
      }
    },
  );

  it(
    'paints only the fields you fill in, shows the date as text with its hint, and outlines and ghosts a field with no look',
    { timeout: 60_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(blank));
      const wasmBinary = new Uint8Array(await readFile(wasmPath));
      const engine = (await createLocalEngine({
        runtime: { prefer: 'wasm', wasmBinary },
      })) as unknown as Engine;
      const EDGE = '#64748b';
      const page = signal<PageContextValue | null>(null);
      const { kernel, view } = await viewerWith(
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
        FormDesignHarness,
        { page },
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
        const ref = kernel.documents.getPage(0, 'blank')!.ref;
        const at = (y: number) => ({ x: 72, y, width: 160, height: 20 });
        // No border of their own: what the viewer paints around them is all the edge they have.
        const text = (name: string, y: number, more: Record<string, unknown> = {}) =>
          form.create({
            kind: 'text',
            name,
            widgets: [{ page: ref, rect: at(y) }],
            ...more,
          } as never);
        await text('open', 100, { purpose: 'email' });
        await text('locked', 140, { purpose: 'name', readOnly: true });
        await text('day', 180, {
          purpose: 'date-signed',
          readOnly: true,
          format: { kind: 'date', pattern: 'yyyy-mm-dd' },
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

        const lent = view.container.querySelector('[data-layer="annotation"]') as HTMLElement;
        const boxOf = (label: string) => view.getByLabelText(label).parentElement as HTMLElement;

        // Yours: the edge `fields.border` gives, and what it's for.
        await waitFor(() => view.getByLabelText('open'));
        expect(form.listWidgets(ref).every((item) => item.look.border === null)).toBe(true);
        expect(boxOf('open').style.boxShadow).toBe(
          `inset 0 0 0 1px var(--epdf-form-field-border, ${EDGE})`,
        );
        expect(boxOf('open').querySelector(PLACEHOLDER)!.textContent!.trim()).toBe('Email');
        // Read-only: as the PDF has it, no edge and no placeholder.
        expect(boxOf('locked').style.boxShadow).toBe('');
        expect(boxOf('locked').querySelector(PLACEHOLDER)).toBeNull();
        // The day of signing reads as text: no edge, nothing to type, and its hint.
        const day = view.getByLabelText('day') as HTMLInputElement;
        expect(boxOf('day').style.boxShadow).toBe('');
        expect(day.disabled).toBe(true);
        expect(boxOf('day').getAttribute('title')).toBe('Filled in when you sign');
        expect(day.getAttribute('aria-description')).toBe('Filled in when you sign');
        expect(boxOf('open').hasAttribute('title')).toBe(false);
        expect(view.getByLabelText('open').hasAttribute('aria-description')).toBe(false);

        // A base tint for a field in no group: its edge is the tint's, which its variable wins over.
        form.updateSettings({ fields: { tintColor: '#0ea5e9' } });
        flushSync();
        await waitFor(() =>
          expect(boxOf('open').style.boxShadow).toBe(
            'inset 0 0 0 1px var(--epdf-form-field-tint-color, #0ea5e9)',
          ),
        );
        expect(boxOf('locked').style.boxShadow).toBe('');
        form.updateSettings({ fields: { tintColor: null } });
        flushSync();

        // Design mode: every field shows, by its own look, its tint, or the outline.
        interaction.activateTool('form-edit');
        flushSync();
        const outlines = () => [...lent.querySelectorAll<HTMLElement>('[data-epdf-outline]')];
        await waitFor(() => expect(outlines()).toHaveLength(3));
        for (const outline of outlines()) {
          expect(outline.style.boxShadow).toBe(
            `inset 0 0 0 1px var(--epdf-form-field-border, ${EDGE})`,
          );
          expect(outline.style.pointerEvents).toBe('none');
        }

        // A tool's ghost is the field it places, see-through: here its outline and what it's for.
        interaction.activateTool('form-bare');
        interaction.dispatchPointer({
          phase: 'move',
          viewport: { x: 0, y: 0 },
          page: { ref, point: { x: 300, y: 500 } },
          modifiers: { shift: false, alt: false, ctrl: false, meta: false },
        });
        flushSync();
        await waitFor(() => expect(outlines()).toHaveLength(4));
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
        view.unmount();
        await kernel.destroy();
        await engine.destroy();
      }
    },
  );

  it(
    'paints a field anyone fills in in Anyone’s tint, read as "Anyone" after its name; read-only or left out by `fillable`, it shows plain',
    { timeout: 60_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(blank));
      const wasmBinary = new Uint8Array(await readFile(wasmPath));
      const engine = (await createLocalEngine({
        runtime: { prefer: 'wasm', wasmBinary },
      })) as unknown as Engine;
      const page = signal<PageContextValue | null>(null);
      const { kernel, view } = await viewerWith(
        [interactionPlugin(), annotationPlugin(), formPlugin()],
        FormDesignHarness,
        { page },
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
        const ref = kernel.documents.getPage(0, 'blank')!.ref;
        const at = (y: number) => ({ x: 72, y, width: 160, height: 20 });
        const text = (name: string, y: number, more: Record<string, unknown> = {}) =>
          form.create({
            kind: 'text',
            name,
            widgets: [{ page: ref, rect: at(y) }],
            ...more,
          } as never);
        await text('together', 100, { assignment: { kind: 'anyone' } });
        // As a signature leaves a field it locked: read-only.
        await text('settled', 140, { assignment: { kind: 'anyone' }, readOnly: true });
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

        const lent = view.container.querySelector('[data-layer="annotation"]') as HTMLElement;
        const boxOf = (label: string) => view.getByLabelText(label).parentElement as HTMLElement;
        const EDGE = 'inset 0 0 0 1px var(--epdf-form-field-anyone-tint-color, #0891b2)';

        // Its name says it's anyone's, and its edge is Anyone's color, which its variable wins over.
        await waitFor(() => view.getByLabelText('together, Anyone'));
        expect(boxOf('together, Anyone').style.boxShadow).toBe(EDGE);
        expect(boxOf('settled, Anyone').style.boxShadow).toBe('');
        // A box that takes no input isn't the user's to fill in: no tint.
        form.updateSettings({ fillable: ['signature'] });
        flushSync();
        await waitFor(() => expect(boxOf('together, Anyone').style.boxShadow).toBe(''));
        form.updateSettings({ fillable: true });
        flushSync();
        await waitFor(() => expect(boxOf('together, Anyone').style.boxShadow).toBe(EDGE));

        // Placing for anyone: both fields and the tool's ghost show Anyone's color in design mode.
        form.setDesignAssignment({ kind: 'anyone' });
        interaction.activateTool('form-name');
        interaction.dispatchPointer({
          phase: 'move',
          viewport: { x: 0, y: 0 },
          page: { ref, point: { x: 300, y: 500 } },
          modifiers: { shift: false, alt: false, ctrl: false, meta: false },
        });
        flushSync();
        const tinted = () =>
          [...lent.querySelectorAll<HTMLElement>('div')].filter((element) =>
            element.style.boxShadow.includes('--epdf-form-field-anyone-tint-color'),
          );
        await waitFor(() => expect(tinted()).toHaveLength(3));
        // The ghost's is see-through, as its drawing is.
        const seeThrough = (element: HTMLElement) =>
          element.getAttribute('style')!.includes('opacity');
        expect(tinted().filter(seeThrough)).toHaveLength(1);
      } finally {
        view.unmount();
        await kernel.destroy();
        await engine.destroy();
      }
    },
  );

  it(
    "an image field's box: says what it's for, a press makes it the target, and it holds the picture put in",
    { timeout: 60_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(blank));
      const wasmBinary = new Uint8Array(await readFile(wasmPath));
      const engine = (await createLocalEngine({
        runtime: { prefer: 'wasm', wasmBinary },
      })) as unknown as Engine;
      const page = signal<PageContextValue | null>(null);
      const { kernel, view } = await viewerWith(
        [interactionPlugin(), annotationPlugin(), formPlugin(), signaturePlugin()],
        FormDesignHarness,
        { page },
        engine,
      );

      try {
        await kernel.documents.open({ kind: 'bytes', id: 'blank', bytes });
        await waitFor(() => expect(kernel.tryCapability(FormToken, undefined)).toBeTruthy(), {
          timeout: 20_000,
        });
        const form = kernel.capability(FormToken);
        const signature = kernel.capability(SignatureToken);
        await form.refresh();
        const ref = kernel.documents.getPage(0, 'blank')!.ref;
        const { field } = await form.create({
          kind: 'pushbutton',
          name: 'initials',
          purpose: 'initials',
          widgets: [{ page: ref, rect: { x: 72, y: 100, width: 72, height: 36 }, layout: 'image' }],
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

        // A button named after the field, empty, saying what it's for.
        const button = (await waitFor(() => view.getByLabelText('initials'))) as HTMLElement;
        expect(button.tagName).toBe('BUTTON');
        const box = button.parentElement as HTMLElement;
        expect(box.querySelector(PLACEHOLDER)!.textContent!.trim()).toBe('Initials');
        expect(button.hasAttribute('data-has-image')).toBe(false);
        // A press makes it the target, as a signature box's does; nothing else runs.
        await fireEvent.click(button);
        expect(signature.getTarget()).toEqual(field.ref);

        // The card's mark goes in as its picture: the box says so, and its placeholder goes.
        await signature.placeMark(
          { source: new Uint8Array(await readFile(artwork)) },
          { field: field.ref },
        );
        flushSync();
        await waitFor(() =>
          expect(view.getByLabelText('initials').hasAttribute('data-has-image')).toBe(true),
        );
        expect(signature.getTarget()).toBeNull();
        expect(form.listWidgets(ref)[0]).toMatchObject({ control: 'image', hasImage: true });
        expect(
          view.getByLabelText('initials').parentElement!.querySelector(PLACEHOLDER),
        ).toBeNull();
      } finally {
        view.unmount();
        await kernel.destroy();
        await engine.destroy();
      }
    },
  );
});
