/**
 * Controls of the app's own in the form layer, and UI anchored to a box of a field, against a
 * real kernel and the real engine: an `<ng-template [epdfFieldControl]>` draws the boxes its
 * function matches and fills the field in, takes the cursor in its first tab stop, keeps the
 * layer's control and the field's picture as `native`, stands down with the layer's own
 * controls, and reads the way a turned field does; `form.widgetAnchorOf()` follows one box.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal, type Type } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { annotationKey, type AnnotationRef, type Engine, type PageRef } from '@embedpdf/core';
import { pageTransform } from '@embedpdf/core-geometry';
import { createLocalEngine } from '@embedpdf/engine';
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { RenderToken as RenderHostToken } from '@embedpdf/plugin-render/contract/host';
import { createPageContext, EPDF_PAGE, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import { withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { withRender } from '@embedpdf/angular/render';
import { withSignature } from '@embedpdf/angular/signature';
import {
  EpdfFieldControlTemplate,
  EpdfForm,
  EpdfFormLayer,
  FormToken,
  toFieldRef,
  withForm,
  type FieldControlFrame,
  type FormWidgetItem,
} from '@embedpdf/angular/form';
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

/** The page, from the top-left corner of the screen, once the test names it. */
const shownPage = signal<{ documentId: string; ref: PageRef } | null>(null);
/** The page's turn and zoom, against a 100% of 1 pixel per point. */
const shownView = signal<{ rotation: 0 | 90; scale: number }>({ rotation: 0, scale: 1 });

const pageProvider = {
  provide: EPDF_PAGE,
  useFactory: () =>
    createPageContext({
      documentId: () => shownPage()!.documentId,
      ref: () => shownPage()!.ref,
      view: () => 'test-view',
      pageIndex: signal(0),
      frame: signal({ top: 0, right: 0, bottom: 0, left: 0 }),
      transform: computed(() =>
        pageTransform({ pageSize: LETTER, ...shownView(), baseScale: 1, dpr: 1 }),
      ),
      getRect: () => new DOMRect(0, 0, LETTER.width, LETTER.height),
    }),
};

const isCheckbox = (widget: FormWidgetItem) =>
  widget.control === 'toggle' && widget.kind === 'checkbox';

/** A checkbox drawn as a switch: it fills its frame and writes through `setValue`. */
const SWITCH = `
  <ng-template
    [epdfFieldControl]="isCheckbox"
    let-widget
    let-setValue="setValue"
    let-focused="focused"
  >
    <button
      role="switch"
      style="width: 100%; height: 100%"
      [attr.aria-checked]="widget.checked"
      [attr.aria-label]="widget.label"
      [attr.data-focused]="focused"
      [disabled]="widget.disabled"
      (click)="setValue({ checked: !widget.checked })"
    ></button>
  </ng-template>
`;

/** Checkboxes drawn as switches; every other box is the layer's. */
@Component({
  selector: 'test-switch-page',
  imports: [EpdfFormLayer, EpdfFieldControlTemplate],
  providers: [pageProvider],
  template: `
    @if (page()) {
      <epdf-form-layer>${SWITCH}</epdf-form-layer>
    }
  `,
})
class SwitchPage {
  protected readonly page = shownPage;
  protected readonly isCheckbox = isCheckbox;
}

/** The text box `name` keeps the layer's control and gets a button after it; checkboxes are switches. */
@Component({
  selector: 'test-native-page',
  imports: [EpdfFormLayer, EpdfFieldControlTemplate, NgTemplateOutlet],
  providers: [pageProvider],
  template: `
    @if (page()) {
      <epdf-form-layer>
        <ng-template [epdfFieldControl]="isName" let-widget let-native="native">
          <ng-container [ngTemplateOutlet]="native" />
          <button [attr.aria-label]="'Pick for ' + widget.label" tabindex="-1"></button>
        </ng-template>
        ${SWITCH}
      </epdf-form-layer>
    }
  `,
})
class NativePage {
  protected readonly page = shownPage;
  protected readonly isCheckbox = isCheckbox;
  protected readonly isName = (widget: FormWidgetItem) =>
    widget.control === 'text' && widget.label === 'name';
}

/** Every toggle drawn by the first of two controls that match it, its frame written on the control. */
@Component({
  selector: 'test-frame-page',
  imports: [EpdfFormLayer, EpdfFieldControlTemplate],
  providers: [pageProvider],
  template: `
    @if (page()) {
      <epdf-form-layer>
        <ng-template
          [epdfFieldControl]="isToggle"
          let-widget
          let-frame="frame"
          let-setValue="setValue"
        >
          <button
            role="switch"
            style="width: 100%; height: 100%"
            [attr.aria-label]="widget.label"
            [attr.data-frame]="json(frame)"
            (click)="setValue({ checked: !widget.checked })"
          ></button>
        </ng-template>
        <ng-template [epdfFieldControl]="isToggle"><i class="second"></i></ng-template>
      </epdf-form-layer>
    }
  `,
})
class FramePage {
  protected readonly page = shownPage;
  protected readonly isToggle = (widget: FormWidgetItem) => widget.control === 'toggle';
  protected readonly json = (frame: FieldControlFrame) => JSON.stringify(frame);
}

/** UI that anchors to one box: the anchor of the box it's pointed at. */
@Component({
  selector: 'test-tag',
  imports: [EpdfFormLayer],
  providers: [pageProvider],
  template: `
    @if (page()) {
      <epdf-form-layer />
    }
  `,
})
class Tag {
  protected readonly page = shownPage;
  readonly target = signal<AnnotationRef | null>(null);
  readonly anchor = inject(EpdfForm).widgetAnchorOf(() => this.target());
}

/** The layer alone: every box is the layer's own. */
@Component({
  selector: 'test-plain-page',
  imports: [EpdfFormLayer],
  providers: [pageProvider],
  template: `
    @if (page()) {
      <epdf-form-layer />
    }
  `,
})
class PlainPage {
  protected readonly page = shownPage;
}

const isSignature = (widget: FormWidgetItem) => widget.control === 'signature';

/** Signature fields drawn as a button of the app's own: something that takes the cursor. */
@Component({
  selector: 'test-sign-button-page',
  imports: [EpdfFormLayer, EpdfFieldControlTemplate],
  providers: [pageProvider],
  template: `
    @if (page()) {
      <epdf-form-layer>
        <ng-template [epdfFieldControl]="isSignature" let-widget>
          <button style="width: 100%" [attr.aria-label]="'Sign ' + widget.label"></button>
        </ng-template>
      </epdf-form-layer>
    }
  `,
})
class SignButtonPage {
  protected readonly page = shownPage;
  protected readonly isSignature = isSignature;
}

/** Signature fields drawn as words only: nothing in the box takes the cursor. */
@Component({
  selector: 'test-note-page',
  imports: [EpdfFormLayer, EpdfFieldControlTemplate],
  providers: [pageProvider],
  template: `
    @if (page()) {
      <epdf-form-layer>
        <ng-template [epdfFieldControl]="isSignature">
          <span data-note>Signed on paper</span>
        </ng-template>
      </epdf-form-layer>
    }
  `,
})
class NotePage {
  protected readonly page = shownPage;
  protected readonly isSignature = isSignature;
}

/** A viewer on the real engine with a blank page open, `page` in it, and the form read. */
async function openForm(
  page: Type<unknown>,
  selector: string,
  features: EmbedPdfFeature[] = [withInteraction(), withForm()],
) {
  const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
  const fixture = await mount(
    viewerHost({
      template: `<${selector} />`,
      imports: [page],
      // The viewer's own engine: destroyed after the kernel, when the test's module goes.
      config: {
        engine: realEngine,
        initialDocuments: [{ source: { kind: 'bytes', id: 'blank', bytes } }],
      },
      features,
    }),
  );
  await vi.waitFor(() => expect(kernelOf(fixture).tryCapability(FormToken)).toBeTruthy(), {
    timeout: 20_000,
  });
  const kernel = kernelOf(fixture);
  const form = kernel.capability(FormToken);
  await form.refresh();
  const ref = kernel.documents.getPage(0, 'blank')!.ref;
  return {
    fixture,
    kernel,
    form,
    host: kernel.capability(FormHostToken),
    page: ref,
    /** Put the layer on the page. */
    show: async () => {
      shownPage.set({ documentId: 'blank', ref });
      await fixture.whenStable();
    },
  };
}

const element = (fixture: ComponentFixture<unknown>) => fixture.nativeElement as HTMLElement;

/** The element `selector` finds, once it's drawn. */
const drawn = <E extends HTMLElement>(fixture: ComponentFixture<unknown>, selector: string) =>
  vi.waitFor(async () => {
    await fixture.whenStable();
    const found = element(fixture).querySelector<E>(selector);
    expect(found).not.toBeNull();
    return found!;
  });

const key = (target: HTMLElement, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

afterEach(() => {
  shownPage.set(null);
  shownView.set({ rotation: 0, scale: 1 });
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

describe("<epdf-form-layer> with a control of the app's own", () => {
  it(
    'draws the boxes it matches, fills the field in, and leaves the others to the layer',
    { timeout: 45_000 },
    async () => {
      const { fixture, form, host, page, show } = await openForm(SwitchPage, 'test-switch-page');
      await form.create({
        kind: 'text',
        name: 'name',
        widgets: [{ page, rect: { x: 72, y: 100, width: 160, height: 20 } }],
      });
      await form.create({
        kind: 'checkbox',
        name: 'agree',
        widgets: [{ page, rect: { x: 72, y: 140, width: 28, height: 14 } }],
      });
      await show();

      const toggle = await drawn(fixture, '[role="switch"][aria-label="agree"]');
      // The layer's own checkbox is not drawn for it; the text box is the layer's, as always.
      expect(element(fixture).querySelector('[role="checkbox"]')).toBeNull();
      expect(element(fixture).querySelector('input[aria-label="name"]')).not.toBeNull();

      // The box is the layer's: placed like the field, with no edge of its own.
      const frame = toggle.parentElement!;
      const box = frame.parentElement!;
      expect(box.style.left).toBe('72px');
      expect(box.style.top).toBe('140px');
      expect(box.style.width).toBe('28px');
      expect(box.style.height).toBe('14px');
      expect(box.style.boxShadow).toBe('');
      // The control draws at the field's 100% size, scaled with the page.
      expect(frame.style.width).toBe('28px');
      expect(frame.style.transform).toBe('scale(1)');

      // A click fills the field in, then runs the widget's action, once.
      const order: string[] = [];
      const write = vi.spyOn(host, 'setValue');
      const action = vi.spyOn(host, 'activateWidget').mockImplementation(async () => {
        order.push(`action:${JSON.stringify(form.getValue(toFieldRef('agree')))}`);
        return { status: 'dispatched', result: { status: 'no-action' } } as never;
      });
      toggle.click();
      await vi.waitFor(() => expect(form.getValue(toFieldRef('agree'))).toEqual({ checked: true }));
      expect(write).toHaveBeenCalledWith(expect.anything(), { checked: true });
      await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      expect(order).toEqual(['action:{"checked":true}']);
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(toggle.getAttribute('aria-checked')).toBe('true');
      });
    },
  );

  it(
    'takes the cursor in its first tab stop, and is the focused field while the cursor is in it',
    { timeout: 45_000 },
    async () => {
      const { fixture, form, page, show } = await openForm(SwitchPage, 'test-switch-page');
      await form.create({
        kind: 'text',
        name: 'name',
        widgets: [{ page, rect: { x: 72, y: 100, width: 160, height: 20 } }],
      });
      await form.create({
        kind: 'checkbox',
        name: 'agree',
        widgets: [{ page, rect: { x: 72, y: 140, width: 28, height: 14 } }],
      });
      await show();
      const toggle = await drawn(fixture, '[role="switch"][aria-label="agree"]');
      const name = element(fixture).querySelector<HTMLInputElement>('input[aria-label="name"]')!;
      const service = fixture.debugElement.injector.get(EpdfForm);
      const changes: (string | null)[] = [];
      const subscription = service.focusChanged$.subscribe((change) =>
        changes.push(change.field?.name ?? null),
      );
      const focusedIs = (focused: 'true' | 'false') =>
        vi.waitFor(async () => {
          await fixture.whenStable();
          expect(toggle.dataset['focused']).toBe(focused);
        });

      // `focus()` puts the cursor in the control's first tab stop.
      form.focus(toFieldRef('agree'));
      expect(document.activeElement).toBe(toggle);
      await vi.waitFor(() => expect(form.getFocusedField()?.name).toBe('agree'));
      expect(service.focusedField()?.name).toBe('agree');
      await focusedIs('true');

      // Shift+Tab goes the form's way, to the text box before it; Tab comes back.
      key(toggle, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(name);
      await vi.waitFor(() => expect(form.getFocusedField()?.name).toBe('name'));
      await focusedIs('false');
      key(name, { key: 'Tab' });
      expect(document.activeElement).toBe(toggle);
      await vi.waitFor(() => expect(form.getFocusedField()?.name).toBe('agree'));
      expect(changes).toEqual(['agree', 'name', 'agree']);
      subscription.unsubscribe();
    },
  );

  it(
    "keeps the layer's control and the field's picture as `native`, and adds to them",
    { timeout: 45_000 },
    async () => {
      const { fixture, form, host, kernel, page, show } = await openForm(
        NativePage,
        'test-native-page',
        [withInteraction(), withRender(), withForm()],
      );
      await form.create({
        kind: 'text',
        name: 'name',
        widgets: [{ page, rect: { x: 72, y: 100, width: 160, height: 20 }, color: '#94a3b8' }],
      });
      await form.create({
        kind: 'checkbox',
        name: 'agree',
        widgets: [{ page, rect: { x: 72, y: 140, width: 14, height: 14 } }],
      });
      await form.create({
        kind: 'text',
        name: 'other',
        widgets: [{ page, rect: { x: 72, y: 180, width: 160, height: 20 } }],
      });
      // The render plugin's pictures are stand-ins: a URL naming the widget and its state.
      const shown = host.listShownWidgets(page);
      vi.spyOn(kernel.capability(RenderHostToken), 'renderAppearances').mockImplementation(
        async (_page, { items }) =>
          shown.flatMap((widget) =>
            (widget.appearanceState === null ? [null] : ['Off', 'Yes']).map((state) => ({
              ref: widget.ref,
              mode: 'normal' as const,
              state,
              rect: widget.rect,
              version:
                items.find((item) => annotationKey(item.ref) === annotationKey(widget.ref))
                  ?.version ?? 0,
              image: {
                objectUrl: () => ({
                  abortWith: async () => ({
                    url: `blob:${annotationKey(widget.ref)}:${state}`,
                    revoke: () => {},
                  }),
                }),
              },
            })),
          ) as never,
      );
      await show();

      const [text, agree, other] = shown;
      const input = await drawn<HTMLInputElement>(fixture, 'input[aria-label="name"]');
      const sources = (selector: string) =>
        [...element(fixture).querySelectorAll(selector)].map((image) => image.getAttribute('src'));
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(sources('img')).toHaveLength(2);
      });
      // The layer draws the picture of the box it draws itself, and no other.
      expect(sources('epdf-field-pictures img')).toEqual([
        `blob:${annotationKey(other!.ref)}:null`,
      ]);
      // A switch draws no picture of the checkbox; the text box's picture is inside `native`.
      expect(
        sources('img').some((url) => url!.startsWith(`blob:${annotationKey(agree!.ref)}:`)),
      ).toBe(false);
      const picture = element(fixture).querySelector<HTMLImageElement>(
        `img[src="blob:${annotationKey(text!.ref)}:null"]`,
      )!;
      const native = picture.parentElement!;
      // `native` is the box's size on screen, and the picture fills it.
      expect(native.style.width).toBe('160px');
      expect(native.style.height).toBe('20px');
      expect(picture.style.left).toBe('0px');
      expect(picture.style.width).toBe('160px');
      // The layer's own editor is in it, in a box that only fills its place.
      expect(native.contains(input)).toBe(true);
      expect(input.parentElement!.style.left).toBe('0px');
      expect(input.parentElement!.style.width).toBe('160px');
      // The app's button sits next to it, in the frame.
      const button = element(fixture).querySelector<HTMLElement>(
        'button[aria-label="Pick for name"]',
      )!;
      expect(button.parentElement).toBe(native.parentElement);

      // Typing in the layer's editor fills the field in, as it does without a control.
      input.dispatchEvent(new FocusEvent('focus'));
      input.value = 'Ada';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('blur'));
      await vi.waitFor(() => expect(form.getValue(toFieldRef('name'))).toEqual({ value: 'Ada' }));

      // The cursor goes to the editor: the button's `tabindex` keeps it out of Tab's way.
      form.focus(toFieldRef('name'));
      expect(document.activeElement).toBe(input);

      // A press in the layer's control reaches the field's "mouse down" action once, from the
      // app's box, and stops there.
      const events: string[] = [];
      vi.spyOn(host, 'notifyWidgetEvent').mockImplementation((_field, _widget, event) => {
        events.push(event);
      });
      input.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      expect(events.filter((event) => event === 'mouseDown')).toHaveLength(1);

      // A click on the layer's control runs the widget's action once, not once more for the box.
      const action = vi.spyOn(host, 'activateWidget');
      input.click();
      expect(action).toHaveBeenCalledTimes(1);
      // A click on the app's own part runs it too: it is a click in the field.
      button.click();
      await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    },
  );

  it(
    'stands down with the layer’s own controls when the tool does not fill forms',
    { timeout: 45_000 },
    async () => {
      const { fixture, form, page, show } = await openForm(SwitchPage, 'test-switch-page', [
        withInteraction(),
        withAnnotation(),
        withForm(),
      ]);
      await form.create({
        kind: 'checkbox',
        name: 'agree',
        widgets: [{ page, rect: { x: 72, y: 140, width: 28, height: 14 } }],
      });
      await show();
      await drawn(fixture, '[role="switch"][aria-label="agree"]');
      const interaction = fixture.debugElement.injector.get(EpdfInteraction);
      interaction.activateTool('form-edit');
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(element(fixture).querySelector('[role="switch"]')).toBeNull();
      });
      interaction.activateDefaultTool();
      await drawn(fixture, '[role="switch"][aria-label="agree"]');
    },
  );
});

describe('<epdf-form-layer>: Tab and a box with nothing to take the cursor', () => {
  type Opened = Awaited<ReturnType<typeof openForm>>;

  /** A text box, a signature field and a second text box, added in that order: Tab's order. */
  async function threeFields({ form, page }: Opened) {
    await form.create({
      kind: 'text',
      name: 'first',
      widgets: [{ page, rect: { x: 72, y: 100, width: 160, height: 20 } }],
    });
    await form.create({
      kind: 'signature',
      name: 'sign',
      widgets: [{ page, rect: { x: 72, y: 140, width: 160, height: 40 } }],
    });
    await form.create({
      kind: 'text',
      name: 'second',
      widgets: [{ page, rect: { x: 72, y: 200, width: 160, height: 20 } }],
    });
  }

  /** Press Tab in an element; whether the layer took the press from the browser. */
  const tab = (target: HTMLElement, shiftKey = false): boolean =>
    !key(target, { key: 'Tab', shiftKey });

  it('passes over a signature field when nothing can sign it', { timeout: 45_000 }, async () => {
    // No signature plugin: the signature field is only its picture.
    const opened = await openForm(PlainPage, 'test-plain-page');
    const { fixture, form } = opened;
    await threeFields(opened);
    await opened.show();
    const first = await drawn<HTMLInputElement>(fixture, 'input[aria-label="first"]');
    const second = await drawn<HTMLInputElement>(fixture, 'input[aria-label="second"]');
    expect(form.listWidgets(opened.page).map((item) => item.control)).toEqual([
      'text',
      'signature',
      'text',
    ]);
    expect(element(fixture).querySelectorAll('input, button')).toHaveLength(2);

    expect(form.focus(toFieldRef('first'))).toBe(true);
    expect(document.activeElement).toBe(first);
    // Tab goes to the second text box, over the signature field.
    expect(tab(first)).toBe(true);
    expect(document.activeElement).toBe(second);
    await vi.waitFor(() => expect(form.getFocusedField()?.name).toBe('second'));
    // Past the last field the browser's Tab goes on, out of the form.
    expect(tab(second)).toBe(false);
    expect(document.activeElement).toBe(second);
    // Shift+Tab comes back over it.
    expect(tab(second, true)).toBe(true);
    expect(document.activeElement).toBe(first);

    // Your code's moves pass over it too.
    expect(form.focus(toFieldRef('sign'))).toBe(false);
    expect(document.activeElement).toBe(first);
    expect(form.focusNext()).toBe(true);
    expect(document.activeElement).toBe(second);
  });

  it(
    'stops at a signature field with the signature plugin, whose "sign here" takes the cursor',
    { timeout: 45_000 },
    async () => {
      const opened = await openForm(PlainPage, 'test-plain-page', [
        withInteraction(),
        withForm(),
        withSignature(),
      ]);
      const { fixture, form } = opened;
      await threeFields(opened);
      await opened.show();
      const first = await drawn<HTMLInputElement>(fixture, 'input[aria-label="first"]');
      const second = await drawn<HTMLInputElement>(fixture, 'input[aria-label="second"]');
      const sign = await drawn<HTMLButtonElement>(fixture, 'button[aria-label="sign"]');

      expect(form.focus(toFieldRef('first'))).toBe(true);
      expect(tab(first)).toBe(true);
      expect(document.activeElement).toBe(sign);
      await vi.waitFor(() => expect(form.getFocusedField()?.name).toBe('sign'));
      expect(tab(sign)).toBe(true);
      expect(document.activeElement).toBe(second);
      expect(tab(second, true)).toBe(true);
      expect(document.activeElement).toBe(sign);
      expect(form.focus(toFieldRef('sign'))).toBe(true);
    },
  );

  it(
    "stops at a signature field a control of the app's own draws with something to focus",
    { timeout: 45_000 },
    async () => {
      const opened = await openForm(SignButtonPage, 'test-sign-button-page');
      const { fixture, form } = opened;
      await threeFields(opened);
      await opened.show();
      const first = await drawn<HTMLInputElement>(fixture, 'input[aria-label="first"]');
      const second = await drawn<HTMLInputElement>(fixture, 'input[aria-label="second"]');
      const sign = await drawn<HTMLButtonElement>(fixture, 'button[aria-label="Sign sign"]');

      expect(form.focus(toFieldRef('first'))).toBe(true);
      expect(tab(first)).toBe(true);
      expect(document.activeElement).toBe(sign);
      expect(tab(sign)).toBe(true);
      expect(document.activeElement).toBe(second);
    },
  );

  it(
    "passes over a control of the app's own that holds nothing to focus",
    { timeout: 45_000 },
    async () => {
      const opened = await openForm(NotePage, 'test-note-page');
      const { fixture, form } = opened;
      await threeFields(opened);
      await opened.show();
      const first = await drawn<HTMLInputElement>(fixture, 'input[aria-label="first"]');
      const second = await drawn<HTMLInputElement>(fixture, 'input[aria-label="second"]');
      await drawn(fixture, '[data-note]');

      expect(form.focus(toFieldRef('first'))).toBe(true);
      expect(tab(first)).toBe(true);
      expect(document.activeElement).toBe(second);
      expect(form.focus(toFieldRef('sign'))).toBe(false);
    },
  );
});

describe('<epdf-form-layer> with a turned control', () => {
  it(
    'draws in a frame the layer turns with the field and scales with the page',
    { timeout: 45_000 },
    async () => {
      // The page is turned a quarter and shown at 200%.
      shownView.set({ rotation: 90, scale: 2 });
      const { fixture, form, host, page, show } = await openForm(FramePage, 'test-frame-page');
      // Its frame is 40 by 20; turned 270° it stands 20 wide and 40 tall.
      await form.create({
        kind: 'checkbox',
        name: 'side',
        widgets: [{ page, box: { x: 100, y: 300, width: 40, height: 20 }, rotation: 270 }],
      });
      await form.create({
        kind: 'checkbox',
        name: 'flat',
        widgets: [{ page, rect: { x: 100, y: 100, width: 40, height: 20 } }],
      });
      await show();

      const side = await drawn(fixture, '[role="switch"][aria-label="side"]');
      const frame = side.parentElement!;
      const box = frame.parentElement!;
      // The box is the field's frame, turned with it about its middle, as the layer's own is.
      expect(box.style.width).toBe('80px');
      expect(box.style.height).toBe('40px');
      expect(box.style.transform).toBe('rotate(270deg)');
      // The control draws at the field's 100% size; the layer scales it with the page.
      expect(frame.style.width).toBe('40px');
      expect(frame.style.height).toBe('20px');
      expect(frame.style.transform).toBe('scale(2)');
      // The frame says how it reads on screen: the field's turn and the page's.
      const flat = element(fixture).querySelector<HTMLElement>(
        '[role="switch"][aria-label="flat"]',
      )!;
      const frameOf = (control: HTMLElement) => JSON.parse(control.dataset['frame']!) as unknown;
      expect(frameOf(side)).toEqual({ width: 40, height: 20, rotation: 0, scale: 2 });
      expect(frameOf(flat)).toEqual({ width: 40, height: 20, rotation: 90, scale: 2 });
      expect(flat.parentElement!.parentElement!.style.transform).toBe('');
      // The first control that matches a box draws it: the second one never does.
      expect(element(fixture).querySelector('.second')).toBeNull();

      // The turned control fills its field in. The click runs the widget's action once its
      // write is answered: waited for, so it runs before the page goes.
      const activated = vi.spyOn(host, 'activateWidget');
      side.click();
      await vi.waitFor(() => expect(form.getValue(toFieldRef('side'))).toEqual({ checked: true }));
      await vi.waitFor(() => expect(activated).toHaveBeenCalledTimes(1));
    },
  );
});

describe('form.widgetAnchorOf()', () => {
  it(
    'gives the anchor of one box, follows the box, and is null without one',
    { timeout: 45_000 },
    async () => {
      const { fixture, form, page, show } = await openForm(Tag, 'test-tag');
      await form.create({
        kind: 'text',
        name: 'name',
        widgets: [{ page, rect: { x: 72, y: 100, width: 160, height: 20 } }],
      });
      await form.create({
        kind: 'text',
        name: 'other',
        widgets: [{ page, rect: { x: 72, y: 140, width: 160, height: 20 } }],
      });
      await show();
      await drawn(fixture, 'input[aria-label="name"]');
      const tag = fixture.debugElement.query((node) => node.componentInstance instanceof Tag)
        .componentInstance as Tag;
      // Nothing to anchor to yet.
      expect(tag.anchor()).toBeNull();

      const [box] = form.listWidgets(page);
      tag.target.set(box!.ref);
      expect(tag.anchor()).toEqual({ page, bounds: { x: 72, y: 100, width: 160, height: 20 } });

      // A change elsewhere in the form gives the same anchor: UI on it stays put.
      const before = tag.anchor();
      await form.setValue(toFieldRef('other'), { value: 'Ada' });
      expect(tag.anchor()).toBe(before);

      // The anchor follows the box when the field is moved.
      await form.updateWidget(box!.ref, { rect: { x: 300, y: 400, width: 160, height: 20 } });
      await vi.waitFor(() =>
        expect(tag.anchor()?.bounds).toEqual({ x: 300, y: 400, width: 160, height: 20 }),
      );

      // It takes the ref itself, and `null`, as well as a function.
      const service = fixture.debugElement.injector.get(EpdfForm);
      expect(service.widgetAnchorOf(box!.ref)()?.bounds).toEqual(tag.anchor()!.bounds);
      expect(service.widgetAnchorOf(null)()).toBeNull();

      // A box that isn't there has no anchor.
      tag.target.set({ ...box!.ref, objectNumber: 99_999 } as AnnotationRef);
      expect(tag.anchor()).toBeNull();
    },
  );
});
