// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { pageTransform } from '@embedpdf/core-geometry';
import { annotationKey, type Kernel } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import type { AnnotationRef } from '@embedpdf/plugin-annotation/contract';
import { formPlugin, FormToken, toFieldRef } from '@embedpdf/plugin-form';
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { interactionPlugin, InteractionToken } from '@embedpdf/plugin-interaction';
import { renderPlugin } from '@embedpdf/plugin-render';
import { RenderToken as RenderHostToken } from '@embedpdf/plugin-render/contract/host';
import { signaturePlugin } from '@embedpdf/plugin-signature';

import {
  FormLayer,
  useFormWidgetAnchor,
  type FieldControl,
  type FieldControlFrame,
  type FieldControlProps,
  type FormWidgetAnchor,
} from '../src/form';
import { makePageContext, PageProvider, useKernel, Viewer } from '../src/runtime';
import type { PageContextValue } from '../src/runtime';

/** What `<Viewer plugins>` takes. */
type ViewerPlugins = React.ComponentProps<typeof Viewer>['plugins'];

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

/**
 * `<FormLayer controls>` and `useFormWidgetAnchor()` over a real kernel and
 * engine: a blank page with fields made from code, and the layer on it.
 */
async function mount(
  layer: () => React.ReactNode,
  {
    plugins = [interactionPlugin(), formPlugin()],
    rotation = 0,
    scale = 1,
  }: { plugins?: ViewerPlugins; rotation?: 0 | 90; scale?: number } = {},
) {
  const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
  // happy-dom's browser-shaped globals would steer the wasm toward fetch(); hand it over.
  const wasmBinary = new Uint8Array(await readFile(wasm));
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });

  let kernel: Kernel | null = null;
  let setPage!: (page: PageContextValue) => void;
  function Grab() {
    const current = useKernel();
    useEffect(() => {
      kernel = current;
    }, [current]);
    return null;
  }
  function Page() {
    const [page, set] = useState<PageContextValue | null>(null);
    setPage = set;
    return page ? <PageProvider value={page}>{layer()}</PageProvider> : null;
  }
  const view = render(
    <Viewer
      engine={engine}
      plugins={plugins}
      initialDocuments={[{ source: { kind: 'bytes', id: 'blank', bytes } }]}
    >
      <Grab />
      <Page />
    </Viewer>,
  );
  await waitFor(() => expect(kernel?.tryCapability(FormToken, undefined)).toBeTruthy(), {
    timeout: 20_000,
  });
  const form = kernel!.capability(FormToken);
  await form.refresh();
  const page = kernel!.documents.getPage(0, 'blank')!.ref;
  return {
    view,
    kernel: kernel!,
    form,
    host: kernel!.capability(FormHostToken),
    page,
    /** Put the layer on the page, at the mount's zoom and turn. */
    show: () =>
      act(() =>
        setPage(
          makePageContext(
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
          ),
        ),
      ),
    close: async () => {
      view.unmount();
      await engine.destroy();
    },
  };
}

/** A checkbox drawn as a switch: it fills its frame and writes through `setValue`. */
function Switch({ widget, setValue, focused }: FieldControlProps) {
  if (widget.control !== 'toggle') return null;
  return (
    <button
      role="switch"
      aria-checked={widget.checked}
      aria-label={widget.label}
      data-focused={focused}
      disabled={widget.disabled}
      onClick={() => void setValue({ checked: !widget.checked })}
      style={{ width: '100%', height: '100%' }}
    />
  );
}

const switches: FieldControl[] = [
  { for: (widget) => widget.control === 'toggle' && widget.kind === 'checkbox', component: Switch },
];

describe("<FormLayer controls>: a control of the app's own", () => {
  afterEach(cleanup);

  it(
    'draws the boxes it matches, fills the field in, and leaves the others to the layer',
    { timeout: 45_000 },
    async () => {
      const mounted = await mount(() => <FormLayer controls={switches} />);
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
        mounted.show();

        const toggle = await waitFor(() => screen.getByRole('switch', { name: 'agree' }));
        // The layer's own checkbox is not drawn for it; the text box is the layer's, as always.
        expect(screen.queryByRole('checkbox')).toBeNull();
        expect(screen.getByLabelText('name').tagName).toBe('INPUT');

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
        fireEvent.click(toggle);
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
      const mounted = await mount(() => <FormLayer controls={switches} />);
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
        mounted.show();
        const toggle = await waitFor(() => screen.getByRole('switch', { name: 'agree' }));
        const name = screen.getByLabelText('name') as HTMLInputElement;
        const changes: (string | null)[] = [];
        form.onFocusChanged((change) => changes.push(change.field?.name ?? null));

        // `focus()` puts the cursor in the control's first tab stop.
        act(() => void form.focus(toFieldRef('agree')));
        expect(document.activeElement).toBe(toggle);
        await waitFor(() => expect(form.getFocusedField()?.name).toBe('agree'));
        await waitFor(() => expect(toggle.dataset.focused).toBe('true'));

        // Shift+Tab goes the form's way, to the text box before it; Tab comes back.
        fireEvent.keyDown(toggle, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(name);
        await waitFor(() => expect(form.getFocusedField()?.name).toBe('name'));
        await waitFor(() => expect(toggle.dataset.focused).toBe('false'));
        fireEvent.keyDown(name, { key: 'Tab' });
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
      /** A text box with a button after it. */
      function WithButton({ widget, native }: FieldControlProps) {
        return (
          <>
            {native}
            <button aria-label={`Pick for ${widget.label}`} tabIndex={-1} />
          </>
        );
      }
      const controls: FieldControl[] = [
        { for: (widget) => widget.control === 'text', component: WithButton },
        ...switches,
      ];
      const mounted = await mount(() => <FormLayer controls={controls} />, {
        plugins: [interactionPlugin(), renderPlugin(), formPlugin()],
      });
      const { form, host, kernel, page, view } = mounted;
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
        await form.create({
          kind: 'checkbox',
          name: 'plain',
          widgets: [{ page, rect: { x: 72, y: 180, width: 14, height: 14 } }],
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
        mounted.show();

        const [text, agree] = shown;
        const input = (await waitFor(() => screen.getByLabelText('name'))) as HTMLInputElement;
        const pictures = () => [...view.container.querySelectorAll('img')];
        await waitFor(() => expect(pictures().length).toBeGreaterThan(0));
        // A switch draws no picture of the checkbox; the text box's picture is inside `native`.
        const urls = () => pictures().map((image) => image.src);
        await waitFor(() => expect(urls()).toContain(`blob:${annotationKey(text!.ref)}:null`));
        expect(urls().some((url) => url.startsWith(`blob:${annotationKey(agree!.ref)}:`))).toBe(
          false,
        );
        const picture = pictures().find((image) => image.src.includes(annotationKey(text!.ref)))!;
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
        const button = screen.getByRole('button', { name: 'Pick for name' });
        expect(button.parentElement).toBe(native.parentElement);

        // Typing in the layer's editor fills the field in, as it does without a control.
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'Ada' } });
        fireEvent.blur(input);
        await waitFor(() => expect(form.getValue(toFieldRef('name'))).toEqual({ value: 'Ada' }));

        // The cursor goes to the editor: the button's `tabIndex` keeps it out of Tab's way.
        act(() => void form.focus(toFieldRef('name')));
        expect(document.activeElement).toBe(input);

        // A click on the layer's control runs the widget's action once, not once more for the box.
        const action = vi.spyOn(host, 'activateWidget');
        fireEvent.click(input);
        expect(action).toHaveBeenCalledTimes(1);
        // A click on the app's own part runs it too: it is a click in the field.
        fireEvent.click(button);
        await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
      } finally {
        await mounted.close();
      }
    },
  );

  it(
    'stands down with the layer’s own controls when the tool does not fill forms',
    { timeout: 45_000 },
    async () => {
      const mounted = await mount(() => <FormLayer controls={switches} />, {
        plugins: [interactionPlugin(), annotationPlugin(), formPlugin()],
      });
      const { form, kernel, page } = mounted;
      try {
        await form.create({
          kind: 'checkbox',
          name: 'agree',
          widgets: [{ page, rect: { x: 72, y: 140, width: 28, height: 14 } }],
        });
        mounted.show();
        await waitFor(() => screen.getByRole('switch', { name: 'agree' }));
        const interaction = kernel.capability(InteractionToken);
        act(() => interaction.activateTool('form-edit'));
        await waitFor(() => expect(screen.queryByRole('switch')).toBeNull());
        act(() => interaction.activateDefaultTool());
        await waitFor(() => screen.getByRole('switch', { name: 'agree' }));
      } finally {
        await mounted.close();
      }
    },
  );
});

describe('<FormLayer controls>: a turned control', () => {
  afterEach(cleanup);

  it(
    'draws in a frame the layer turns with the field and scales with the page',
    { timeout: 45_000 },
    async () => {
      const frames = new Map<string, FieldControlFrame>();
      function Probe({ widget, frame, setValue }: FieldControlProps) {
        frames.set(widget.label, frame);
        return (
          <Switch widget={widget} frame={frame} native={null} setValue={setValue} focused={false} />
        );
      }
      const controls: FieldControl[] = [
        { for: (widget) => widget.control === 'toggle', component: Probe },
      ];
      // The page is turned a quarter and shown at 200%.
      const mounted = await mount(() => <FormLayer controls={controls} />, {
        rotation: 90,
        scale: 2,
      });
      const { form, host, page } = mounted;
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
        mounted.show();

        const side = await waitFor(() => screen.getByRole('switch', { name: 'side' }));
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
        const flat = screen.getByRole('switch', { name: 'flat' });
        expect((flat.parentElement!.parentElement as HTMLElement).style.transform).toBe('');

        // The turned control fills its field in, and the field's action runs after the value.
        // Waiting for it keeps the action from running on a document that has closed.
        const action = vi.spyOn(host, 'activateWidget');
        fireEvent.click(side);
        await waitFor(() => expect(form.getValue(toFieldRef('side'))).toEqual({ checked: true }));
        await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      } finally {
        await mounted.close();
      }
    },
  );
});

describe('<FormLayer>: Tab and a box with nothing to take the cursor', () => {
  afterEach(cleanup);

  type Mounted = Awaited<ReturnType<typeof mount>>;

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
  const tab = (element: Element, shiftKey = false): boolean =>
    !fireEvent.keyDown(element, { key: 'Tab', shiftKey });

  it('passes over a signature field when nothing can sign it', { timeout: 45_000 }, async () => {
    // No signature plugin: the signature field is only its picture.
    const mounted = await mount(() => <FormLayer />);
    const { form } = mounted;
    try {
      await threeFields(mounted);
      mounted.show();
      const first = await waitFor(() => screen.getByLabelText('first'));
      const second = screen.getByLabelText('second');
      expect(form.listWidgets(mounted.page).map((item) => item.control)).toEqual([
        'text',
        'signature',
        'text',
      ]);
      expect(document.querySelectorAll('input, button')).toHaveLength(2);

      act(() => void form.focus(toFieldRef('first')));
      expect(document.activeElement).toBe(first);
      // Tab goes to the second text box, over the signature field.
      expect(tab(first)).toBe(true);
      expect(document.activeElement).toBe(second);
      await waitFor(() => expect(form.getFocusedField()?.name).toBe('second'));
      // Past the last field the browser's Tab goes on, out of the form.
      expect(tab(second)).toBe(false);
      expect(document.activeElement).toBe(second);
      // Shift+Tab comes back over it.
      expect(tab(second, true)).toBe(true);
      expect(document.activeElement).toBe(first);

      // Your code's moves pass over it too.
      expect(form.focus(toFieldRef('sign'))).toBe(false);
      expect(document.activeElement).toBe(first);
      act(() => void form.focusNext());
      expect(document.activeElement).toBe(second);
    } finally {
      await mounted.close();
    }
  });

  it(
    'stops at a signature field with the signature plugin, whose "sign here" takes the cursor',
    { timeout: 45_000 },
    async () => {
      const mounted = await mount(() => <FormLayer />, {
        plugins: [interactionPlugin(), formPlugin(), signaturePlugin()],
      });
      const { form } = mounted;
      try {
        await threeFields(mounted);
        mounted.show();
        const first = await waitFor(() => screen.getByLabelText('first'));
        const second = screen.getByLabelText('second');
        const sign = screen.getByRole('button', { name: 'sign' });

        act(() => void form.focus(toFieldRef('first')));
        expect(tab(first)).toBe(true);
        expect(document.activeElement).toBe(sign);
        await waitFor(() => expect(form.getFocusedField()?.name).toBe('sign'));
        expect(tab(sign)).toBe(true);
        expect(document.activeElement).toBe(second);
        expect(tab(second, true)).toBe(true);
        expect(document.activeElement).toBe(sign);
        let took = false;
        act(() => {
          took = form.focus(toFieldRef('sign'));
        });
        expect(took).toBe(true);
      } finally {
        await mounted.close();
      }
    },
  );

  it(
    "stops at a signature field a control of the app's own draws with something to focus",
    { timeout: 45_000 },
    async () => {
      function SignButton({ widget }: FieldControlProps) {
        return <button aria-label={`Sign ${widget.label}`} style={{ width: '100%' }} />;
      }
      const controls: FieldControl[] = [
        { for: (widget) => widget.control === 'signature', component: SignButton },
      ];
      const mounted = await mount(() => <FormLayer controls={controls} />);
      const { form } = mounted;
      try {
        await threeFields(mounted);
        mounted.show();
        const first = await waitFor(() => screen.getByLabelText('first'));
        const sign = screen.getByRole('button', { name: 'Sign sign' });

        act(() => void form.focus(toFieldRef('first')));
        expect(tab(first)).toBe(true);
        expect(document.activeElement).toBe(sign);
        expect(tab(sign)).toBe(true);
        expect(document.activeElement).toBe(screen.getByLabelText('second'));
      } finally {
        await mounted.close();
      }
    },
  );

  it(
    "passes over a control of the app's own that holds nothing to focus",
    { timeout: 45_000 },
    async () => {
      function Note() {
        return <span>Signed on paper</span>;
      }
      const controls: FieldControl[] = [
        { for: (widget) => widget.control === 'signature', component: Note },
      ];
      const mounted = await mount(() => <FormLayer controls={controls} />);
      const { form } = mounted;
      try {
        await threeFields(mounted);
        mounted.show();
        const first = await waitFor(() => screen.getByLabelText('first'));
        screen.getByText('Signed on paper');

        act(() => void form.focus(toFieldRef('first')));
        expect(tab(first)).toBe(true);
        expect(document.activeElement).toBe(screen.getByLabelText('second'));
        expect(form.focus(toFieldRef('sign'))).toBe(false);
      } finally {
        await mounted.close();
      }
    },
  );
});

describe('useFormWidgetAnchor()', () => {
  afterEach(cleanup);

  it(
    'gives the anchor of one box, follows the box, and is null without one',
    { timeout: 45_000 },
    async () => {
      const anchors: (FormWidgetAnchor | null)[] = [];
      let target: AnnotationRef | null = null;
      let again!: () => void;
      function Tag() {
        const [, render] = useState(0);
        again = () => render((count) => count + 1);
        anchors.push(useFormWidgetAnchor(target));
        return null;
      }
      const mounted = await mount(() => (
        <>
          <FormLayer />
          <Tag />
        </>
      ));
      const { form, page } = mounted;
      try {
        await form.create({
          kind: 'text',
          name: 'name',
          widgets: [{ page, rect: { x: 72, y: 100, width: 160, height: 20 } }],
        });
        mounted.show();
        await waitFor(() => screen.getByLabelText('name'));
        // Nothing to anchor to yet.
        expect(anchors.at(-1)).toBeNull();

        const [box] = form.listWidgets(page);
        target = box!.ref;
        act(() => again());
        expect(anchors.at(-1)).toEqual({
          page,
          bounds: { x: 72, y: 100, width: 160, height: 20 },
        });

        // A render that changes nothing gives the same anchor: UI on it stays put.
        const before = anchors.at(-1);
        act(() => again());
        expect(anchors.at(-1)).toBe(before);

        // The anchor follows the box when the field is moved.
        await act(async () => {
          await form.updateWidget(box!.ref, { rect: { x: 300, y: 400, width: 160, height: 20 } });
        });
        await waitFor(() =>
          expect(anchors.at(-1)?.bounds).toEqual({ x: 300, y: 400, width: 160, height: 20 }),
        );

        // A box that isn't there has no anchor.
        target = { ...box!.ref, objectNumber: 99_999 } as AnnotationRef;
        act(() => again());
        expect(anchors.at(-1)).toBeNull();
      } finally {
        await mounted.close();
      }
    },
  );
});
