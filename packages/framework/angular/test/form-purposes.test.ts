/**
 * What a field is for, in the form layer and in design mode, against a real kernel and the real
 * engine: an empty field with a purpose shows the purpose's name, as the layer's paint and never
 * as the field's value; its text box tells the browser what it holds; and a field without a
 * purpose is drawn as it always was. A signature box with a mark drawn in it holds the mark, so
 * it shows no placeholder.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Engine, PageRef } from '@embedpdf/core';
import { pageTransform } from '@embedpdf/core-geometry';
import { createLocalEngine } from '@embedpdf/engine';
import { createPageContext, EPDF_PAGE } from '@embedpdf/angular/runtime';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfForm, EpdfFormLayer, FormToken, withForm } from '@embedpdf/angular/form';
import { InteractionToken as InteractionHostToken } from '@embedpdf/plugin-interaction/contract/host';
import { EpdfSignature, withSignature } from '@embedpdf/angular/signature';
import { kernelOf, mount, viewerHost } from './fixtures';

const here = dirname(fileURLToPath(import.meta.url));
const blank = resolve(here, '../../../engine/main/test/fixtures/hello_world.pdf');
const wasm = resolve(here, '../../../engine/runtime/npm/wasm32/lib/embedpdf.wasm');
/** A one-page PDF to draw into a signature field as its mark. */
const artwork = resolve(here, '../../../engine/main/test/fixtures/signature_artwork.pdf');

/**
 * The real engine. happy-dom's browser-shaped globals would steer the wasm toward fetch(): hand
 * it over.
 */
async function realEngine(): Promise<Engine> {
  const wasmBinary = new Uint8Array(await readFile(wasm));
  return createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });
}

const PLACEHOLDER = '[data-epdf-placeholder]';

const LETTER = { width: 612, height: 792 };

/** The page, at scale 1 from the top-left corner of the screen, once the test names it. */
const shownPage = signal<{ documentId: string; ref: PageRef } | null>(null);

/** A page with the annotation layer and the form layer on it, as a Stage's page has them. */
@Component({
  selector: 'test-purposes-page',
  imports: [EpdfAnnotationLayer, EpdfFormLayer],
  providers: [
    {
      provide: EPDF_PAGE,
      useFactory: () =>
        createPageContext({
          documentId: () => shownPage()!.documentId,
          ref: () => shownPage()!.ref,
          view: () => 'test-view',
          pageIndex: signal(0),
          frame: signal({ top: 0, right: 0, bottom: 0, left: 0 }),
          transform: signal(
            pageTransform({ pageSize: LETTER, rotation: 0, scale: 1, baseScale: 1, dpr: 1 }),
          ),
          getRect: () => new DOMRect(0, 0, LETTER.width, LETTER.height),
        }),
    },
  ],
  template: `
    <div data-layer="annotation"><epdf-annotation-layer /></div>
    <div data-layer="form"><epdf-form-layer /></div>
  `,
})
class PurposesPage {}

@Component({
  selector: 'test-purposes-shell',
  imports: [PurposesPage],
  template: `
    @if (page()) {
      <test-purposes-page />
    }
  `,
})
class PurposesShell {
  protected readonly page = shownPage;
}

afterEach(() => {
  shownPage.set(null);
  TestBed.resetTestingModule();
});

describe('what a field is for', () => {
  it(
    'shows an empty field’s purpose while filling and in design mode, and sets autocomplete',
    { timeout: 60_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(blank));
      const fixture = await mount(
        viewerHost({
          template: '<test-purposes-shell />',
          imports: [PurposesShell],
          // The viewer's own engine: destroyed after the kernel, when the test's module goes.
          config: {
            engine: realEngine,
            initialDocuments: [{ source: { kind: 'bytes', id: 'blank', bytes } }],
          },
          features: [withInteraction(), withAnnotation(), withForm(), withSignature()],
        }),
      );
      await vi.waitFor(() => expect(kernelOf(fixture).tryCapability(FormToken)).toBeTruthy(), {
        timeout: 20_000,
      });
      const form = fixture.debugElement.injector.get(EpdfForm);
      const interaction = fixture.debugElement.injector.get(EpdfInteraction);
      await form.refresh();
      const page = kernelOf(fixture).documents.getPage(0, 'blank')!.ref;
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

      shownPage.set({ documentId: 'blank', ref: page });
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;
      const layer = root.querySelector<HTMLElement>('[data-layer="form"]')!;
      /** The form layer's control named `label`, once the layer has drawn it. */
      const control = <T extends HTMLElement>(label: string) =>
        vi.waitFor(async () => {
          await fixture.whenStable();
          const found = layer.querySelector<T>(`[aria-label="${label}"]`);
          expect(found).not.toBeNull();
          return found!;
        });
      /** The box of the control named `label`: the control's parent. */
      const boxOf = async (label: string) => (await control(label)).parentElement as HTMLElement;
      const shownIn = (box: HTMLElement) => box.querySelector<HTMLElement>(PLACEHOLDER);

      // An empty field with a purpose shows the purpose's name, over its picture.
      const who = await control<HTMLInputElement>('who');
      const shown = shownIn(await boxOf('who'))!;
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
      const mail = await control<HTMLInputElement>('mail');
      expect(shownIn(await boxOf('mail'))).toBeNull();
      expect(mail.getAttribute('autocomplete')).toBe('email');
      expect(mail.hasAttribute('aria-placeholder')).toBe(false);

      // A field without a purpose is drawn as it always was.
      const plain = await control<HTMLInputElement>('plain');
      expect(shownIn(await boxOf('plain'))).toBeNull();
      expect(plain.hasAttribute('autocomplete')).toBe(false);
      expect(plain.hasAttribute('aria-placeholder')).toBe(false);
      // So is one whose purpose is a word nobody named: no label, and no token of the web's.
      const ticket = await control<HTMLInputElement>('ticket');
      expect(shownIn(await boxOf('ticket'))).toBeNull();
      expect(ticket.hasAttribute('autocomplete')).toBe(false);

      // A box for several lines starts its placeholder at the top.
      const notes = shownIn(await boxOf('notes'))!;
      expect(notes.textContent).toBe('Title');
      expect(notes.style.alignItems).toBe('flex-start');
      expect((await control('notes')).getAttribute('autocomplete')).toBe('organization-title');

      // A dropdown and a signature field show theirs; a checkbox has no room for one.
      expect(shownIn(await boxOf('firm'))!.textContent).toBe('Organization');
      const sign = [...layer.querySelectorAll<HTMLElement>(PLACEHOLDER)].find(
        (element) => element.textContent === 'Signature',
      );
      expect(sign).toBeDefined();
      expect(shownIn(await control('tick'))).toBeNull();
      expect(layer.querySelectorAll(PLACEHOLDER)).toHaveLength(4);

      // The first character typed takes the placeholder away, before anything is written.
      who.dispatchEvent(new FocusEvent('focus'));
      who.value = 'D';
      who.dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();
      expect(shownIn(await boxOf('who'))).toBeNull();
      who.value = '';
      who.dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();
      expect(shownIn(await boxOf('who'))!.textContent).toBe('Name');
      who.dispatchEvent(new FocusEvent('blur'));

      // Design mode: the fields are lent to the annotation layer, which shows the same words
      // on the empty ones.
      interaction.activateTool('form-edit');
      const lent = root.querySelector<HTMLElement>('[data-layer="annotation"]')!;
      const lentWords = () =>
        [...lent.querySelectorAll<HTMLElement>(PLACEHOLDER)].map((element) => element.textContent);
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(lentWords().sort()).toEqual(['Name', 'Organization', 'Signature', 'Title']);
      });
      for (const element of lent.querySelectorAll<HTMLElement>(PLACEHOLDER)) {
        expect(element.style.pointerEvents).toBe('none');
        expect(element.getAttribute('aria-hidden')).toBe('true');
      }
      expect(layer.querySelector('input')).toBeNull();

      // Filled in from code, a field shows no placeholder in either mode.
      await form.setValue({ kind: 'fqn', name: 'who' }, { value: 'Dana Smith' });
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(lentWords()).not.toContain('Name');
      });
      interaction.activateTool('pointer');
      expect(shownIn(await boxOf('who'))).toBeNull();
      expect(layer.querySelectorAll(PLACEHOLDER)).toHaveLength(3);

      // A mark drawn into the signature field, without signing: the box holds the mark, so the
      // word goes, while filling and in design mode. Taken out, the word is back.
      const signature = fixture.debugElement.injector.get(EpdfSignature);
      const signField = { kind: 'fqn' as const, name: 'sign' };
      const mark = { source: new Uint8Array(await readFile(artwork)) };
      const wordsIn = (shown: HTMLElement) =>
        [...shown.querySelectorAll<HTMLElement>(PLACEHOLDER)].map((element) => element.textContent);
      /** The words `shown` paints, once they are these. */
      const shows = (shown: HTMLElement, words: string[]) =>
        vi.waitFor(async () => {
          await fixture.whenStable();
          expect(wordsIn(shown).sort()).toEqual(words);
        });
      await shows(layer, ['Organization', 'Signature', 'Title']);
      await signature.fillField(signField, mark);
      await shows(layer, ['Organization', 'Title']);
      interaction.activateTool('form-edit');
      await shows(lent, ['Organization', 'Title']);
      await signature.clearField(signField);
      await shows(lent, ['Organization', 'Signature', 'Title']);
      interaction.activateTool('pointer');
      await shows(layer, ['Organization', 'Signature', 'Title']);
    },
  );

  it(
    'paints only the fields you fill in, shows the date as text with its hint, and outlines and ghosts a field with no look',
    { timeout: 60_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(blank));
      const EDGE = '#64748b';
      const fixture = await mount(
        viewerHost({
          template: '<test-purposes-shell />',
          imports: [PurposesShell],
          config: {
            engine: realEngine,
            initialDocuments: [{ source: { kind: 'bytes', id: 'blank', bytes } }],
          },
          features: [
            withInteraction(),
            withAnnotation(),
            withForm({
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
        }),
      );
      await vi.waitFor(() => expect(kernelOf(fixture).tryCapability(FormToken)).toBeTruthy(), {
        timeout: 20_000,
      });
      const form = kernelOf(fixture).capability(FormToken);
      const interaction = kernelOf(fixture).capability(InteractionHostToken);
      await form.refresh();
      const page = kernelOf(fixture).documents.getPage(0, 'blank')!.ref;
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
      shownPage.set({ documentId: 'blank', ref: page });
      await fixture.whenStable();

      const root = fixture.nativeElement as HTMLElement;
      const layer = root.querySelector<HTMLElement>('[data-layer="form"]')!;
      const lent = root.querySelector<HTMLElement>('[data-layer="annotation"]')!;
      /** The form layer's control named `label`, once the layer has drawn it. */
      const control = <T extends HTMLElement>(label: string) =>
        vi.waitFor(async () => {
          await fixture.whenStable();
          const found = layer.querySelector<T>(`[aria-label="${label}"]`);
          expect(found).not.toBeNull();
          return found!;
        });
      const boxOf = async (label: string) => (await control(label)).parentElement as HTMLElement;
      /** Once `check` holds of what the page shows. */
      const shows = (check: () => void) =>
        vi.waitFor(async () => {
          await fixture.whenStable();
          check();
        });

      // Yours: the edge `fields.border` gives, and what it's for.
      const open = await boxOf('open');
      expect(form.listWidgets(page).every((item) => item.look.border === null)).toBe(true);
      expect(open.style.boxShadow).toBe(`inset 0 0 0 1px var(--epdf-form-field-border, ${EDGE})`);
      expect(open.querySelector(PLACEHOLDER)!.textContent!.trim()).toBe('Email');
      // Read-only: as the PDF has it, no edge and no placeholder.
      const locked = await boxOf('locked');
      expect(locked.style.boxShadow).toBe('');
      expect(locked.querySelector(PLACEHOLDER)).toBeNull();
      // The day of signing reads as text: no edge, nothing to type, and its hint.
      const day = await control<HTMLInputElement>('day');
      const dayBox = day.parentElement as HTMLElement;
      expect(dayBox.style.boxShadow).toBe('');
      expect(day.disabled).toBe(true);
      expect(dayBox.getAttribute('title')).toBe('Filled in when you sign');
      expect(day.getAttribute('aria-description')).toBe('Filled in when you sign');
      expect(open.hasAttribute('title')).toBe(false);
      expect((await control('open')).hasAttribute('aria-description')).toBe(false);

      // A base tint for a field in no group: its edge is the tint's, which its variable wins over.
      form.updateSettings({ fields: { tintColor: '#0ea5e9' } });
      await shows(() =>
        expect(open.style.boxShadow).toBe(
          'inset 0 0 0 1px var(--epdf-form-field-tint-color, #0ea5e9)',
        ),
      );
      expect(locked.style.boxShadow).toBe('');
      form.updateSettings({ fields: { tintColor: null } });

      // Design mode: every field shows, by its own look, its tint, or the outline.
      interaction.activateTool('form-edit');
      const outlines = () => [...lent.querySelectorAll<HTMLElement>('[data-epdf-outline]')];
      await shows(() => expect(outlines()).toHaveLength(3));
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
        page: { ref: page, point: { x: 300, y: 500 } },
        modifiers: { shift: false, alt: false, ctrl: false, meta: false },
      });
      await shows(() => expect(outlines()).toHaveLength(4));
      // See-through as its drawing is: the ghost's opacity, which its variable wins over. (The
      // read-only field's own "Name" shows too: design mode shows every field's.)
      const seeThrough = (element: HTMLElement) =>
        element.getAttribute('style')!.includes('opacity');
      const words = [...lent.querySelectorAll<HTMLElement>(PLACEHOLDER)];
      expect(words.filter(seeThrough).map((element) => element.textContent!.trim())).toEqual([
        'Name',
      ]);
      expect(outlines().filter(seeThrough)).toHaveLength(1);
    },
  );

  it(
    'paints a field anyone fills in in Anyone’s tint, read as "Anyone" after its name; read-only or left out by `fillable`, it shows plain',
    { timeout: 60_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(blank));
      const fixture = await mount(
        viewerHost({
          template: '<test-purposes-shell />',
          imports: [PurposesShell],
          config: {
            engine: realEngine,
            initialDocuments: [{ source: { kind: 'bytes', id: 'blank', bytes } }],
          },
          features: [withInteraction(), withAnnotation(), withForm()],
        }),
      );
      await vi.waitFor(() => expect(kernelOf(fixture).tryCapability(FormToken)).toBeTruthy(), {
        timeout: 20_000,
      });
      const form = kernelOf(fixture).capability(FormToken);
      const interaction = kernelOf(fixture).capability(InteractionHostToken);
      await form.refresh();
      const page = kernelOf(fixture).documents.getPage(0, 'blank')!.ref;
      const at = (y: number) => ({ x: 72, y, width: 160, height: 20 });
      const text = (name: string, y: number, more: Record<string, unknown> = {}) =>
        form.create({ kind: 'text', name, widgets: [{ page, rect: at(y) }], ...more } as never);
      await text('together', 100, { assignment: { kind: 'anyone' } });
      // As a signature leaves a field it locked: read-only.
      await text('settled', 140, { assignment: { kind: 'anyone' }, readOnly: true });
      shownPage.set({ documentId: 'blank', ref: page });
      await fixture.whenStable();

      const root = fixture.nativeElement as HTMLElement;
      const layer = root.querySelector<HTMLElement>('[data-layer="form"]')!;
      const lent = root.querySelector<HTMLElement>('[data-layer="annotation"]')!;
      const boxOf = (label: string) =>
        vi.waitFor(async () => {
          await fixture.whenStable();
          const found = layer.querySelector<HTMLElement>(`[aria-label="${label}"]`);
          expect(found).not.toBeNull();
          return found!.parentElement as HTMLElement;
        });
      const shows = (check: () => void) =>
        vi.waitFor(async () => {
          await fixture.whenStable();
          check();
        });
      const EDGE = 'inset 0 0 0 1px var(--epdf-form-field-anyone-tint-color, #0891b2)';

      // Its name says it's anyone's, and its edge is Anyone's color, which its variable wins over.
      const together = await boxOf('together, Anyone');
      expect(together.style.boxShadow).toBe(EDGE);
      expect((await boxOf('settled, Anyone')).style.boxShadow).toBe('');
      // A box that takes no input isn't the user's to fill in: no tint.
      form.updateSettings({ fillable: ['signature'] });
      await shows(() => expect(together.style.boxShadow).toBe(''));
      form.updateSettings({ fillable: true });
      await shows(() => expect(together.style.boxShadow).toBe(EDGE));

      // Placing for anyone: both fields and the tool's ghost show Anyone's color in design mode.
      form.setDesignAssignment({ kind: 'anyone' });
      interaction.activateTool('form-name');
      interaction.dispatchPointer({
        phase: 'move',
        viewport: { x: 0, y: 0 },
        page: { ref: page, point: { x: 300, y: 500 } },
        modifiers: { shift: false, alt: false, ctrl: false, meta: false },
      });
      const tinted = () =>
        [...lent.querySelectorAll<HTMLElement>('div')].filter((element) =>
          element.style.boxShadow.includes('--epdf-form-field-anyone-tint-color'),
        );
      await shows(() => expect(tinted()).toHaveLength(3));
      // The ghost's is see-through, as its drawing is.
      const seeThrough = (element: HTMLElement) =>
        element.getAttribute('style')!.includes('opacity');
      expect(tinted().filter(seeThrough)).toHaveLength(1);
    },
  );
});
