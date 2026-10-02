import { defineComponent, h, shallowRef } from 'vue';
import type { PropType, Ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { annotationKey } from '@embedpdf/core';
import {
  AnnotationLayer,
  useAnnotationAnchor,
  useAnnotationState,
  useRichTextEditor,
} from '../src/annotation';
import type {
  Annotation,
  AnnotationRenderer,
  AnnotationRendererProps,
  HandleProps,
} from '../src/annotation';
import { resetDevWarnings } from '../src/dev';
import { eventually, mountLayer } from './annotation-fixture';
import { probe, settle } from './counter-plugin';

/**
 * The annotation layer over a real kernel and engine: renderers get the
 * record and the frame, the `#handle` slot draws in place of the layer's
 * handles, the chrome paints through its CSS variables, an interactive
 * renderer takes the pointer, and the composables follow the annotation.
 */

const all = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));

enableAutoUnmount(afterEach);
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('AnnotationLayer', () => {
  it('renderers get the record, the frame and the hover; the #handle slot draws in place of the layer’s handles', async () => {
    const seen: AnnotationRendererProps[] = [];
    const handles: HandleProps[] = [];
    const Look = (props: AnnotationRendererProps) => {
      seen.push(props);
      return h('span', { 'data-testid': 'look' }, props.annotation.subtype);
    };
    const renderers: AnnotationRenderer[] = [
      { for: (annotation) => annotation.subtype === 'free-text', component: Look },
    ];
    const { annotation, close } = await mountLayer(() =>
      h(
        AnnotationLayer,
        { renderers },
        {
          handle: (props: HandleProps) => {
            handles.push(props);
            return h('i', { 'data-testid': 'handle' });
          },
        },
      ),
    );
    try {
      await eventually(() => expect(all('[data-testid="look"]').length).toBeGreaterThan(0));
      const last = seen[seen.length - 1]!;
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
      await eventually(() => expect(all('[data-testid="handle"]').length).toBeGreaterThan(0));
      expect(handles.some((handle) => handle.kind === 'corner')).toBe(true);
      // The layer draws no handles of its own when the slot draws them.
      expect(document.querySelectorAll('svg rect[stroke-width="1.5"]')).toHaveLength(0);
    } finally {
      await close();
    }
  }, 30_000);

  it('paints the selection outline through its CSS variable', async () => {
    const { annotation, close } = await mountLayer(() => h(AnnotationLayer));
    try {
      const square = annotation
        .list()
        .find((entry) => entry.subtype === 'square' || entry.subtype === 'circle')!;
      annotation.selection.set([square.ref]);
      // The outline is a rectangle with no fill, its paint in `style` (an SVG
      // attribute wouldn't read `var()`), and the layer's own square handles.
      await eventually(() => expect(all('svg rect[fill="none"]').length).toBeGreaterThan(0));
      expect(document.querySelectorAll('svg rect[stroke-width="1.5"]').length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  }, 30_000);

  it('an interactive renderer takes the pointer; one that only draws stays inert', async () => {
    const Widget = ({ interactive }: AnnotationRendererProps) =>
      h('button', { 'data-testid': 'widget' }, interactive ? 'live' : 'drawn');
    const Drawn = () => h('span', { 'data-testid': 'drawn' });
    const renderers: AnnotationRenderer[] = [
      {
        for: (annotation) => annotation.subtype === 'free-text',
        component: Widget,
        interactive: true,
      },
      {
        for: (annotation) => annotation.subtype === 'square' || annotation.subtype === 'circle',
        component: Drawn,
      },
    ];
    const { close } = await mountLayer(() => h(AnnotationLayer, { renderers }));
    try {
      await eventually(() => expect(all('[data-testid="widget"]').length).toBeGreaterThan(0));
      const widget = all('[data-testid="widget"]')[0]!;
      expect(widget.textContent).toBe('live');
      expect(widget.closest('[inert]')).toBeNull();
      // The frame (around the look's scaled box) takes the pointer.
      expect(widget.parentElement!.parentElement!.style.pointerEvents).toBe('auto');
      await eventually(() => expect(all('[data-testid="drawn"]').length).toBeGreaterThan(0));
      expect(all('[data-testid="drawn"]')[0]!.closest('[inert]')).not.toBeNull();
    } finally {
      await close();
    }
  }, 30_000);

  it('an interactive function follows the active tool', async () => {
    const Widget = ({ interactive }: AnnotationRendererProps) =>
      h('button', { 'data-testid': 'widget' }, interactive ? 'live' : 'drawn');
    const renderers: AnnotationRenderer[] = [
      {
        for: (annotation) => annotation.subtype === 'free-text',
        component: Widget,
        interactive: ({ toolId }) => toolId === 'pan',
      },
    ];
    const { kernel, close } = await mountLayer(() => h(AnnotationLayer, { renderers }));
    try {
      await eventually(() => expect(all('[data-testid="widget"]')[0]?.textContent).toBe('drawn'));
      const { InteractionToken } = await import('@embedpdf/plugin-interaction/contract');
      kernel.capability(InteractionToken).activateTool('pan');
      await eventually(() => expect(all('[data-testid="widget"]')[0]?.textContent).toBe('live'));
      expect(all('[data-testid="widget"]')[0]!.closest('[inert]')).toBeNull();
    } finally {
      await close();
    }
  }, 30_000);

  it('a renderer draws into a frame placed and turned like the annotation, and keeps `native`', async () => {
    const Look = ({ native }: AnnotationRendererProps) =>
      h('span', { 'data-testid': 'look' }, [h(native)]);
    const renderers: AnnotationRenderer[] = [
      {
        for: (annotation) => annotation.subtype === 'square' || annotation.subtype === 'circle',
        component: Look,
      },
    ];
    const { annotation, close } = await mountLayer(() => h(AnnotationLayer, { renderers }));
    try {
      await eventually(() => expect(all('[data-testid="look"]').length).toBeGreaterThan(0));
      // `native` is the layer's own drawing: the scene, or the engine's raster.
      await eventually(() =>
        expect(all('[data-testid="look"] svg, [data-testid="look"] img').length).toBeGreaterThan(0),
      );
      const square = annotation
        .list()
        .find((entry) => entry.subtype === 'square' || entry.subtype === 'circle')!;
      // Turn it: the frame turns with it. Where the native drawing sits inside
      // the frame is `rasterInFrame`'s, tested in `@embedpdf/web`.
      await annotation.update(square.ref, { rotation: 30 });
      await eventually(() => {
        const frame = all('[data-testid="look"]')[0]!.parentElement!.parentElement!;
        expect(frame.style.transform).toBe('rotate(30deg)');
      });
      const frame = all('[data-testid="look"]')[0]!.parentElement!.parentElement!;
      expect(parseFloat(frame.style.width)).toBeGreaterThan(0);
    } finally {
      await close();
    }
  }, 30_000);

  it('on a turned page, a note drawn your way stays upright like its icon', async () => {
    const seen: AnnotationRendererProps[] = [];
    const Note = (props: AnnotationRendererProps) => {
      seen.push(props);
      return h('span', { 'data-testid': 'note' });
    };
    const renderers: AnnotationRenderer[] = [
      { for: (annotation) => annotation.subtype === 'text', component: Note },
    ];
    const { annotation, close } = await mountLayer(() => h(AnnotationLayer, { renderers }), 90);
    try {
      const page = annotation.list()[0]!.page;
      await annotation.create(page, {
        subtype: 'text',
        rect: { x: 100, y: 100, width: 24, height: 24 },
        contents: 'Upright',
      });
      await eventually(() => expect(all('[data-testid="note"]').length).toBeGreaterThan(0));
      // The page turns the layer a quarter; the frame turns back, so the note reads upright.
      const frame = all('[data-testid="note"]')[0]!.parentElement!.parentElement!;
      expect(frame.style.transform).toBe('rotate(270deg)');
      expect(seen[seen.length - 1]!.frame.rotation).toBe(0);
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
      const seen: AnnotationRendererProps[] = [];
      const Note = (props: AnnotationRendererProps) => {
        seen.push(props);
        return h('span', { 'data-testid': 'note' });
      };
      const renderers: AnnotationRenderer[] = [
        { for: (annotation) => annotation.subtype === 'text', component: Note },
      ];
      const { annotation, close } = await mountLayer(
        () => h(AnnotationLayer, { renderers }),
        0,
        zoom,
      );
      try {
        const page = annotation.list()[0]!.page;
        await annotation.create(page, {
          subtype: 'text',
          rect: { x: 100, y: 100, width: 24, height: 24 },
          contents: 'Scaled',
        });
        await eventually(() => expect(all('[data-testid="note"]').length).toBeGreaterThan(0));
        // Drawn at its 100% size, 24 pixels here, and scaled as a whole: text and all.
        const props = seen[seen.length - 1]!;
        expect(props.frame.width).toBeCloseTo(24);
        expect(props.frame.scale).toBeCloseTo(scale);
        const scaled = all('[data-testid="note"]')[0]!.parentElement!;
        expect(scaled.style.transform).toBe(`scale(${scale})`);
        expect(parseFloat(scaled.style.width)).toBeCloseTo(24);
      } finally {
        await close();
      }
    },
    30_000,
  );

  it('useAnnotationState, useAnnotationAnchor and useRichTextEditor follow the annotation', async () => {
    const target = shallowRef<Annotation | null>(null);
    let selected: Readonly<Ref<readonly Annotation[]>> | null = null;
    let editingNow: Readonly<Ref<Annotation | null>> | null = null;
    let anchor: ReturnType<typeof useAnnotationAnchor> | null = null;
    const Probe = probe(() => {
      // State refs stay reactive when destructured.
      ({ selected, editing: editingNow } = useAnnotationState());
      // A getter, so the anchor follows the ref.
      anchor = useAnnotationAnchor(() => target.value?.ref ?? null);
    });
    const editing = new Map<string, boolean>();
    // A renderer that draws the text box itself, its element made the editor.
    const TextBoxLook = defineComponent({
      props: { annotation: { type: Object as PropType<Annotation>, required: true } },
      setup(props) {
        const editor = useRichTextEditor(() => props.annotation);
        return () => {
          const key = annotationKey(props.annotation.ref);
          editing.set(key, editor.editing.value);
          return h('div', { ref: editor.ref, 'data-testid': key, style: editor.style.value });
        };
      },
    });
    const renderers: AnnotationRenderer[] = [
      { for: (annotation) => annotation.subtype === 'free-text', component: TextBoxLook },
    ];
    const { annotation, close } = await mountLayer(() => [
      h(AnnotationLayer, { renderers }),
      h(Probe),
    ]);
    try {
      target.value = annotation.list().find((entry) => entry.subtype === 'free-text')!;
      const ref = target.value.ref;
      annotation.selection.set([ref]);
      await eventually(() => expect(selected!.value).toHaveLength(1));
      await eventually(() => expect(anchor!.value).toMatchObject({ page: target.value!.page }));

      annotation.text.begin(ref);
      await eventually(() => expect(editingNow!.value?.ref).toEqual(ref));
      const key = annotationKey(ref);
      await eventually(() => expect(editing.get(key)).toBe(true));
      const element = document.querySelector<HTMLElement>(`[data-testid="${key}"]`)!;
      // The renderer's element is the editor; the layer draws no text box of its own for it.
      expect(element.getAttribute('contenteditable')).toBe('true');
      expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(1);
      // It can take the keys and the pointer: nothing above it is inert while typing.
      expect(element.closest('[inert]')).toBeNull();
      expect(element.style.pointerEvents).toBe('auto');

      await annotation.text.end();
      await eventually(() => expect(editing.get(key)).toBe(false));
      expect(
        document.querySelector<HTMLElement>(`[data-testid="${key}"]`)!.closest('[inert]'),
      ).not.toBeNull();
    } finally {
      await close();
    }
  }, 30_000);

  it('warns once when the renderers are a new array with the same entries', async () => {
    resetDevWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entry: AnnotationRenderer = {
      for: (annotation) => annotation.subtype === 'text',
      component: () => h('span'),
    };
    const list = shallowRef<AnnotationRenderer[]>([entry]);
    const { close } = await mountLayer(() => h(AnnotationLayer, { renderers: list.value }));
    try {
      list.value = [entry];
      await settle();
      expect(warn.mock.calls.some((call) => String(call[0]).includes(':renderers'))).toBe(true);
    } finally {
      await close();
    }
  }, 30_000);
});
