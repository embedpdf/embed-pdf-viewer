/**
 * The annotation composables: `useAnnotation()` (the API) and
 * `useAnnotationEvent()`; the reads a component follows on their own, each a
 * ref (`useAnnotationList()`, `useAnnotationDefaults()`,
 * `useAnnotationProperties()`, `useAnnotationAnchor()`); the comments
 * (`useComments()`, `useCommentThreads()`, `useCommentThread()`); and
 * `useFilePickerProvider()`, the file dialog behind click-then-pick tools.
 * The state and the settings are in `./state`.
 */
import { computed, markRaw, toValue, unref, watch } from 'vue';
import type { MaybeRef, MaybeRefOrGetter, Ref } from 'vue';
import { annotationKey, shallowEqual } from '@embedpdf/core';
import type { EventHook, PageLayout } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation';
import type {
  Annotation,
  AnnotationAnchor,
  AnnotationCapability,
  AnnotationFilter,
  AnnotationProperties,
  AnnotationRef,
  CommentThread,
  CommentsApi,
  FilePickerProvider,
  ToolDefaults,
} from '@embedpdf/plugin-annotation';
// The anchor of one annotation is a host read: it projects a drag in progress.
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import {
  enrichCommentThreads,
  installFilePickerProvider,
  pickRequestedFile,
  sameAnnotationAnchor,
} from '@embedpdf/web';
import { devWarn } from '../dev';
import {
  useCapability,
  useCapabilityEvent,
  useOptionalCapability,
  useOptionalSelector,
} from '../runtime/capabilities';
import { useDocumentId, useKernelValue } from '../runtime/kernel';
import type { CommentThreadView } from './types';

/**
 * The annotation API (`create`, `update`, `selection`, `tools`, `text`,
 * `comments`, …) for your chrome. The object never changes, so it's safe to
 * keep in a closure; keep it whole (`annotation.selection.delete()`), since a
 * member taken out of it once stays the one of that moment.
 */
export function useAnnotation(): AnnotationCapability {
  return useCapability(AnnotationToken);
}

/** Subscribe to one annotation event while the component lives: `useAnnotationEvent((annotation) => annotation.onCreated, handler)`. */
export function useAnnotationEvent<Event>(
  select: (annotation: AnnotationCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(AnnotationToken, select, handler);
}

const NO_ANNOTATIONS: readonly Annotation[] = Object.freeze([]);

/**
 * The annotations matching `filter` (some pages, one kind), in drawing order,
 * as the user sees them, as a ref: the same array while they stay the same.
 * A getter follows a filter that changes. Empty without a document.
 */
export function useAnnotationList(
  filter?: MaybeRefOrGetter<AnnotationFilter | undefined>,
): Readonly<Ref<readonly Annotation[]>> {
  return useOptionalSelector(
    AnnotationToken,
    (annotation) => annotation.list(toValue(filter)),
    NO_ANNOTATIONS,
    shallowEqual,
  );
}

const NO_DEFAULTS: ToolDefaults = Object.freeze({});

/**
 * A tool's defaults, as a ref: the fields its next annotation starts with,
 * over the engine's. It follows them, so a color picker always shows the
 * current color. Empty without a document.
 */
export function useAnnotationDefaults(toolId: MaybeRefOrGetter<string>): Readonly<Ref<ToolDefaults>> {
  return useOptionalSelector(
    AnnotationToken,
    (annotation) => annotation.tools.getDefaults(toValue(toolId)),
    NO_DEFAULTS,
  );
}

const NO_PROPERTIES: AnnotationProperties = Object.freeze({
  properties: [],
  values: {},
  mixed: [],
});

/**
 * What a style panel shows, as a ref: the selection's properties
 * (`selection.getProperties()`), or, given a tool id, the tool's
 * (`tools.getProperties(id)`). It follows them. Empty without a document.
 */
export function useAnnotationProperties(
  toolId?: MaybeRefOrGetter<string | undefined>,
): Readonly<Ref<AnnotationProperties>> {
  return useOptionalSelector(
    AnnotationToken,
    (annotation) => {
      const tool = toValue(toolId);
      return tool === undefined
        ? annotation.selection.getProperties()
        : annotation.tools.getProperties(tool);
    },
    NO_PROPERTIES,
  );
}

/**
 * An anchor for `<Anchored>` that keeps a card or a badge attached to one
 * annotation, as a ref: its page and the box around what it shows, following
 * a move as it happens. `null` for `null`, or an annotation that isn't here.
 * It changes when the annotation moves, not while people scroll or zoom: a
 * note that keeps its size on screen hands `<Anchored>` its `boundsIn`. A
 * getter follows a ref that changes (`() => hovered.value?.ref ?? null`).
 */
export function useAnnotationAnchor(
  ref: MaybeRefOrGetter<AnnotationRef | null>,
): Readonly<Ref<AnnotationAnchor | null>> {
  return useOptionalSelector(
    AnnotationHostToken,
    (annotation) => {
      const wanted = toValue(ref);
      return wanted ? annotation.getAnnotationAnchor(wanted) : null;
    },
    null,
    sameAnnotationAnchor,
  );
}

// ── comments (the conversation plane) ────────────────────────────────────────

/**
 * The comments API: the `comments` part of `useAnnotation()`, for the
 * document in scope. Like `useAnnotation()`, the object never changes and
 * always reaches the current document. Pair it with {@link useCommentThreads}
 * for the threads to show.
 */
export function useComments(): CommentsApi {
  const annotation = useAnnotation();
  // Read `comments` at each use, never once here: the document in scope may change.
  const target = markRaw({});
  return new Proxy(target, {
    get: (_target, key) =>
      typeof key === 'string' && key.startsWith('__v_')
        ? Reflect.get(target, key)
        : Reflect.get(annotation.comments, key),
    has: (_target, key) => Reflect.has(annotation.comments, key),
  }) as CommentsApi;
}

const NO_PAGES: readonly PageLayout[] = Object.freeze([]);
const NO_THREADS: readonly CommentThread[] = Object.freeze([]);

/**
 * Every comment thread in the document as a ref, display-ordered (page
 * position, then top of page, then creation date) and with where its page is
 * shown (`pageIndex`, `pageLabel`). It follows annotation writes (your own,
 * remote ones, loading) and page moves and deletes; the same array between
 * changes.
 */
export function useCommentThreads(): Readonly<Ref<readonly CommentThreadView[]>> {
  const documentId = useDocumentId();
  const threads = useOptionalSelector(
    AnnotationToken,
    (annotation) => annotation.comments.listThreads(),
    NO_THREADS,
  );
  const pages = useKernelValue((kernel) =>
    documentId.value ? kernel.documents.listPages(documentId.value) : NO_PAGES,
  );
  return computed(() => enrichCommentThreads(threads.value, pages.value));
}

/**
 * The thread holding any of its annotations (the root, a reply, a grouped
 * part, a review state), as a ref, or null. A getter follows a ref that changes.
 */
export function useCommentThread(
  ref: MaybeRefOrGetter<AnnotationRef | null>,
): Readonly<Ref<CommentThreadView | null>> {
  const views = useCommentThreads();
  const annotation = useOptionalCapability(AnnotationToken);
  return computed(() => {
    const wanted = toValue(ref);
    const api = annotation.value;
    if (wanted == null || !api) return null;
    const thread = api.comments.getThread(wanted);
    if (!thread) return null;
    const root = annotationKey(thread.root.ref);
    return views.value.find((view) => annotationKey(view.root.ref) === root) ?? null;
  });
}

// ── the file picker ──────────────────────────────────────────────────────────

/**
 * The default file-picker provider: the browser's file dialog (from
 * `@embedpdf/web`), honouring the tool's `accept` filter. The adapter fulfils
 * the plugin's DOM-free port; the dialog never lives in the plugin.
 */
export const filePickerProvider: FilePickerProvider = pickRequestedFile;

/**
 * Install the file-picker provider for the document in scope while the
 * component lives: the one port behind every click-then-pick tool (a stamp
 * whose source is `'prompt'`, the file attachment tool). Call it once, at a
 * document-wide spot (not in a page layer). Without an argument it installs
 * {@link filePickerProvider}, so those tools work out of the box; pass your
 * own (an asset library, a cloud drive: switch on `toolId` or `subtype`), or
 * `null` to make them do nothing. A ref follows a provider that changes.
 */
export function useFilePickerProvider(
  provider: MaybeRef<FilePickerProvider | null> = filePickerProvider,
): void {
  const annotation = useOptionalCapability(AnnotationToken);
  // Not a getter: the provider is itself a function.
  watch(
    [annotation, () => unref(provider)],
    ([capability, current], _previous, onCleanup) => {
      if (!capability) return;
      // One port per document: a second caller silently replaces the first.
      onCleanup(
        installFilePickerProvider(capability, current, () =>
          devWarn(
            'file-picker-provider-twice',
            'useFilePickerProvider() is called from two mounted components for the same ' +
              'document — the later one wins. Call it once, at a document-scoped spot.',
          ),
        ),
      );
    },
    { immediate: true },
  );
}
