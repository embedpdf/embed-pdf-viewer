import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushSync } from 'svelte';
import { fireEvent, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { annotationKey } from '@embedpdf/core';
import { pageTransform } from '@embedpdf/core-geometry';
import { createLocalEngine } from '@embedpdf/engine';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { interactionPlugin } from '../../src/interaction';
import {
  annotationPlugin,
  type AnnotationRef,
  type AnnotationRenderer,
} from '../../src/annotation';
import { makePageContext, type PageContextValue } from '../../src/runtime';
import AnnotationLayerHarness from '../fixtures/AnnotationLayerHarness.svelte';
import DrawnLook from '../fixtures/DrawnLook.svelte';
import EditorLook from '../fixtures/EditorLook.svelte';
import LiveWidget from '../fixtures/LiveWidget.svelte';
import NativeLook from '../fixtures/NativeLook.svelte';
import RecordingLook from '../fixtures/RecordingLook.svelte';
import { annotationRecords, resetAnnotationRecords } from '../fixtures/annotation-records';
import { signal } from '../fixtures/signal.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * The annotation layer over a real kernel and engine: renderers get the record, the frame and the
 * layer's own drawing; your `handle` snippet draws in place of the layer's handles; the chrome
 * paints through its CSS variables; an interactive renderer takes the pointer and one that only
 * draws stays inert; the readers follow the annotation; and typing in a text box shows at once
 * and writes once.
 */

const here = dirname(fileURLToPath(import.meta.url));
const packages = resolve(here, '..', '..', '..', '..');
const fixturePath = resolve(
  packages,
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'annotations.pdf',
);
const wasmPath = resolve(packages, 'engine', 'runtime', 'npm', 'wasm32', 'lib', 'embedpdf.wasm');

const PAGE_SIZE = { width: 612, height: 792 };
const NO_FRAME = { top: 0, right: 0, bottom: 0, left: 0 };

interface MountOptions {
  renderers?: AnnotationRenderer[];
  customHandles?: boolean;
  probe?: boolean;
  rotation?: 0 | 90;
  zoom?: number;
}

async function mount(options: MountOptions = {}) {
  const { rotation = 0, zoom = 1, ...layer } = options;
  const bytes = new Uint8Array(await readFile(fixturePath));
  // happy-dom's browser-shaped globals would steer the default wasm resolution toward fetch():
  // hand the binary over directly instead.
  const wasmBinary = new Uint8Array(await readFile(wasmPath));
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });
  const page = signal<PageContextValue | null>(null);
  const { kernel, view } = await viewerWith(
    [interactionPlugin(), annotationPlugin()],
    AnnotationLayerHarness,
    { page, ...layer },
    engine,
  );
  await kernel.documents.open({ kind: 'bytes', id: 'notes', bytes });
  await waitFor(() => expect(kernel.tryCapability(AnnotationHostToken, undefined)).not.toBeNull(), {
    timeout: 20_000,
  });
  const annotation = kernel.capability(AnnotationHostToken);
  await annotation.whenSynced();
  const first = annotation.list()[0]!;
  // `zoom` against a 100% of 1 pixel per point.
  const transform = pageTransform({
    pageSize: PAGE_SIZE,
    rotation,
    scale: zoom,
    baseScale: 1,
    dpr: 1,
  });
  page.value = makePageContext(
    'notes',
    'test-view',
    first.page,
    0,
    NO_FRAME,
    transform,
    () => new DOMRect(0, 0, PAGE_SIZE.width, PAGE_SIZE.height),
  );
  flushSync();
  const close = async () => {
    view.unmount();
    await engine.destroy();
  };
  return { annotation, view, close };
}

beforeEach(resetAnnotationRecords);

describe('the annotation layer', () => {
  it('renderers get the record, the frame and the hover; your handles draw in place of the layer’s', async () => {
    const renderers: AnnotationRenderer[] = [
      { for: (annotation) => annotation.subtype === 'free-text', component: RecordingLook },
    ];
    const { annotation, view, close } = await mount({ renderers, customHandles: true });
    try {
      await waitFor(() => expect(view.getAllByTestId('look').length).toBeGreaterThan(0));
      const last = latest(annotationRecords.looks);
      expect(last.annotation.subtype).toBe('free-text');
      expect(last.frame.width).toBeGreaterThan(0);
      expect(last.hovered).toBe(false);
      expect(last.selected).toBe(false);
      expect(last.interactive).toBe(false);

      const square = annotation
        .list()
        .find((entry) => entry.subtype === 'square' || entry.subtype === 'circle');
      expect(square).toBeDefined();
      annotation.selection.set([square!.ref]);
      flushSync();
      await waitFor(() => expect(view.getAllByTestId('handle').length).toBeGreaterThan(0));
      expect(annotationRecords.handles.some((handle) => handle.kind === 'corner')).toBe(true);
      // The outline is painted through its variable, then the accent's.
      const painted = [...view.container.querySelectorAll('[style]')].map(
        (element) => element.getAttribute('style') ?? '',
      );
      expect(painted.some((style) => style.includes('--epdf-annotation-outline'))).toBe(true);

      // The vector scenes are SVG elements, in the SVG namespace (they draw nothing otherwise).
      const shapes = [...view.container.querySelectorAll('svg[viewBox] > *')];
      expect(shapes.length).toBeGreaterThan(0);
      expect(shapes.every((shape) => shape.namespaceURI === 'http://www.w3.org/2000/svg')).toBe(
        true,
      );
    } finally {
      await close();
    }
  }, 30_000);

  it('an interactive renderer takes the pointer; one that only draws stays inert', async () => {
    const renderers: AnnotationRenderer[] = [
      {
        for: (annotation) => annotation.subtype === 'free-text',
        component: LiveWidget,
        interactive: true,
      },
      {
        for: (annotation) => annotation.subtype === 'square' || annotation.subtype === 'circle',
        component: DrawnLook,
      },
    ];
    const { view, close } = await mount({ renderers });
    try {
      await waitFor(() => expect(view.getAllByTestId('widget').length).toBeGreaterThan(0));
      await waitFor(() => expect(view.getAllByTestId('widget')[0]!.textContent).toBe('live'));
      const widget = view.getAllByTestId('widget')[0]!;
      expect(widget.closest('[inert]')).toBeNull();
      // The frame (around the look's scaled box) takes the pointer.
      expect(widget.parentElement!.parentElement!.style.pointerEvents).toBe('auto');
      await waitFor(() => expect(view.getAllByTestId('drawn').length).toBeGreaterThan(0));
      expect(view.getAllByTestId('drawn')[0]!.closest('[inert]')).not.toBeNull();
    } finally {
      await close();
    }
  }, 30_000);

  it('a renderer draws into a frame placed and turned like the annotation, around the layer’s own drawing', async () => {
    const renderers: AnnotationRenderer[] = [
      {
        for: (annotation) => annotation.subtype === 'square' || annotation.subtype === 'circle',
        component: NativeLook,
      },
    ];
    const { annotation, view, close } = await mount({ renderers });
    try {
      await waitFor(() => expect(view.getAllByTestId('look').length).toBeGreaterThan(0));
      // `native` draws the layer's own drawing (its scene, or the engine's picture) inside.
      await waitFor(() =>
        expect(view.getAllByTestId('look')[0]!.querySelector('svg, img')).not.toBeNull(),
      );
      const square = annotation
        .list()
        .find((entry) => entry.subtype === 'square' || entry.subtype === 'circle')!;
      // Turn it: the frame turns with it. Where the native drawing sits inside the frame is
      // `rasterInFrame`'s, tested in `@embedpdf/web`.
      await annotation.update(square.ref, { rotation: 30 });
      flushSync();
      await waitFor(() => {
        const frame = view.getAllByTestId('look')[0]!.parentElement!.parentElement!;
        expect(frame.style.transform).toBe('rotate(30deg)');
      });
      const frame = view.getAllByTestId('look')[0]!.parentElement!.parentElement!;
      expect(parseFloat(frame.style.width)).toBeGreaterThan(0);
    } finally {
      await close();
    }
  }, 30_000);

  it('on a turned page, a note drawn your way stays upright like its icon', async () => {
    const renderers: AnnotationRenderer[] = [
      { for: (annotation) => annotation.subtype === 'text', component: RecordingLook },
    ];
    const { annotation, view, close } = await mount({ renderers, rotation: 90 });
    try {
      const page = annotation.list()[0]!.page;
      await annotation.create(page, {
        subtype: 'text',
        rect: { x: 100, y: 100, width: 24, height: 24 },
        contents: 'Upright',
      });
      flushSync();
      await waitFor(() => expect(view.getAllByTestId('look').length).toBeGreaterThan(0));
      // The page turns the layer a quarter; the frame turns back, so the note reads upright.
      const frame = view.getAllByTestId('look')[0]!.parentElement!.parentElement!;
      expect(frame.style.transform).toBe('rotate(270deg)');
      expect(latest(annotationRecords.looks).frame.rotation).toBe(0);
    } finally {
      await close();
    }
  }, 30_000);

  it.each([
    [0.5, 0.5],
    [2, 1],
  ])(
    'at %s zoom a note drawn your way is drawn at its own size and scaled by %s',
    async (zoom, scale) => {
      const renderers: AnnotationRenderer[] = [
        { for: (annotation) => annotation.subtype === 'text', component: RecordingLook },
      ];
      const { annotation, view, close } = await mount({ renderers, zoom });
      try {
        const page = annotation.list()[0]!.page;
        await annotation.create(page, {
          subtype: 'text',
          rect: { x: 100, y: 100, width: 24, height: 24 },
          contents: 'Scaled',
        });
        flushSync();
        await waitFor(() => expect(view.getAllByTestId('look').length).toBeGreaterThan(0));
        // Drawn at its 100% size, 24 pixels here, and scaled as a whole: text and all.
        const props = latest(annotationRecords.looks);
        expect(props.frame.width).toBeCloseTo(24);
        expect(props.frame.scale).toBeCloseTo(scale);
        const scaled = view.getAllByTestId('look')[0]!.parentElement!;
        expect(scaled.style.transform).toBe(`scale(${scale})`);
        expect(parseFloat(scaled.style.width)).toBeCloseTo(24);
      } finally {
        await close();
      }
    },
    30_000,
  );

  it('useAnnotationState, useAnnotationAnchor and useRichTextEditor follow the annotation', async () => {
    const renderers: AnnotationRenderer[] = [
      { for: (annotation) => annotation.subtype === 'free-text', component: EditorLook },
    ];
    const { annotation, view, close } = await mount({ renderers, probe: true });
    try {
      const target = annotation.list().find((entry) => entry.subtype === 'free-text')!;
      annotationRecords.target.value = target.ref;
      annotation.selection.set([target.ref]);
      flushSync();
      await waitFor(() => expect(latest(annotationRecords.states).selected).toHaveLength(1));
      await waitFor(() =>
        expect(latest(annotationRecords.anchors)).toMatchObject({ page: target.page }),
      );

      annotation.text.begin(target.ref);
      flushSync();
      await waitFor(() =>
        expect(latest(annotationRecords.states).editing?.ref).toEqual(target.ref),
      );
      const key = annotationKey(target.ref);
      await waitFor(() => expect(annotationRecords.editing.get(key)).toBe(true));
      const element = view.getByTestId(key);
      // The renderer's element is the editor; the layer draws no text box of its own for it.
      expect(element.getAttribute('contenteditable')).toBe('true');
      expect(view.container.querySelectorAll('[contenteditable="true"]')).toHaveLength(1);
      // It can take the keys and the pointer: nothing above it is inert while typing.
      expect(element.closest('[inert]')).toBeNull();
      expect(element.style.pointerEvents).toBe('auto');
      // The editor's own line height outlives the style the renderer puts on the element.
      expect(element.style.lineHeight).not.toBe('');

      await annotation.text.end();
      flushSync();
      await waitFor(() => expect(annotationRecords.editing.get(key)).toBe(false));
      expect(element.closest('[inert]')).not.toBeNull();
      expect(element.style.lineHeight).not.toBe('');
    } finally {
      await close();
    }
  }, 30_000);
});

/**
 * Typing into a free text box through the DOM: the binding decides how often the engine is
 * written. It must show every keystroke at once and write once, after a pause in typing or when
 * the edit ends.
 */
describe('free text typing through the layer’s own text box', () => {
  async function openEditor() {
    const mounted = await mount();
    const { annotation, view } = mounted;
    const freeText = annotation.list().find((entry) => entry.subtype === 'free-text')!;
    const writes: AnnotationRef[] = [];
    annotation.onUpdated((event) => writes.push(event.annotation.ref));
    annotation.text.begin(freeText.ref);
    flushSync();
    const editor = await waitFor(() => {
      const element = view.container.querySelector<HTMLElement>('[contenteditable="true"]');
      expect(element).not.toBeNull();
      return element!;
    });

    /** Replace the editor's first line with `text`, the way the browser reports typing. */
    const type = (text: string) => {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      const first = walker.nextNode();
      if (first) first.nodeValue = text;
      else editor.textContent = text;
      void fireEvent.input(editor);
    };
    return { ...mounted, ref: freeText.ref, editor, writes, type };
  }

  afterEach(() => {
    resetAnnotationRecords();
  });

  it(
    'shows each keystroke at once and writes once after a pause',
    { timeout: 45_000 },
    async () => {
      const { annotation, ref, editor, writes, type, close } = await openEditor();
      try {
        // The box takes the pointer and the keys while it's typed in, and keeps its line height.
        expect(editor.style.pointerEvents).toBe('auto');
        expect(editor.style.lineHeight).not.toBe('');
        type('Typed');
        type('Typed text');
        expect(annotation.get(ref)!.contents).toContain('Typed text');
        expect(writes).toHaveLength(0);

        await waitFor(() => expect(writes).toHaveLength(1), { timeout: 5_000 });
        expect(annotation.get(ref)!.contents).toContain('Typed text');
        // The write settles right after its event (React's `act` waits for that by itself).
        await waitFor(() => expect(annotation.isPending(ref)).toBe(false));
        expect(writes).toHaveLength(1);
      } finally {
        await close();
      }
    },
  );

  it('ending the edit writes what was typed at once', { timeout: 45_000 }, async () => {
    const { annotation, ref, writes, type, close } = await openEditor();
    try {
      type('Finished');
      await annotation.text.end();

      expect(writes).toHaveLength(1);
      expect(annotation.get(ref)!.contents).toContain('Finished');
    } finally {
      await close();
    }
  });
});
