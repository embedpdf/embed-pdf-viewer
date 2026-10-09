/**
 * The form layer and the form service against a real kernel and the real engine (the forms are
 * the engine's): a text box fills in on blur and a checkbox on a click, a field without a border
 * gets the settings' edge, a press on a field stays out of the page below and still reaches the
 * field's PDF "mouse down" action, a click on a read-only "button" runs its action, with the
 * render plugin each field's picture shows the state it's in, and the service's `valueOf()` and
 * `controlOf()` follow one field both ways.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Component, inject, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { annotationKey, type Engine, type PageRef } from '@embedpdf/core';
import { pageTransform } from '@embedpdf/core-geometry';
import { createLocalEngine } from '@embedpdf/engine';
import { actionsPlugin, ActionsToken, type ActionExecutedEvent } from '@embedpdf/plugin-actions';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import type { AnnotationRef } from '@embedpdf/plugin-annotation/contract';
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { RenderToken as RenderHostToken } from '@embedpdf/plugin-render/contract/host';
import {
  createPageContext,
  EPDF_PAGE,
  EpdfKernelHost,
  type EmbedPdfFeature,
} from '@embedpdf/angular/runtime';
import { withInteraction } from '@embedpdf/angular/interaction';
import { withRender } from '@embedpdf/angular/render';
import { EpdfForm, EpdfFormLayer, FormToken, toFieldRef, withForm } from '@embedpdf/angular/form';
import { EpdfSignature, withSignature } from '@embedpdf/angular/signature';
import { kernelOf, mount, viewerHost } from './fixtures';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../../../engine/main/test/fixtures');
const wasm = resolve(here, '../../../engine/runtime/npm/wasm32/lib/embedpdf.wasm');

/** The real engine. happy-dom's browser-shaped globals would steer the wasm toward fetch(): hand it over. */
async function realEngine(): Promise<Engine> {
  const wasmBinary = new Uint8Array(await readFile(wasm));
  return createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });
}

const LETTER = { width: 612, height: 792 };

/** The page, at scale 1 from the top-left corner of the screen, once the test names it. */
const shownPage = signal<{ documentId: string; ref: PageRef } | null>(null);

@Component({
  selector: 'test-form-page',
  imports: [EpdfFormLayer],
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
  template: `<div class="page" (pointerdown)="presses = presses + 1"><epdf-form-layer /></div>`,
})
class FormPage {
  presses = 0;
}

@Component({
  selector: 'test-form-shell',
  imports: [FormPage],
  template: `
    @if (page()) {
      <test-form-page />
    }
  `,
})
class FormShell {
  protected readonly page = shownPage;
}

/** A viewer on the real engine with `file` open as `id`, and its form read. */
async function openForm(
  file: string,
  id: string,
  features: EmbedPdfFeature[] = [withInteraction(), withForm()],
) {
  const bytes = new Uint8Array(await readFile(resolve(fixtures, file)));
  const fixture = await mount(
    viewerHost({
      template: '<test-form-shell />',
      imports: [FormShell],
      // The viewer's own engine: destroyed after the kernel, when the test's module goes.
      config: { engine: realEngine, initialDocuments: [{ source: { kind: 'bytes', id, bytes } }] },
      features,
    }),
  );
  await vi.waitFor(() => expect(kernelOf(fixture).tryCapability(FormToken)).toBeTruthy(), {
    timeout: 20_000,
  });
  const form = kernelOf(fixture).capability(FormToken);
  await form.refresh();
  return { fixture, form };
}

/** Show the page with the form layer on it, and wait for its controls. */
async function showPage(fixture: ComponentFixture<unknown>, documentId: string, ref: PageRef) {
  shownPage.set({ documentId, ref });
  await fixture.whenStable();
}

const element = (fixture: ComponentFixture<unknown>) => fixture.nativeElement as HTMLElement;

afterEach(() => {
  shownPage.set(null);
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

describe('<epdf-form-layer> over fields made from code', () => {
  it(
    'fills in a text box and a checkbox, and draws the edge of a field without a border',
    { timeout: 45_000 },
    async () => {
      const { fixture, form } = await openForm('hello_world.pdf', 'blank', [
        withInteraction(),
        withForm({ fields: { border: '#ea580c' } }),
      ]);
      const page = kernelOf(fixture).documents.getPage(0, 'blank')!.ref;
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
      await showPage(fixture, 'blank', page);

      const input = await vi.waitFor(() => {
        const found = element(fixture).querySelector<HTMLInputElement>('input[aria-label="name"]');
        expect(found).not.toBeNull();
        return found!;
      });
      input.dispatchEvent(new FocusEvent('focus'));
      input.value = 'Ada Lovelace';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('blur'));
      await vi.waitFor(() =>
        expect(form.getValue(toFieldRef('name'))).toEqual({ value: 'Ada Lovelace' }),
      );

      const checkbox = element(fixture).querySelector<HTMLElement>(
        '[role="checkbox"][aria-label="agree"]',
      )!;
      checkbox.click();
      await vi.waitFor(() => expect(form.getValue(toFieldRef('agree'))).toEqual({ checked: true }));

      // Each control's box sits over its widget, and always takes the pointer.
      expect(checkbox.style.position).toBe('absolute');
      expect(checkbox.style.pointerEvents).toBe('auto');
      expect(checkbox.style.left).toBe('72px');
      expect(checkbox.style.top).toBe('140px');
      // The checkbox has no border of its own: the layer draws its edge in the setting's color.
      expect(checkbox.style.boxShadow).toContain('#ea580c');
      // The text box has its own border: no edge.
      expect(input.parentElement!.style.boxShadow).toBe('');

      // A press on a field stops at its box, before the page below sees it, and still reaches the
      // field's PDF actions as "mouse down" (the box's native listener sends it).
      const host = kernelOf(fixture).capability(FormHostToken);
      const events: string[] = [];
      vi.spyOn(host, 'notifyWidgetEvent').mockImplementation((_field, _widget, event) => {
        events.push(event);
      });
      input.parentElement!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      // Exactly once: the box's widget events send it, and the listener that stops the press
      // doesn't send it again.
      expect(events.filter((event) => event === 'mouseDown')).toHaveLength(1);
      const shell = fixture.debugElement.query(
        (node) => node.componentInstance instanceof FormPage,
      );
      expect((shell.componentInstance as FormPage).presses).toBe(0);
    },
  );
});

/**
 * With the render plugin, the layer paints each field as the engine draws it: one picture per
 * widget, the one of the state it shows. The engine encodes pictures with a 2D canvas, which
 * happy-dom doesn't have, so the render plugin's pictures are stand-ins here: a URL naming widget
 * and state.
 */
describe('<epdf-form-layer> field pictures', () => {
  it(
    'paints each field, and a checkbox its new state once it changes',
    { timeout: 45_000 },
    async () => {
      const { fixture, form } = await openForm('hello_world.pdf', 'blank', [
        withInteraction(),
        withRender(),
        withForm(),
      ]);
      const page = kernelOf(fixture).documents.getPage(0, 'blank')!.ref;
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
      const [text, check] = kernelOf(fixture).capability(FormHostToken).listShownWidgets(page);
      const checkBox = { x: 72, y: 140, width: 14, height: 14 };
      const picture = (widget: AnnotationRef, state: string | null, rect: typeof checkBox) => ({
        ref: widget,
        mode: 'normal' as const,
        state,
        rect,
        image: {
          objectUrl: () => ({
            abortWith: async () => ({
              url: `blob:${annotationKey(widget)}:${state}`,
              revoke: () => {},
            }),
          }),
        },
      });
      vi.spyOn(
        kernelOf(fixture).capability(RenderHostToken),
        'renderFieldAppearances',
      ).mockResolvedValue([
        picture(text!.ref, null, { x: 72, y: 100, width: 160, height: 20 }),
        picture(check!.ref, 'Off', checkBox),
        picture(check!.ref, 'Yes', checkBox),
      ] as never);
      await showPage(fixture, 'blank', page);

      const images = () => [...element(fixture).querySelectorAll('epdf-field-pictures img')];
      const pictures = () => images().map((image) => image.getAttribute('src'));
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(pictures()).toHaveLength(2);
      });
      const checkKey = annotationKey(check!.ref);
      expect(pictures()).toEqual([`blob:${annotationKey(text!.ref)}:null`, `blob:${checkKey}:Off`]);
      // Placed by the box the engine drew it into, in page pixels.
      expect((images()[1] as HTMLElement).style.top).toBe('140px');

      element(fixture).querySelector<HTMLElement>('[role="checkbox"][aria-label="agree"]')!.click();
      await vi.waitFor(() => expect(form.getValue(toFieldRef('agree'))).toEqual({ checked: true }));
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(pictures()[1]).toBe(`blob:${checkKey}:Yes`);
      });
    },
  );
});

describe('<epdf-form-layer> choices', () => {
  it(
    'fills in a dropdown and a list, each showing the field’s selection',
    { timeout: 45_000 },
    async () => {
      const { fixture, form } = await openForm('hello_world.pdf', 'blank');
      const page = kernelOf(fixture).documents.getPage(0, 'blank')!.ref;
      const options = ['NL', 'BE', 'DE'].map((value) => ({ label: value, value }));
      await form.create({
        family: 'combobox',
        name: 'country',
        options,
        widgets: [{ page, rect: { x: 72, y: 100, width: 160, height: 20 } }],
      });
      await form.create({
        family: 'listbox',
        name: 'languages',
        options,
        widgets: [{ page, rect: { x: 72, y: 140, width: 160, height: 60 } }],
      });
      await form.setValue(toFieldRef('country'), { value: 'BE' });
      await showPage(fixture, 'blank', page);

      const [dropdown, list] = await vi.waitFor(() => {
        const found = element(fixture).querySelectorAll('select');
        expect(found).toHaveLength(2);
        return [...found];
      });
      // The dropdown is see-through over the field's picture, and shows the field's choice.
      expect(dropdown!.value).toBe('BE');
      expect(dropdown!.style.opacity).toBe('0');
      // The list is visible, and draws its own edge: its box has none.
      expect(list!.style.opacity).toBe('');
      expect(list!.parentElement!.style.boxShadow).toBe('');

      dropdown!.value = 'DE';
      dropdown!.dispatchEvent(new Event('change'));
      await vi.waitFor(() => expect(form.getValue(toFieldRef('country'))).toEqual({ value: 'DE' }));
      // The dropdown is made again for the new selection, and shows it.
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(element(fixture).querySelector('select')!.value).toBe('DE');
      });

      list!.value = 'NL';
      list!.dispatchEvent(new Event('change'));
      await vi.waitFor(() =>
        expect(form.getValue(toFieldRef('languages'))).toEqual({ selectedValues: ['NL'] }),
      );
      await fixture.whenStable();
      // The same list, never made again: its scroll position is the user's.
      expect(element(fixture).querySelectorAll('select')[1]).toBe(list);
      expect(list!.value).toBe('NL');
    },
  );
});

describe('<epdf-form-layer> signature fields', () => {
  it(
    'makes an empty one "sign here": a click makes it the target',
    { timeout: 45_000 },
    async () => {
      const { fixture, form } = await openForm('hello_world.pdf', 'blank', [
        withInteraction(),
        withForm(),
        withSignature(),
      ]);
      const page = kernelOf(fixture).documents.getPage(0, 'blank')!.ref;
      await form.create({
        family: 'signature',
        name: 'approval',
        widgets: [{ page, rect: { x: 72, y: 100, width: 160, height: 48 } }],
      });
      await showPage(fixture, 'blank', page);
      const signature = fixture.debugElement.injector.get(EpdfSignature);

      const button = await vi.waitFor(() => {
        const found = element(fixture).querySelector<HTMLButtonElement>(
          'button[aria-label="approval"]',
        );
        expect(found).not.toBeNull();
        return found!;
      });
      expect(button.hasAttribute('data-signed')).toBe(false);
      expect(button.parentElement!.style.cursor).toBe('pointer');

      // A click makes the field the target the next mark goes to.
      button.click();
      expect(signature.target()).toEqual(form.get(toFieldRef('approval'))!.ref);
    },
  );
});

/**
 * The regression net for the "fake button": a read-only text field with a widget action, which
 * Acrobat runs on a click. Through the real DOM: a click on its box, and the actions plugin's
 * own event stream as proof that its Hide action ran.
 */
describe('widget activation through the DOM (the fake-button pattern)', () => {
  it(
    'clicking a read-only text widget with an action runs the action',
    { timeout: 45_000 },
    async () => {
      const { fixture, form } = await openForm('action_buttons_form.pdf', 'buttons', [
        withInteraction(),
        // Scripting off: Hide is native.
        { plugins: [actionsPlugin({ openSequence: 'off' }), annotationPlugin()] },
        withForm(),
      ]);
      const fake = form.getSnapshot()?.fields.find((field) => field.name === 'fakeButton');
      expect(fake?.readOnly).toBe(true);
      const dispatched: ActionExecutedEvent[] = [];
      kernelOf(fixture)
        .capability(ActionsToken)
        .onExecuted((event) => dispatched.push(event));
      await showPage(fixture, 'buttons', fake!.widgets[0]!.page!);

      // The fake button is a text control with a disabled editor; its box runs the action.
      const input = await vi.waitFor(() => {
        const found = element(fixture).querySelector<HTMLInputElement>('[aria-label="fakeButton"]');
        expect(found).not.toBeNull();
        return found!;
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
    },
  );
});

/** A component of the app's own: one field's value, and an input bound to another field. */
@Component({
  selector: 'test-billing',
  imports: [ReactiveFormsModule],
  template: `<input class="name" [formControl]="name" />`,
})
class Billing {
  private readonly form = inject(EpdfForm);
  readonly total = this.form.valueOf(toFieldRef('total'));
  readonly name = this.form.controlOf(toFieldRef('name'));
}

describe('EpdfForm', () => {
  it('has no fields, and no value, without a document', async () => {
    const fixture = await mount(
      viewerHost({ template: '', features: [withInteraction(), withForm()] }),
    );
    const form = fixture.debugElement.injector.get(EpdfForm);
    expect(form.fields()).toEqual([]);
    expect(form.status()).toBe('idle');
    expect(form.valueOf(toFieldRef('total'))()).toBeNull();
    // An async method rejects without a document, so `.catch()` sees the refusal.
    await expect(form.setValue(toFieldRef('total'), { value: '1' })).rejects.toMatchObject({
      code: 'not-ready',
    });
  });

  it(
    'follows one field with valueOf(), and fills one in with controlOf()',
    { timeout: 45_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
      const fixture = await mount(
        viewerHost({
          template: '<test-billing />',
          imports: [Billing],
          config: {
            engine: realEngine,
            initialDocuments: [{ source: { kind: 'bytes', id: 'blank', bytes } }],
          },
          features: [withInteraction(), withForm()],
        }),
      );
      await vi.waitFor(() => expect(kernelOf(fixture).tryCapability(FormToken)).toBeTruthy(), {
        timeout: 20_000,
      });
      const viewer = fixture.debugElement.injector.get(EpdfKernelHost);
      const form = kernelOf(fixture).capability(FormToken);
      await form.refresh();
      const billing = fixture.debugElement.query(
        (node) => node.componentInstance instanceof Billing,
      ).componentInstance as Billing;
      const input = element(fixture).querySelector<HTMLInputElement>('input.name')!;

      // No such field yet: nothing to fill in.
      await fixture.whenStable();
      expect(billing.name.disabled).toBe(true);
      expect(billing.total()).toBeNull();

      const page = viewer.kernel()!.documents.getPage(0, 'blank')!.ref;
      const at = (y: number) => ({ page, rect: { x: 72, y, width: 160, height: 20 } });
      await form.create({ family: 'text', name: 'name', widgets: [at(100)] });
      await form.create({ family: 'text', name: 'total', widgets: [at(140)] });
      await form.setValue(toFieldRef('total'), { value: '120.00' });
      await form.setValue(toFieldRef('name'), { value: 'Ada' });
      await fixture.whenStable();

      expect(billing.total()).toEqual({ value: '120.00' });
      // The control holds the field's value, in the input too, and can fill it in now.
      expect(billing.name.value).toBe('Ada');
      expect(billing.name.enabled).toBe(true);
      expect(input.value).toBe('Ada');

      // Typing in the input fills in the field.
      input.value = 'Grace';
      input.dispatchEvent(new Event('input'));
      await vi.waitFor(() => expect(form.getValue(toFieldRef('name'))).toEqual({ value: 'Grace' }));

      // A change of the field, whoever made it, reaches the control and the input.
      await form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' });
      await fixture.whenStable();
      expect(billing.name.value).toBe('Ada Lovelace');
      expect(input.value).toBe('Ada Lovelace');

      // A read-only field can't be filled in: the control is disabled.
      await form.update(toFieldRef('name'), { readOnly: true });
      await fixture.whenStable();
      expect(billing.name.disabled).toBe(true);
      expect(input.disabled).toBe(true);
    },
  );
});
