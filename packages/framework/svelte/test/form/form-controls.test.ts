import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushSync } from 'svelte';
import { fireEvent, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pageTransform } from '@embedpdf/core-geometry';
import { annotationKey, type AnnotationRef, type AnyPlugin, type Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { RenderToken as RenderHostToken } from '@embedpdf/plugin-render/contract/host';
import {
  FormToken,
  formPlugin,
  toFieldRef,
  useFormWidgetAnchor,
  type FieldControl,
  type FormWidgetAnchor,
} from '../../src/form';
import { interactionPlugin } from '../../src/interaction';
import { renderPlugin } from '../../src/render';
import { makePageContext, type CurrentValue, type PageContextValue } from '../../src/runtime';
import { signaturePlugin } from '../../src/signature';
import { formControlRecords, resetFormControlRecords } from '../fixtures/form-control-records';
import FormHarness from '../fixtures/FormHarness.svelte';
import FrameSwitchControl from '../fixtures/FrameSwitchControl.svelte';
import NativeWithButton from '../fixtures/NativeWithButton.svelte';
import NoteControl from '../fixtures/NoteControl.svelte';
import { signal } from '../fixtures/signal.svelte';
import SignButtonControl from '../fixtures/SignButtonControl.svelte';
import SwitchControl from '../fixtures/SwitchControl.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * `<FormLayer controls>` and `useFormWidgetAnchor()` over a real kernel and engine: a blank page
 * with fields made from code, and the layer on it. A control of the app's own draws the boxes it
 * matches in the layer's box, fills the field in, takes the cursor, and keeps the layer's own
 * drawing as `native`; an anchor follows one box.
 */

const here = dirname(fileURLToPath(import.meta.url));
const packages = resolve(here, '..', '..', '..', '..');
const fixtures = resolve(packages, 'engine', 'main', 'test', 'fixtures');
const wasmPath = resolve(packages, 'engine', 'runtime', 'npm', 'wasm32', 'lib', 'embedpdf.wasm');

const NO_FRAME = { top: 0, right: 0, bottom: 0, left: 0 };

/** A checkbox drawn as a switch. */
const switches: FieldControl[] = [
  {
    for: (widget) => widget.control === 'toggle' && widget.kind === 'checkbox',
    component: SwitchControl,
  },
];

/** The blank document open in a viewer, with the form layer waiting for its page. */
async function mount({
  plugins = [interactionPlugin(), formPlugin()],
  controls,
  probes,
  rotation = 0,
  scale = 1,
}: {
  plugins?: AnyPlugin[];
  controls?: readonly FieldControl[];
  probes?: { read: () => unknown; pick: (result: unknown) => unknown; seen: unknown[] }[];
  rotation?: 0 | 90;
  scale?: number;
} = {}) {
  const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
  // happy-dom's browser-shaped globals would steer the wasm toward fetch(): hand it over.
  const wasmBinary = new Uint8Array(await readFile(wasmPath));
  const engine = (await createLocalEngine({
    runtime: { prefer: 'wasm', wasmBinary },
  })) as unknown as Engine;
  const page = signal<PageContextValue | null>(null);
  const { kernel, view } = await viewerWith(
    plugins,
    FormHarness,
    { page, controls, probes },
    engine,
  );
  await kernel.documents.open({ kind: 'bytes', id: 'blank', bytes });
  await waitFor(() => expect(kernel.tryCapability(FormToken, undefined)).toBeTruthy(), {
    timeout: 20_000,
  });
  const form = kernel.capability(FormToken);
  await form.refresh();
  const ref = kernel.documents.getPage(0, 'blank')!.ref;
  return {
    kernel,
    view,
    form,
    host: kernel.capability(FormHostToken),
    ref,
    /** Put the layer on the page, at the mount's zoom and turn. */
    show: () => {
      page.value = makePageContext(
        'blank',
        'test-view',
        ref,
        0,
        NO_FRAME,
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
      flushSync();
    },
    close: async () => {
      view.unmount();
      await kernel.destroy();
      await engine.destroy();
    },
  };
}

beforeEach(resetFormControlRecords);

describe("<FormLayer controls>: a control of the app's own", () => {
  it(
    'draws the boxes it matches, fills the field in, and leaves the others to the layer',
    { timeout: 45_000 },
    async () => {
      const mounted = await mount({ controls: switches });
      const { form, host, ref, view } = mounted;
      try {
        await form.create({
          kind: 'text',
          name: 'name',
          widgets: [{ page: ref, rect: { x: 72, y: 100, width: 160, height: 20 } }],
        });
        await form.create({
          kind: 'checkbox',
          name: 'agree',
          widgets: [{ page: ref, rect: { x: 72, y: 140, width: 28, height: 14 } }],
        });
        mounted.show();

        const toggle = await waitFor(() => view.getByRole('switch', { name: 'agree' }));
        // The layer's own checkbox is not drawn for it; the text box is the layer's, as always.
        expect(view.queryByRole('checkbox')).toBeNull();
        expect(view.getByLabelText('name').tagName).toBe('INPUT');

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
        await fireEvent.click(toggle);
        await waitFor(() => expect(form.getValue(toFieldRef('agree'))).toEqual({ checked: true }));
        expect(write).toHaveBeenCalledWith(expect.anything(), { checked: true });
        await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
        expect(order).toEqual(['action:{"checked":true}']);
        await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
      } finally {
        await mounted.close();
      }
    },
  );

  it(
    'takes the cursor in its first tab stop, and is the focused field while the cursor is in it',
    { timeout: 45_000 },
    async () => {
      const mounted = await mount({ controls: switches });
      const { form, ref, view } = mounted;
      try {
        await form.create({
          kind: 'text',
          name: 'name',
          widgets: [{ page: ref, rect: { x: 72, y: 100, width: 160, height: 20 } }],
        });
        await form.create({
          kind: 'checkbox',
          name: 'agree',
          widgets: [{ page: ref, rect: { x: 72, y: 140, width: 28, height: 14 } }],
        });
        mounted.show();
        const toggle = await waitFor(() => view.getByRole('switch', { name: 'agree' }));
        const name = view.getByLabelText('name') as HTMLInputElement;
        const changes: (string | null)[] = [];
        form.onFocusChanged((change) => changes.push(change.field?.name ?? null));

        // `focus()` puts the cursor in the control's first tab stop.
        form.focus(toFieldRef('agree'));
        expect(document.activeElement).toBe(toggle);
        await waitFor(() => expect(form.getFocusedField()?.name).toBe('agree'));
        await waitFor(() => expect(toggle.dataset.focused).toBe('true'));

        // Shift+Tab goes the form's way, to the text box before it; Tab comes back.
        await fireEvent.keyDown(toggle, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(name);
        await waitFor(() => expect(form.getFocusedField()?.name).toBe('name'));
        await waitFor(() => expect(toggle.dataset.focused).toBe('false'));
        await fireEvent.keyDown(name, { key: 'Tab' });
        expect(document.activeElement).toBe(toggle);
        await waitFor(() => expect(form.getFocusedField()?.name).toBe('agree'));
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
      const controls: FieldControl[] = [
        { for: (widget) => widget.control === 'text', component: NativeWithButton },
        ...switches,
      ];
      const mounted = await mount({
        controls,
        plugins: [interactionPlugin(), renderPlugin(), formPlugin()],
      });
      const { form, host, kernel, ref, view } = mounted;
      try {
        await form.create({
          kind: 'text',
          name: 'name',
          widgets: [
            { page: ref, rect: { x: 72, y: 100, width: 160, height: 20 }, color: '#94a3b8' },
          ],
        });
        await form.create({
          kind: 'checkbox',
          name: 'agree',
          widgets: [{ page: ref, rect: { x: 72, y: 140, width: 14, height: 14 } }],
        });
        // The render plugin's pictures are stand-ins: a URL naming the widget and its state.
        const shown = host.listShownWidgets(ref);
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
        mounted.show();

        const [text, agree] = shown;
        const input = (await waitFor(() => view.getByLabelText('name'))) as HTMLInputElement;
        const pictures = () => [...view.container.querySelectorAll('img')];
        const urls = () => pictures().map((image) => image.getAttribute('src') ?? '');
        // A switch draws no picture of the checkbox; the text box's picture is inside `native`.
        await waitFor(() => expect(urls()).toContain(`blob:${annotationKey(text!.ref)}:null`));
        expect(urls().some((url) => url.startsWith(`blob:${annotationKey(agree!.ref)}:`))).toBe(
          false,
        );
        const picture = pictures().find((image) =>
          image.getAttribute('src')!.includes(annotationKey(text!.ref)),
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
        const button = view.getByRole('button', { name: 'Pick for name' });
        expect(button.parentElement).toBe(native.parentElement);

        // Typing in the layer's editor fills the field in, as it does without a control.
        await fireEvent.focus(input);
        await fireEvent.input(input, { target: { value: 'Ada' } });
        await fireEvent.blur(input);
        await waitFor(() => expect(form.getValue(toFieldRef('name'))).toEqual({ value: 'Ada' }));

        // The cursor goes to the editor: the button's `tabindex` keeps it out of Tab's way.
        form.focus(toFieldRef('name'));
        expect(document.activeElement).toBe(input);

        // A click on the layer's control runs the widget's action once, not once more for the box.
        const action = vi.spyOn(host, 'activateWidget');
        await fireEvent.click(input);
        expect(action).toHaveBeenCalledTimes(1);
        // A click on the app's own part runs it too: it is a click in the field.
        await fireEvent.click(button);
        await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
        await Promise.all(action.mock.results.map((result) => result.value));
      } finally {
        await mounted.close();
      }
    },
  );

  it(
    'stands down with the layer’s own controls when the tool does not fill forms',
    { timeout: 45_000 },
    async () => {
      const mounted = await mount({
        controls: switches,
        plugins: [interactionPlugin(), annotationPlugin(), formPlugin()],
      });
      const { form, kernel, ref, view } = mounted;
      try {
        await form.create({
          kind: 'checkbox',
          name: 'agree',
          widgets: [{ page: ref, rect: { x: 72, y: 140, width: 28, height: 14 } }],
        });
        mounted.show();
        await waitFor(() => view.getByRole('switch', { name: 'agree' }));
        const interaction = kernel.capability(InteractionToken);
        interaction.activateTool('form-edit');
        flushSync();
        await waitFor(() => expect(view.queryByRole('switch')).toBeNull());
        interaction.activateDefaultTool();
        flushSync();
        await waitFor(() => view.getByRole('switch', { name: 'agree' }));
      } finally {
        await mounted.close();
      }
    },
  );
});

describe('<FormLayer controls>: a turned control', () => {
  it(
    'draws in a frame the layer turns with the field and scales with the page',
    { timeout: 45_000 },
    async () => {
      const controls: FieldControl[] = [
        { for: (widget) => widget.control === 'toggle', component: FrameSwitchControl },
      ];
      // The page is turned a quarter and shown at 200%.
      const mounted = await mount({ controls, rotation: 90, scale: 2 });
      const { form, host, ref, view } = mounted;
      try {
        // Its frame is 40 by 20; turned 270° it stands 20 wide and 40 tall.
        await form.create({
          kind: 'checkbox',
          name: 'side',
          widgets: [{ page: ref, box: { x: 100, y: 300, width: 40, height: 20 }, rotation: 270 }],
        });
        await form.create({
          kind: 'checkbox',
          name: 'flat',
          widgets: [{ page: ref, rect: { x: 100, y: 100, width: 40, height: 20 } }],
        });
        mounted.show();

        const side = await waitFor(() => view.getByRole('switch', { name: 'side' }));
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
        expect(formControlRecords.frames.get('side')).toEqual({
          width: 40,
          height: 20,
          rotation: 0,
          scale: 2,
        });
        expect(formControlRecords.frames.get('flat')).toEqual({
          width: 40,
          height: 20,
          rotation: 90,
          scale: 2,
        });
        const flat = view.getByRole('switch', { name: 'flat' });
        expect((flat.parentElement!.parentElement as HTMLElement).style.transform).toBe('');

        // The turned control fills its field in, and once the value is written the widget's
        // action runs: wait for that too, or it outlives the document.
        const action = vi.spyOn(host, 'activateWidget');
        await fireEvent.click(side);
        await waitFor(() => expect(form.getValue(toFieldRef('side'))).toEqual({ checked: true }));
        await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
        await action.mock.results[0]!.value;
      } finally {
        await mounted.close();
      }
    },
  );
});

describe('<FormLayer>: Tab and a box with nothing to take the cursor', () => {
  type Mounted = Awaited<ReturnType<typeof mount>>;

  /** A text box, a signature field and a second text box, added in that order: Tab's order. */
  async function threeFields({ form, ref }: Mounted) {
    await form.create({
      kind: 'text',
      name: 'first',
      widgets: [{ page: ref, rect: { x: 72, y: 100, width: 160, height: 20 } }],
    });
    await form.create({
      kind: 'signature',
      name: 'sign',
      widgets: [{ page: ref, rect: { x: 72, y: 140, width: 160, height: 40 } }],
    });
    await form.create({
      kind: 'text',
      name: 'second',
      widgets: [{ page: ref, rect: { x: 72, y: 200, width: 160, height: 20 } }],
    });
  }

  /** Press Tab in an element; whether the layer took the press from the browser. */
  const tab = async (element: Element, shiftKey = false): Promise<boolean> =>
    !(await fireEvent.keyDown(element, { key: 'Tab', shiftKey }));

  it('passes over a signature field when nothing can sign it', { timeout: 45_000 }, async () => {
    // No signature plugin: the signature field is only its picture.
    const mounted = await mount();
    const { form, view } = mounted;
    try {
      await threeFields(mounted);
      mounted.show();
      const first = await waitFor(() => view.getByLabelText('first'));
      const second = view.getByLabelText('second');
      expect(form.listWidgets(mounted.ref).map((item) => item.control)).toEqual([
        'text',
        'signature',
        'text',
      ]);
      expect(document.querySelectorAll('input, button')).toHaveLength(2);

      expect(form.focus(toFieldRef('first'))).toBe(true);
      expect(document.activeElement).toBe(first);
      // Tab goes to the second text box, over the signature field.
      expect(await tab(first)).toBe(true);
      expect(document.activeElement).toBe(second);
      await waitFor(() => expect(form.getFocusedField()?.name).toBe('second'));
      // Past the last field the browser's Tab goes on, out of the form.
      expect(await tab(second)).toBe(false);
      expect(document.activeElement).toBe(second);
      // Shift+Tab comes back over it.
      expect(await tab(second, true)).toBe(true);
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
      const mounted = await mount({
        plugins: [interactionPlugin(), formPlugin(), signaturePlugin()],
      });
      const { form, view } = mounted;
      try {
        await threeFields(mounted);
        mounted.show();
        const first = await waitFor(() => view.getByLabelText('first'));
        const second = view.getByLabelText('second');
        const sign = view.getByRole('button', { name: 'sign' });

        expect(form.focus(toFieldRef('first'))).toBe(true);
        expect(await tab(first)).toBe(true);
        expect(document.activeElement).toBe(sign);
        await waitFor(() => expect(form.getFocusedField()?.name).toBe('sign'));
        expect(await tab(sign)).toBe(true);
        expect(document.activeElement).toBe(second);
        expect(await tab(second, true)).toBe(true);
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
      const controls: FieldControl[] = [
        { for: (widget) => widget.control === 'signature', component: SignButtonControl },
      ];
      const mounted = await mount({ controls });
      const { form, view } = mounted;
      try {
        await threeFields(mounted);
        mounted.show();
        const first = await waitFor(() => view.getByLabelText('first'));
        const sign = view.getByRole('button', { name: 'Sign sign' });

        expect(form.focus(toFieldRef('first'))).toBe(true);
        expect(await tab(first)).toBe(true);
        expect(document.activeElement).toBe(sign);
        expect(await tab(sign)).toBe(true);
        expect(document.activeElement).toBe(view.getByLabelText('second'));
      } finally {
        await mounted.close();
      }
    },
  );

  it(
    "passes over a control of the app's own that holds nothing to focus",
    { timeout: 45_000 },
    async () => {
      const controls: FieldControl[] = [
        { for: (widget) => widget.control === 'signature', component: NoteControl },
      ];
      const mounted = await mount({ controls });
      const { form, view } = mounted;
      try {
        await threeFields(mounted);
        mounted.show();
        const first = await waitFor(() => view.getByLabelText('first'));
        view.getByText('Signed on paper');

        expect(form.focus(toFieldRef('first'))).toBe(true);
        expect(await tab(first)).toBe(true);
        expect(document.activeElement).toBe(view.getByLabelText('second'));
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
      const anchors: (FormWidgetAnchor | null)[] = [];
      const target = signal<AnnotationRef | null>(null);
      const mounted = await mount({
        probes: [
          {
            read: () => useFormWidgetAnchor(() => target.value),
            pick: (anchor) => (anchor as CurrentValue<FormWidgetAnchor | null>).current,
            seen: anchors,
          },
        ],
      });
      const { form, ref, view } = mounted;
      try {
        await form.create({
          kind: 'text',
          name: 'name',
          widgets: [{ page: ref, rect: { x: 72, y: 100, width: 160, height: 20 } }],
        });
        mounted.show();
        await waitFor(() => view.getByLabelText('name'));
        // Nothing to anchor to yet.
        expect(latest(anchors)).toBeNull();

        const [box] = form.listWidgets(ref);
        target.value = box!.ref;
        flushSync();
        expect(latest(anchors)).toEqual({
          page: ref,
          bounds: { x: 72, y: 100, width: 160, height: 20 },
        });

        // A change that leaves the box where it is gives no new anchor: UI on it stays put.
        const before = anchors.length;
        await form.setValue(toFieldRef('name'), { value: 'Ada' });
        flushSync();
        expect(anchors).toHaveLength(before);

        // The anchor follows the box when the field is moved.
        await form.updateWidget(box!.ref, { rect: { x: 300, y: 400, width: 160, height: 20 } });
        flushSync();
        await waitFor(() =>
          expect(latest(anchors)?.bounds).toEqual({ x: 300, y: 400, width: 160, height: 20 }),
        );

        // A box that isn't there has no anchor.
        target.value = { ...box!.ref, objectNumber: 99_999 } as AnnotationRef;
        flushSync();
        expect(latest(anchors)).toBeNull();
      } finally {
        await mounted.close();
      }
    },
  );
});
