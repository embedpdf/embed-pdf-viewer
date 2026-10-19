import { h, shallowRef } from 'vue';
import type { Ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import type { ViewProjector } from '@embedpdf/web';
import { AnchoredScope } from '../src/anchored';
import {
  AnnotationMenu,
  useAnnotation,
  useAnnotationDefaults,
  useAnnotationList,
  useCommentThreads,
  useComments,
  useFilePickerProvider,
} from '../src/annotation';
import type {
  Annotation,
  AnnotationCapability,
  CommentThreadView,
  CommentsApi,
  FilePickerProvider,
  ToolDefaults,
} from '../src/annotation';
import { resetDevWarnings } from '../src/dev';
import { usePage } from '../src/runtime';
import { eventually, mountLayer } from './annotation-fixture';
import { probe, settle } from './counter-plugin';

/**
 * The annotation composables over a real document: the reads are refs that
 * follow the plugin, the API objects reach the document in scope, the file
 * picker is installed while a component lives, and the selection menu shows
 * while something is selected.
 */

enableAutoUnmount(afterEach);
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('the annotation composables', () => {
  it('useAnnotationList and useAnnotationDefaults are refs that follow the plugin', async () => {
    const subtype = shallowRef<'square' | 'text'>('square');
    let list: Readonly<Ref<readonly Annotation[]>> | null = null;
    let defaults: Readonly<Ref<ToolDefaults>> | null = null;
    const Probe = probe(() => {
      // A getter follows a filter that changes.
      list = useAnnotationList(() => ({ subtype: subtype.value }));
      defaults = useAnnotationDefaults('ink');
    });
    const { annotation, close } = await mountLayer(() => h(Probe));
    try {
      const squares = annotation.list({ subtype: 'square' }).length;
      expect(list!.value).toHaveLength(squares);
      const before = list!.value;
      // An unrelated change keeps the same array.
      annotation.tools.updateDefaults('ink', { color: '#123456' });
      await settle();
      expect(list!.value).toBe(before);
      expect(defaults!.value.color).toBe('#123456');

      subtype.value = 'text';
      await settle();
      const page = annotation.list()[0]!.page;
      const notes = annotation.list({ subtype: 'text' }).length;
      expect(list!.value).toHaveLength(notes);
      await annotation.create(page, {
        subtype: 'text',
        rect: { x: 10, y: 10, width: 24, height: 24 },
        contents: 'One more',
      });
      await eventually(() => expect(list!.value).toHaveLength(notes + 1));
    } finally {
      await close();
    }
  }, 30_000);

  it('useComments and useAnnotation reach the document; useCommentThreads labels each page', async () => {
    let comments: CommentsApi | null = null;
    let api: AnnotationCapability | null = null;
    let threads: Readonly<Ref<readonly CommentThreadView[]>> | null = null;
    const Probe = probe(() => {
      comments = useComments();
      api = useAnnotation();
      threads = useCommentThreads();
    });
    const { annotation, close } = await mountLayer(() => h(Probe));
    try {
      expect(comments!.listThreads()).toEqual(annotation.comments.listThreads());
      expect(api!.list()).toEqual(annotation.list());
      const page = annotation.list()[0]!.page;
      const before = threads!.value.length;
      await annotation.create(page, {
        subtype: 'text',
        rect: { x: 40, y: 40, width: 24, height: 24 },
        contents: 'A comment',
      });
      await eventually(() => expect(threads!.value).toHaveLength(before + 1));
      expect(threads!.value.every((thread) => thread.pageLabel === '1')).toBe(true);
    } finally {
      await close();
    }
  }, 30_000);

  it('useFilePickerProvider installs while the component lives, and warns about a second', async () => {
    resetDevWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const shown = shallowRef(true);
    const provider: FilePickerProvider = vi.fn(async () => null);
    const Picker = probe(() => {
      useFilePickerProvider(provider);
    });
    const { annotation, close } = await mountLayer(() =>
      shown.value ? [h(Picker), h(Picker)] : null,
    );
    try {
      await settle();
      expect(warn.mock.calls.some((call) => String(call[0]).includes('useFilePickerProvider'))).toBe(
        true,
      );
      const set = vi.spyOn(annotation, 'setFilePickerProvider');
      shown.value = false;
      await settle();
      // Unmounted: nothing installs again, and what was installed was removed.
      expect(set).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  }, 30_000);

  it('<AnnotationMenu> shows its content while something is selected', async () => {
    const projector: ViewProjector = {
      space: 'overlay',
      toScreen: (_page, rect) => rect,
      toScreenPoint: (_page, at) => at,
      viewEnv: () => ({ scale: 1, rotation: 0, zoom: 1 }),
      view: () => ({ x: 0, y: 0, width: 2000, height: 2000 }),
    };
    // The overlay of a surface that shows this page.
    const Overlay = probe(() => {
      const page = usePage();
      return () =>
        h(
          AnchoredScope,
          { binding: { projector, revision: 0 }, shown: new Set([page.value.ref.objectNumber]) },
          () => h(AnnotationMenu, null, () => h('div', { class: 'menu' }, 'Delete')),
        );
    });
    const { annotation, close } = await mountLayer(() => h(Overlay));
    try {
      expect(document.querySelector('.menu')).toBeNull();
      const square = annotation
        .list()
        .find((entry) => entry.subtype === 'square' || entry.subtype === 'circle')!;
      annotation.selection.set([square.ref]);
      await eventually(() => expect(document.querySelector('.menu')).not.toBeNull());
      annotation.selection.clear();
      await eventually(() => expect(document.querySelector('.menu')).toBeNull());
    } finally {
      await close();
    }
  }, 30_000);
});

