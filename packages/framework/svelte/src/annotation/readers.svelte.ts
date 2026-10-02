/**
 * The annotation plugin's readers: the API (`useAnnotation()`), its events, and the reads a
 * component follows on their own, each `{ current }`: the annotations of a filter, a tool's
 * defaults, a style panel's properties, an annotation's anchor, and the comment threads.
 * `useFilePickerProvider()` installs the file dialog behind click-then-pick tools.
 *
 * An argument that changes is a function (`useAnnotationAnchor(() => note.ref)`), read again
 * whenever the value is.
 */
import { untrack } from 'svelte';
import type { EventHook, PageLayout } from '@embedpdf/core';
import {
  AnnotationToken,
  annotationKey,
  type Annotation,
  type AnnotationAnchor,
  type AnnotationCapability,
  type AnnotationFilter,
  type AnnotationProperties,
  type AnnotationRef,
  type CommentsApi,
  type CommentThread,
  type FilePickerProvider,
  type ToolDefaults,
} from '@embedpdf/plugin-annotation';
// The anchor of one annotation is a host read (the same runtime token, typed wider).
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import {
  enrichCommentThreads,
  installFilePickerProvider,
  pickRequestedFile,
  sameAnnotationAnchor,
} from '@embedpdf/web';
import { devWarn } from '../runtime/dev';
import {
  shallowArray,
  useCapability,
  useCapabilityEvent,
  useDocumentId,
  useKernelValue,
  useOptionalCapability,
  useOptionalSelector,
} from '../runtime/readers.svelte';
import {
  currentOf,
  derivedValue,
  valueOf,
  type CurrentValue,
  type MaybeGetter,
} from '../runtime/values.svelte';
import type { CommentThreadView } from './props';

/** The API: a handle, always the capability of the document in scope. */
export function useAnnotation(): AnnotationCapability {
  return useCapability(AnnotationToken);
}

/** Listen to one annotation event while the component lives: `useAnnotationEvent((annotation) => annotation.onCreated, handler)`. */
export function useAnnotationEvent<T>(
  select: (annotation: AnnotationCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(AnnotationToken, select, handler);
}

const NO_ANNOTATIONS: readonly Annotation[] = Object.freeze([]);

/**
 * The annotations matching `filter` (some pages, one kind), in drawing order, as the user sees
 * them: `list.current`, the same array while they stay the same. Empty without a document.
 */
export function useAnnotationList(
  filter?: MaybeGetter<AnnotationFilter | undefined>,
): CurrentValue<readonly Annotation[]> {
  return useOptionalSelector(
    AnnotationToken,
    (annotation) => annotation.list(valueOf(filter)),
    NO_ANNOTATIONS,
    shallowArray,
  );
}

const NO_DEFAULTS: ToolDefaults = Object.freeze({});

/**
 * A tool's defaults (`defaults.current`): the fields its next annotation starts with, over the
 * engine's. It updates when they change, so a color picker always shows the current color. Empty
 * without a document.
 */
export function useAnnotationDefaults(toolId: MaybeGetter<string>): CurrentValue<ToolDefaults> {
  return useOptionalSelector(
    AnnotationToken,
    (annotation) => annotation.tools.getDefaults(valueOf(toolId)),
    NO_DEFAULTS,
  );
}

const NO_PROPERTIES: AnnotationProperties = Object.freeze({
  properties: [],
  values: {},
  mixed: [],
});

/**
 * What a style panel shows (`panel.current`): the selection's properties
 * (`selection.getProperties()`), or, given a tool id, the tool's (`tools.getProperties(id)`). It
 * updates when they change. Empty without a document.
 */
export function useAnnotationProperties(
  toolId?: MaybeGetter<string | undefined>,
): CurrentValue<AnnotationProperties> {
  return useOptionalSelector(
    AnnotationToken,
    (annotation) => {
      const tool = valueOf(toolId);
      return tool === undefined
        ? annotation.selection.getProperties()
        : annotation.tools.getProperties(tool);
    },
    NO_PROPERTIES,
  );
}

/**
 * An anchor for `<Anchored>` that keeps a card or a badge attached to one annotation
 * (`anchor.current`): its page and the box around what it shows, following a move as it happens.
 * `null` for `null`, or an annotation that isn't here. It updates when the annotation moves, not
 * while people scroll or zoom: a note that keeps its size on screen hands `<Anchored>` its
 * `boundsIn`.
 */
export function useAnnotationAnchor(
  ref: MaybeGetter<AnnotationRef | null>,
): CurrentValue<AnnotationAnchor | null> {
  return useOptionalSelector(
    AnnotationHostToken,
    (annotation) => {
      const target = valueOf(ref);
      return target ? annotation.getAnnotationAnchor(target) : null;
    },
    null,
    sameAnnotationAnchor,
  );
}

// ── comments ─────────────────────────────────────────────────────────────────

/** The comments API: the `comments` part of `useAnnotation()`. Pair it with {@link useCommentThreads} for the threads to show. */
export function useComments(): CommentsApi {
  return useCapability(AnnotationToken).comments;
}

const NO_PAGES: readonly PageLayout[] = Object.freeze([]);
const NO_THREADS: readonly CommentThread[] = Object.freeze([]);

/**
 * Every comment thread in the document (`threads.current`), in display order (page position, top
 * of page, creation date), each with its page's `pageIndex` and `pageLabel`. Annotation writes
 * (your own, remote ones, the first load) and page moves or deletes update it; the same array
 * between changes.
 */
export function useCommentThreads(): CurrentValue<CommentThreadView[]> {
  const documentId = useDocumentId();
  const threads = useOptionalSelector(
    AnnotationToken,
    (annotation) => annotation.comments.listThreads(),
    NO_THREADS,
  );
  const pages = useKernelValue((kernel) =>
    documentId.current ? kernel.documents.listPages(documentId.current) : NO_PAGES,
  );
  return currentOf(derivedValue(() => enrichCommentThreads(threads.current, pages.current)));
}

/** The thread holding any of its annotations (the comment, a reply, a state), or `null`: `thread.current`. */
export function useCommentThread(
  ref: MaybeGetter<AnnotationRef | null>,
): CurrentValue<CommentThreadView | null> {
  const views = useCommentThreads();
  const capability = useOptionalCapability(AnnotationToken);
  return currentOf(
    derivedValue(() => {
      // Read first: every annotation write gives new threads, so this runs again.
      const shown = views.current;
      const target = valueOf(ref);
      const annotation = capability.current;
      if (target == null || !annotation) return null;
      const thread = annotation.comments.getThread(target);
      if (!thread) return null;
      const root = annotationKey(thread.root.ref);
      return shown.find((view) => annotationKey(view.root.ref) === root) ?? null;
    }),
  );
}

// ── the file picker ──────────────────────────────────────────────────────────

/**
 * The default file-picker provider: the browser's file dialog (from `@embedpdf/web`), honouring
 * the tool's `accept` filter. The adapter fulfils the plugin's DOM-free port; the dialog lives
 * here, never in the plugin.
 */
export const filePickerProvider: FilePickerProvider = pickRequestedFile;

/**
 * Install the file-picker provider for the document in scope: the one port behind every
 * click-then-pick tool (a stamp's `'prompt'` source, the file-attachment tool). Call it once, in a
 * component around the pages (not in a page layer). Without an argument it installs
 * {@link filePickerProvider}, so those tools work out of the box; pass your own provider (an
 * asset library, a cloud drive: switch on `request.subtype` / `request.toolId`), or `null` to
 * make them do nothing. Removed when the component goes away. The provider is read once.
 */
export function useFilePickerProvider(
  provider: FilePickerProvider | null = filePickerProvider,
): void {
  const capability = useOptionalCapability(AnnotationToken);
  $effect(() => {
    const annotation = capability.current;
    if (!annotation) return;
    // One port per document: a second caller silently replaces the first.
    return untrack(() =>
      installFilePickerProvider(annotation, provider, () =>
        devWarn(
          'file-picker-provider-twice',
          'useFilePickerProvider() is called from two mounted components for the same document — ' +
            'the later one wins. Call it once, in a component around the pages.',
        ),
      ),
    );
  });
}
