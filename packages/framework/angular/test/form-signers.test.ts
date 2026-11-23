/**
 * Fields for several people, in the form layer and in design mode, against a real kernel and the
 * real engine: a field in a group shows in its group's color (a fill and an edge), named by the
 * app or not, nothing shows while the tint is 0, and the form's service says who the groups are
 * and who new fields are placed for.
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
import {
  EpdfForm,
  EpdfFormLayer,
  FormToken,
  withForm,
  type FormDesignGroupChangedEvent,
} from '@embedpdf/angular/form';
import { kernelOf, mount, viewerHost } from './fixtures';

const here = dirname(fileURLToPath(import.meta.url));
const blank = resolve(here, '../../../engine/main/test/fixtures/hello_world.pdf');
const wasm = resolve(here, '../../../engine/runtime/npm/wasm32/lib/embedpdf.wasm');

/**
 * The real engine. happy-dom's browser-shaped globals would steer the wasm toward fetch(): hand
 * it over.
 */
async function realEngine(): Promise<Engine> {
  const wasmBinary = new Uint8Array(await readFile(wasm));
  return createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });
}

const BUYER = '#2563eb';
// The edge of the buyer's color. The fill beside it is a `color-mix()`, which happy-dom doesn't
// keep in a style: `@embedpdf/web`'s own tests check it.
const EDGE = `inset 0 0 0 1px ${BUYER}`;
// The witness is named by nobody: second in the list, it gets the second of the eight colors.
const WITNESS = '#16a34a';
const WITNESS_EDGE = `inset 0 0 0 1px ${WITNESS}`;

const LETTER = { width: 612, height: 792 };

/** The page, at scale 1 from the top-left corner of the screen, once the test names it. */
const shownPage = signal<{ documentId: string; ref: PageRef } | null>(null);

/** A page with the annotation layer and the form layer on it, as a Stage's page has them. */
@Component({
  selector: 'test-signers-page',
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
class SignersPage {}

@Component({
  selector: 'test-signers-shell',
  imports: [SignersPage],
  template: `
    @if (page()) {
      <test-signers-page />
    }
  `,
})
class SignersShell {
  protected readonly page = shownPage;
}

afterEach(() => {
  shownPage.set(null);
  TestBed.resetTestingModule();
});

describe('fields for several people', () => {
  it(
    'shows a field in its group’s color while filling and in design mode, and names whose it is',
    { timeout: 60_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(blank));
      const fixture = await mount(
        viewerHost({
          template: '<test-signers-shell />',
          imports: [SignersShell],
          // The viewer's own engine: destroyed after the kernel, when the test's module goes.
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
      const form = fixture.debugElement.injector.get(EpdfForm);
      const interaction = fixture.debugElement.injector.get(EpdfInteraction);
      const changes: FormDesignGroupChangedEvent[] = [];
      form.designGroupChanged$.subscribe((event) => changes.push(event));
      const named: string[][] = [];
      form.groupsChanged$.subscribe((event) => named.push(event.groups.map((group) => group.id)));
      await form.refresh();
      // The app tells the document who its groups are.
      form.setGroups([{ id: 'buyer', label: 'Dana Smith', color: BUYER }]);
      expect(named).toEqual([['buyer']]);
      expect(form.selectedFields()).toEqual([]);
      const page = kernelOf(fixture).documents.getPage(0, 'blank')!.ref;
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
      // A field in no group.
      await form.create({
        kind: 'text',
        name: 'note',
        widgets: [{ page, rect: at(250), color: '#94a3b8' }],
      });

      shownPage.set({ documentId: 'blank', ref: page });
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;
      /** The form layer's control named `label`, once the layer has drawn it. */
      const control = <T extends HTMLElement>(label: string) =>
        vi.waitFor(async () => {
          await fixture.whenStable();
          const found = root.querySelector<T>(`[data-layer="form"] [aria-label="${label}"]`);
          expect(found).not.toBeNull();
          return found!;
        });

      // Filling: the buyer's field says whose it is, and its box shows the buyer's color.
      const input = await control<HTMLInputElement>('name, Dana Smith');
      expect(input.parentElement!.style.boxShadow).toBe(EDGE);
      // A group nobody named shows too, in a color of the eight, and names nobody.
      const other = await control<HTMLInputElement>('witness');
      expect(other.parentElement!.style.boxShadow).toBe(WITNESS_EDGE);
      // A field in no group shows as the PDF has it.
      const none = await control<HTMLInputElement>('note');
      expect(none.parentElement!.style.boxShadow).toBe('');
      // A list draws its own border: the color is that border's.
      const list = await control<HTMLSelectElement>('choice, Dana Smith');
      expect(list.style.borderColor).toBe(BUYER);

      // The state: the form's groups, and who new fields are placed for.
      expect(form.designGroup()).toBeNull();
      expect(form.groups()).toEqual([
        { id: 'buyer', label: 'Dana Smith', color: BUYER },
        { id: 'witness', label: null, color: WITNESS },
      ]);
      form.setDesignGroup('buyer');
      expect(form.designGroup()).toBe('buyer');
      expect(changes).toEqual([{ groupId: 'buyer' }]);

      // Design mode: the fields are lent to the annotation layer, which shows the buyer's
      // field in the buyer's color, above its drawing, and the other field with none.
      interaction.activateTool('form-edit');
      const layer = root.querySelector<HTMLElement>('[data-layer="annotation"]')!;
      const accents = (edge = EDGE) =>
        [...layer.querySelectorAll<HTMLElement>('div')].filter(
          (element) => element.style.boxShadow === edge,
        );
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(accents()).toHaveLength(2);
        expect(accents(WITNESS_EDGE)).toHaveLength(1);
        for (const accent of accents()) expect(accent.style.pointerEvents).toBe('none');
      });
      expect(root.querySelector('[data-layer="form"] input')).toBeNull();

      // A field in no group moves to the buyer in one call, and shows in the buyer's color.
      const note = form.list().find((field) => field.name === 'note')!;
      const moved = await form.moveToGroup([note.ref], 'buyer');
      expect(moved.fields.map((field) => field.groupId)).toEqual(['buyer']);
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(accents()).toHaveLength(3);
      });

      // With the tint at 0, no field carries a color in either mode; the names stay.
      form.updateSettings({ fields: { tint: 0 } });
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(accents()).toHaveLength(0);
        expect(accents(WITNESS_EDGE)).toHaveLength(0);
      });
      interaction.activateTool('pointer');
      const plain = await control<HTMLInputElement>('name, Dana Smith');
      expect(plain.parentElement!.style.boxShadow).toBe('');
    },
  );
});
