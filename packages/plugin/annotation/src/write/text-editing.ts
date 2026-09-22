import type { Point } from '@embedpdf/core-annotation';
import {
  annotationKey,
  toPageRef,
  type AnnotationRef,
  type PageRef,
  type RichTextParagraph,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationReads } from '../read/annotations';
import type { ChromeReads } from '../read/chrome';
import { cssFontFamilyForFace, richDocOf, textCommitPatch, type TextSelection } from '../rich-text';
import type { AnnotationContext, AnnotationServices } from '../services';
import { setTextSelection } from '../model';

const TEXT_COMMIT_DEBOUNCE_MS = 250;

/**
 * Free-text editing: the editor's draft path (optimistic model updates
 * while typing) and the one debounced engine write per annotation both
 * editors share. The model is the truth while typing; the engine sees it
 * after a pause, on every restyle, and on leaving edit. The write is the
 * rich paragraphs (`textCommitPatch`); its echo is not re-ingested — it may
 * already be behind the keyboard.
 */
export function createTextEditing(
  ctx: Pick<AnnotationContext, 'doc' | 'state'>,
  {
    store,
    records,
    writes,
    fonts,
  }: Pick<AnnotationServices, 'store' | 'records' | 'writes' | 'fonts'>,
  annotations: Pick<AnnotationReads, 'loadedOrThrow'>,
  chrome: Pick<ChromeReads, 'hitAt'>,
) {
  /** Per-annotation debounce timer for the engine text write while typing. */
  const textTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const commitText = (ref: AnnotationRef): Promise<unknown> | undefined => {
    const key = annotationKey(ref);
    clearTimeout(textTimers.get(key));
    textTimers.delete(key);
    const annotation = store.model().byId[key];
    const pageObjectNumber = records.pageOf(ref);
    if (!annotation || pageObjectNumber == null) return;
    const patch = textCommitPatch(annotation, richDocOf(annotation, fonts).paragraphs, fonts);
    const write = ctx.doc
      ?.page(toPageRef(pageObjectNumber))
      .annotations.update(ref, { subtype: 'free-text', ...patch });
    if (!write) return;
    writes.note(ref, write);
    writes.trackTextWrite(key, write);
    write.then(
      () => {},
      () => {},
    );
    return write;
  };
  const scheduleTextCommit = (ref: AnnotationRef): void => {
    const key = annotationKey(ref);
    clearTimeout(textTimers.get(key));
    textTimers.set(
      key,
      setTimeout(() => commitText(ref), TEXT_COMMIT_DEBOUNCE_MS),
    );
  };
  const flushTextCommits = (): Promise<unknown>[] => {
    const pending: Promise<unknown>[] = [];
    for (const key of [...textTimers.keys()]) {
      const annotation = store.model().byId[key];
      if (annotation?.ref) {
        const write = commitText(annotation.ref);
        if (write) pending.push(write);
      } else {
        clearTimeout(textTimers.get(key));
        textTimers.delete(key);
      }
    }
    return pending;
  };

  const api = {
    setContents: async (ref: AnnotationRef, text: string) => {
      const annotation = annotations.loadedOrThrow(ref);
      store.commit({ type: 'setText', id: annotation.id, text });
      await commitText(annotation.ref);
    },
    setRichText: async (ref: AnnotationRef, doc: { paragraphs: RichTextParagraph[] }) => {
      const annotation = annotations.loadedOrThrow(ref);
      store.commit({ type: 'setRichText', id: annotation.id, doc: { paragraphs: doc.paragraphs } });
      await commitText(annotation.ref);
    },
    beginTextEdit: (ref: AnnotationRef) => {
      store.commit({ type: 'beginTextEdit', id: annotationKey(ref) });
    },
    beginTextEditAt: (
      page: PageRef,
      point: Point,
      scale?: number,
      rotation?: number,
      zoom?: number,
    ) => {
      const model = store.model();
      const target = chrome.hitAt(page, point, { scale, rotation, zoom }, 1, null);
      // A double-click on the box body or one of its resize handles both target the
      // same annotation; either should open it for editing.
      const id = target.kind === 'annot' || target.kind === 'handle' ? target.id : null;
      if (id != null && model.byId[id]?.geometry.kind === 'text') {
        store.commit({ type: 'beginTextEdit', id });
        return true;
      }
      // Nothing editable here — report it so the caller can fall through to a
      // normal press instead of swallowing the gesture on a non-text annotation.
      return false;
    },
    endTextEdit: async () => {
      const pending = flushTextCommits();
      if (ctx.state.get().textSelection) {
        ctx.state.update(setTextSelection, null);
      }
      store.commit({ type: 'endTextEdit' });
      await Promise.allSettled(pending);
    },
    getEditingRef: () => {
      const model = store.model();
      return model.editing ? (model.byId[model.editing]?.ref ?? null) : null;
    },
    getEditingId: () => store.model().editing,
    draftContents: (ref: AnnotationRef, text: string) => {
      store.commit({ type: 'setText', id: annotationKey(ref), text }); // optimistic, no engine churn
      scheduleTextCommit(ref);
    },
    draftRichText: (ref: AnnotationRef, doc: { paragraphs: RichTextParagraph[] }) => {
      store.commit({
        type: 'setRichText',
        id: annotationKey(ref),
        doc: { paragraphs: doc.paragraphs },
      });
      scheduleTextCommit(ref);
    },
    setTextSelection: (ref: AnnotationRef, range: { start: number; end: number } | null) => {
      const id = annotationKey(ref);
      const previous = ctx.state.get().textSelection;
      const next: TextSelection | null = range ? { id, start: range.start, end: range.end } : null;
      if (
        (previous === null) === (next === null) &&
        (!previous ||
          !next ||
          (previous.id === next.id && previous.start === next.start && previous.end === next.end))
      ) {
        return;
      }
      ctx.state.update(setTextSelection, next);
    },
    getCssFontFamily: (family: string) => cssFontFamilyForFace(family, fonts),
  };

  return { commitText, scheduleTextCommit, flushTextCommits, api };
}

export type TextEditing = ReturnType<typeof createTextEditing>;
