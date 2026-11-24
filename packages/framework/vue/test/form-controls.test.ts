import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computed, defineComponent, h, shallowRef } from 'vue';
import type { Component, PropType, Ref, VNodeChild } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageTransform } from '@embedpdf/core-geometry';
import { annotationKey, type AnyPlugin, type Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import type { AnnotationRef } from '@embedpdf/plugin-annotation/contract';
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction';
import { RenderToken as RenderHostToken } from '@embedpdf/plugin-render/contract/host';
import { interactionPlugin } from '../src/interaction';
import { renderPlugin } from '../src/render';
import { signaturePlugin } from '../src/signature';
import { FormLayer, FormToken, formPlugin, toFieldRef, useFormWidgetAnchor } from '../src/form';
import type {
  FieldControl,
  FieldControlFrame,
  FieldControlProps,
  FormWidgetAnchor,
} from '../src/form';
import { makePageContext, providePage } from '../src/runtime';
import type { PageContextValue } from '../src/runtime';
import { probe, settle, viewerWith } from './counter-plugin';

/**
 * `<FormLayer :controls>` and `useFormWidgetAnchor()` over a real kernel and
 * engine: a blank page with fields made from code, and the layer on it.
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

async function mountLayer(
  layer: () => VNodeChild,
  {
    plugins = [interactionPlugin(), formPlugin()],
    rotation = 0,
    scale = 1,
  }: { plugins?: AnyPlugin[]; rotation?: 0 | 90; scale?: number } = {},
) {
  const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
  const engine = await realEngine();
  const context = shallowRef<PageContextValue | null>(null);
  const Page = probe(() => {
    providePage(computed(() => context.value as PageContextValue));
    return () => (context.value ? layer() : null);
  });
  const { kernel, wrapper } = await viewerWith(plugins, () => h(Page), engine);
  await kernel.documents.open({ kind: 'bytes', id: 'blank', bytes });
  await vi.waitFor(() => expect(kernel.tryCapability(FormToken, undefined)).toBeTruthy(), {
    timeout: 20_000,
  });
  const form = kernel.capability(FormToken);
  await form.refresh();
  const page = kernel.documents.getPage(0, 'blank')!.ref;
  return {
    kernel,
    form,
    host: kernel.capability(FormHostToken),
    page,
    /** Put the layer on the page, at the mount's zoom and turn. */
    show: async () => {
      context.value = makePageContext(
        'blank',
        'test-view',
        page,
        0,
        { top: 0, right: 0, bottom: 0, left: 0 },
        // `scale` against a 100% of 1 pixel per point.
        pageTransform({
          pageSize: { width: 612, height: 792 },
          rotation,
          scale,
          baseScale: 1,
          dpr: 1,
        }),
        () => new DOMRect(0, 0, 612, 792),
      );
      await settle();
    },
    close: async () => {
      wrapper.unmount();
      // The kernel closes its documents first (a second destroy joins the Viewer's).
      await kernel.destroy();
      await engine.destroy();
    },
  };
}

/** An element the layer reaches asynchronously. */
const found = <T extends Element>(selector: string) =>
  vi.waitFor(() => {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`nothing matches ${selector} yet`);
    return element;
  });

const press = (element: Element, key: string, init: KeyboardEventInit = {}) =>
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
  );

/** What every control's component declares: the props the layer hands it. */
const controlProps = {
  widget: { type: Object as PropType<FieldControlProps['widget']>, required: true },
  frame: { type: Object as PropType<FieldControlFrame>, required: true },
  native: { type: [Object, Function] as PropType<Component>, required: true },
  setValue: { type: Function as PropType<FieldControlProps['setValue']>, required: true },
  focused: { type: Boolean, required: true },
} as const;

/** A checkbox drawn as a switch: it fills its frame and writes through `setValue`. */
const Switch = defineComponent({
  props: controlProps,
  setup(props) {
    return () => {
      const { widget } = props;
      if (widget.control !== 'toggle') return null;
      return h('button', {
        role: 'switch',
        'aria-checked': widget.checked,
        'aria-label': widget.label,
        'data-focused': props.focused,
        disabled: widget.disabled,
        style: { width: '100%', height: '100%' },
        onClick: () => void props.setValue({ checked: !widget.checked }),
      });
    };
  },
});

const switches: FieldControl[] = [
  { for: (widget) => widget.control === 'toggle' && widget.kind === 'checkbox', component: Switch },
];

afterEach(() => vi.restoreAllMocks());

describe("<FormLayer :controls>: a control of the app's own", () => {
  it(
    'draws the boxes it matches, fills the field in, and leaves the others to the layer',
    { timeout: 45_000 },
    async () => {
      const mounted = await mountLayer(() => h(FormLayer, { controls: switches }));
      const { form, host, page } = mounted;
      try {
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
        await mounted.show();

        const toggle = await found<HTMLElement>('[role="switch"][aria-label="agree"]');
        // The layer's own checkbox is not drawn for it; the text box is the layer's, as always.
        expect(document.querySelector('[role="checkbox"]')).toBeNull();
        expect(document.querySelector('[aria-label="name"]')?.tagName).toBe('INPUT');

        // The box is the layer's: placed like the field, with no edge of its own.
        const frame = toggle.parentElement as HTMLElement;
        const box = frame.parentElement as HTMLElement;
        expect(box.style.left).toBe('72px');
        expect(box.style.top).toBe('140px');
        expect(box.style.width).toBe('28px');
        expect(box.style.height).toBe('14px');
        expect(box.style.boxShadow).toBe('');
        // The control draws at the field's 100% size, scaled with the page.
        expect(frame.style.width).toBe('28px');
        expect(frame.style.transform).toBe('scale(1)');

        // A click fills the field in, then runs the widget's action.
        const order: string[] = [];
        const write = vi.spyOn(host, 'setValue');
        const action = vi.spyOn(host, 'activateWidget').mockImplementation(async () => {
          order.push(`action:${JSON.stringify(form.getValue(toFieldRef('agree')))}`);
          return { status: 'dispatched', result: { status: 'no-action' } } as never;
        });
        toggle.click();
        await vi.waitFor(() =>
          expect(form.getValue(toFieldRef('agree'))).toEqual({ checked: true }),
        );
        expect(write).toHaveBeenCalledWith(expect.anything(), { checked: true });
        await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
        expect(order).toEqual(['action:{"checked":true}']);
        await vi.waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
      } finally {
        await mounted.close();
      }
    },
  );

  it(
    'takes the cursor in its first tab stop, and is the focused field while the cursor is in it',
    { timeout: 45_000 },
    async () => {
      const mounted = await mountLayer(() => h(FormLayer, { controls: switches }));
      const { form, page } = mounted;
      try {
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
        await mounted.show();
        const toggle = await found<HTMLElement>('[role="switch"][aria-label="agree"]');
        const name = await found<HTMLInputElement>('input[aria-label="name"]');
        // The boxes lend their controls to the form's cursor once they are there.
        await settle();
        const changes: (string | null)[] = [];
        form.onFocusChanged((change) => changes.push(change.field?.name ?? null));

        // `focus()` puts the cursor in the control's first tab stop.
        expect(form.focus(toFieldRef('agree'))).toBe(true);
        expect(document.activeElement).toBe(toggle);
        await vi.waitFor(() => expect(form.getFocusedField()?.name).toBe('agree'));
        await vi.waitFor(() => expect(toggle.dataset.focused).toBe('true'));

        // Shift+Tab goes the form's way, to the text box before it; Tab comes back.
        press(toggle, 'Tab', { shiftKey: true });
        expect(document.activeElement).toBe(name);
        await vi.waitFor(() => expect(form.getFocusedField()?.name).toBe('name'));
        await vi.waitFor(() => expect(toggle.dataset.focused).toBe('false'));
        press(name, 'Tab');
        expect(document.activeElement).toBe(toggle);
        await vi.waitFor(() => expect(form.getFocusedField()?.name).toBe('agree'));
        expect(changes).toEqual(['agree', 'name', 'agree']);
      } finally {
        await mounted.close();
      }
    },
  );

  it(
    "keeps the layer's control and the field's picture as `native`, and adds to them",
    { timeout: 45_000 },
    async () => {
      /** A text box with a button after it. */
      const WithButton = defineComponent({
        props: controlProps,
        setup(props) {
          return () => [
            h(props.native),
            h('button', { 'aria-label': `Pick for ${props.widget.label}`, tabindex: -1 }),
          ];
        },
      });
      const controls: FieldControl[] = [
        { for: (widget) => widget.control === 'text', component: WithButton },
        ...switches,
      ];
      const mounted = await mountLayer(() => h(FormLayer, { controls }), {
        plugins: [interactionPlugin(), renderPlugin(), formPlugin()],
      });
      const { form, host, kernel, page } = mounted;
      try {
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
        await mounted.show();

        const [text, agree] = shown;
        const input = await found<HTMLInputElement>('input[aria-label="name"]');
        const pictures = () => [...document.querySelectorAll('img')];
        const urls = () => pictures().map((image) => image.getAttribute('src'));
        // A switch draws no picture of the checkbox; the text box's picture is inside `native`.
        await vi.waitFor(() => expect(urls()).toContain(`blob:${annotationKey(text!.ref)}:null`));
        expect(urls().some((url) => url?.startsWith(`blob:${annotationKey(agree!.ref)}:`))).toBe(
          false,
        );
        const picture = pictures().find((image) =>
          image.getAttribute('src')?.includes(annotationKey(text!.ref)),
        )!;
        const native = picture.parentElement as HTMLElement;
        // `native` is the box's size on screen, and the picture fills it.
        expect(native.style.width).toBe('160px');
        expect(native.style.height).toBe('20px');
        expect(picture.style.left).toBe('0px');
        expect(picture.style.width).toBe('160px');
        // The layer's own editor is in it, in a box that only fills its place.
        expect(native.contains(input)).toBe(true);
        expect((input.parentElement as HTMLElement).style.left).toBe('0px');
        // The app's button sits next to it, in the frame.
        const button = document.querySelector<HTMLElement>('button[aria-label="Pick for name"]')!;
        expect(button.parentElement).toBe(native.parentElement);

        // Typing in the layer's editor fills the field in, as it does without a control.
        await settle();
        input.dispatchEvent(new FocusEvent('focus'));
        input.value = 'Ada';
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new FocusEvent('blur'));
        await vi.waitFor(() => expect(form.getValue(toFieldRef('name'))).toEqual({ value: 'Ada' }));

        // The cursor goes to the editor: the button's `tabindex` keeps it out of Tab's way.
        expect(form.focus(toFieldRef('name'))).toBe(true);
        expect(document.activeElement).toBe(input);

        // A click on the layer's control runs the widget's action once, not once more for the box.
        const action = vi.spyOn(host, 'activateWidget');
        input.click();
        expect(action).toHaveBeenCalledTimes(1);
        // A click on the app's own part runs it too: it is a click in the field.
        button.click();
        await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(2));
      } finally {
        await mounted.close();
      }
    },
  );

  it(
    'stands down with the layer’s own controls when the tool does not fill forms',
    { timeout: 45_000 },
    async () => {
      const mounted = await mountLayer(() => h(FormLayer, { controls: switches }), {
        plugins: [interactionPlugin(), annotationPlugin(), formPlugin()],
      });
      const { form, kernel, page } = mounted;
      try {
        await form.create({
          kind: 'checkbox',
          name: 'agree',
          widgets: [{ page, rect: { x: 72, y: 140, width: 28, height: 14 } }],
        });
        await mounted.show();
        await found('[role="switch"][aria-label="agree"]');
        const interaction = kernel.capability(InteractionToken);
        interaction.activateTool('form-edit');
        await vi.waitFor(() => expect(document.querySelector('[role="switch"]')).toBeNull());
        interaction.activateDefaultTool();
        await found('[role="switch"][aria-label="agree"]');
      } finally {
        await mounted.close();
      }
    },
  );
});

describe('<FormLayer :controls>: a turned control', () => {
  it(
    'draws in a frame the layer turns with the field and scales with the page',
    { timeout: 45_000 },
    async () => {
      const frames = new Map<string, FieldControlFrame>();
      const Probe = defineComponent({
        props: controlProps,
        setup(props) {
          return () => {
            frames.set(props.widget.label, props.frame);
            return h(Switch, props);
          };
        },
      });
      const controls: FieldControl[] = [
        { for: (widget) => widget.control === 'toggle', component: Probe },
      ];
      // The page is turned a quarter and shown at 200%.
      const mounted = await mountLayer(() => h(FormLayer, { controls }), {
        rotation: 90,
        scale: 2,
      });
      const { form, page } = mounted;
      try {
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
        await mounted.show();

        const side = await found<HTMLElement>('[role="switch"][aria-label="side"]');
        const frame = side.parentElement as HTMLElement;
        const box = frame.parentElement as HTMLElement;
        // The box is the field's frame, turned with it about its middle, as the layer's own is.
        expect(box.style.width).toBe('80px');
        expect(box.style.height).toBe('40px');
        expect(box.style.transform).toBe('rotate(270deg)');
        // The control draws at the field's 100% size; the layer scales it with the page.
        expect(frame.style.width).toBe('40px');
        expect(frame.style.height).toBe('20px');
        expect(frame.style.transform).toBe('scale(2)');
        // The frame says how it reads on screen: the field's turn and the page's.
        expect(frames.get('side')).toEqual({ width: 40, height: 20, rotation: 0, scale: 2 });
        expect(frames.get('flat')).toEqual({ width: 40, height: 20, rotation: 90, scale: 2 });
        const flat = document.querySelector<HTMLElement>('[role="switch"][aria-label="flat"]')!;
        expect((flat.parentElement!.parentElement as HTMLElement).style.transform).toBe('');

        // The turned control fills its field in.
        side.click();
        await vi.waitFor(() =>
          expect(form.getValue(toFieldRef('side'))).toEqual({ checked: true }),
        );
      } finally {
        await mounted.close();
      }
    },
  );
});

describe('<FormLayer>: Tab and a box with nothing to take the cursor', () => {
  type Mounted = Awaited<ReturnType<typeof mountLayer>>;

  /** A text box, a signature field and a second text box, added in that order: Tab's order. */
  async function threeFields({ form, page }: Mounted) {
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
  const tab = (element: Element, shiftKey = false): boolean => !press(element, 'Tab', { shiftKey });

  it('passes over a signature field when nothing can sign it', { timeout: 45_000 }, async () => {
    // No signature plugin: the signature field is only its picture.
    const mounted = await mountLayer(() => h(FormLayer));
    const { form } = mounted;
    try {
      await threeFields(mounted);
      await mounted.show();
      const first = await found<HTMLInputElement>('input[aria-label="first"]');
      const second = await found<HTMLInputElement>('input[aria-label="second"]');
      await settle();
      expect(form.listWidgets(mounted.page).map((item) => item.control)).toEqual([
        'text',
        'signature',
        'text',
      ]);
      expect(document.querySelectorAll('input, button')).toHaveLength(2);

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
    } finally {
      await mounted.close();
    }
  });

  it(
    'stops at a signature field with the signature plugin, whose "sign here" takes the cursor',
    { timeout: 45_000 },
    async () => {
      const mounted = await mountLayer(() => h(FormLayer), {
        plugins: [interactionPlugin(), formPlugin(), signaturePlugin()],
      });
      const { form } = mounted;
      try {
        await threeFields(mounted);
        await mounted.show();
        const first = await found<HTMLInputElement>('input[aria-label="first"]');
        const second = await found<HTMLInputElement>('input[aria-label="second"]');
        const sign = await found<HTMLButtonElement>('button[aria-label="sign"]');
        await settle();

        expect(form.focus(toFieldRef('first'))).toBe(true);
        expect(tab(first)).toBe(true);
        expect(document.activeElement).toBe(sign);
        await vi.waitFor(() => expect(form.getFocusedField()?.name).toBe('sign'));
        expect(tab(sign)).toBe(true);
        expect(document.activeElement).toBe(second);
        expect(tab(second, true)).toBe(true);
        expect(document.activeElement).toBe(sign);
        expect(form.focus(toFieldRef('sign'))).toBe(true);
      } finally {
        await mounted.close();
      }
    },
  );

  it(
    "stops at a signature field a control of the app's own draws with something to focus",
    { timeout: 45_000 },
    async () => {
      const SignButton = defineComponent({
        props: controlProps,
        setup: (props) => () =>
          h('button', { 'aria-label': `Sign ${props.widget.label}`, style: { width: '100%' } }),
      });
      const controls: FieldControl[] = [
        { for: (widget) => widget.control === 'signature', component: SignButton },
      ];
      const mounted = await mountLayer(() => h(FormLayer, { controls }));
      const { form } = mounted;
      try {
        await threeFields(mounted);
        await mounted.show();
        const first = await found<HTMLInputElement>('input[aria-label="first"]');
        const second = await found<HTMLInputElement>('input[aria-label="second"]');
        const sign = await found<HTMLButtonElement>('button[aria-label="Sign sign"]');
        await settle();

        expect(form.focus(toFieldRef('first'))).toBe(true);
        expect(tab(first)).toBe(true);
        expect(document.activeElement).toBe(sign);
        expect(tab(sign)).toBe(true);
        expect(document.activeElement).toBe(second);
      } finally {
        await mounted.close();
      }
    },
  );

  it(
    "passes over a control of the app's own that holds nothing to focus",
    { timeout: 45_000 },
    async () => {
      const Note = defineComponent({
        props: controlProps,
        setup: () => () => h('span', { 'data-note': '' }, 'Signed on paper'),
      });
      const controls: FieldControl[] = [
        { for: (widget) => widget.control === 'signature', component: Note },
      ];
      const mounted = await mountLayer(() => h(FormLayer, { controls }));
      const { form } = mounted;
      try {
        await threeFields(mounted);
        await mounted.show();
        const first = await found<HTMLInputElement>('input[aria-label="first"]');
        const second = await found<HTMLInputElement>('input[aria-label="second"]');
        await found('[data-note]');
        await settle();

        expect(form.focus(toFieldRef('first'))).toBe(true);
        expect(tab(first)).toBe(true);
        expect(document.activeElement).toBe(second);
        expect(form.focus(toFieldRef('sign'))).toBe(false);
      } finally {
        await mounted.close();
      }
    },
  );
});

describe('useFormWidgetAnchor()', () => {
  it(
    'gives the anchor of one box, follows the box, and is null without one',
    { timeout: 45_000 },
    async () => {
      const target = shallowRef<AnnotationRef | null>(null);
      let anchor!: Readonly<Ref<FormWidgetAnchor | null>>;
      const Tag = probe(() => {
        // A getter, so the anchor follows the box it is given.
        anchor = useFormWidgetAnchor(() => target.value);
      });
      const mounted = await mountLayer(() => [h(FormLayer), h(Tag)]);
      const { form, page } = mounted;
      try {
        await form.create({
          kind: 'text',
          name: 'name',
          widgets: [{ page, rect: { x: 72, y: 100, width: 160, height: 20 } }],
        });
        await mounted.show();
        await found('input[aria-label="name"]');
        // Nothing to anchor to yet.
        expect(anchor.value).toBeNull();

        const [box] = form.listWidgets(page);
        target.value = box!.ref;
        await settle();
        expect(anchor.value).toEqual({
          page,
          bounds: { x: 72, y: 100, width: 160, height: 20 },
        });

        // A change elsewhere gives the same anchor: UI on it stays put.
        const before = anchor.value;
        await form.setValue(toFieldRef('name'), { value: 'Ada' });
        await settle();
        expect(anchor.value).toBe(before);

        // The anchor follows the box when the field is moved.
        await form.updateWidget(box!.ref, { rect: { x: 300, y: 400, width: 160, height: 20 } });
        await vi.waitFor(() =>
          expect(anchor.value?.bounds).toEqual({ x: 300, y: 400, width: 160, height: 20 }),
        );

        // A box that isn't there has no anchor.
        target.value = { ...box!.ref, objectNumber: 99_999 } as AnnotationRef;
        await settle();
        expect(anchor.value).toBeNull();
      } finally {
        await mounted.close();
      }
    },
  );
});
