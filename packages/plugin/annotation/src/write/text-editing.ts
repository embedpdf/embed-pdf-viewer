import type { Vec } from '@embedpdf/core-annotation';
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

const TEXT_COMMIT_DEBOUNCE_MS = 250;

/**
 * Free-text editing: the editor's draft path (optimistic model updates
 * while typing) and the ONE debounced engine write per annotation both
 * editors share. The model is the truth while typing; the engine sees it
 * after a pause, on every restyle, and on leaving edit. The write is the
 * rich paragraphs (`textCommitPatch`); its echo is NOT re-ingested — it may
 * already be behind the keyboard.
 */
export function createTextEditing(
  ctx: Pick<AnnotationContext, 'doc' | 'getState' | 'dispatch'>,
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
    const a = store.model().byId[key];
    const pon = records.pageOf(ref);
    if (!a || pon == null) return;
    const patch = textCommitPatch(a, richDocOf(a, fonts).paragraphs, fonts);
    const write = ctx.doc
      ?.page(toPageRef(pon))
      .annotations.update(ref, { subtype: 'free-text', ...patch });
    if (!write) return;
    writes.note(ref, write);
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
      const a = store.model().byId[key];
      if (a?.ref) {
        const write = commitText(a.ref);
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
      const a = annotations.loadedOrThrow(ref);
      store.commit({ t: 'setText', id: a.id, text });
      await commitText(a.ref);
    },
    setRichText: async (ref: AnnotationRef, doc: { paragraphs: RichTextParagraph[] }) => {
      const a = annotations.loadedOrThrow(ref);
      store.commit({ t: 'setRichText', id: a.id, doc: { paragraphs: doc.paragraphs } });
      await commitText(a.ref);
    },
    beginTextEdit: (ref: AnnotationRef) => {
      store.commit({ t: 'beginTextEdit', id: annotationKey(ref) });
    },
    beginTextEditAt: (
      page: PageRef,
      point: Vec,
      scale?: number,
      rotation?: number,
      zoom?: number,
    ) => {
      const m = store.model();
      const h = chrome.hitAt(page, point, { scale, rotation, zoom }, 1, null);
      // A double-click on the box body OR one of its resize handles both target the
      // same annotation; either should open it for editing.
      const id = h.t === 'annot' || h.t === 'handle' ? h.id : null;
      if (id != null && m.byId[id]?.geom.t === 'text') {
        store.commit({ t: 'beginTextEdit', id });
        return true;
      }
      // Nothing editable here — report it so the caller can fall through to a
      // normal press instead of swallowing the gesture on a non-text annotation.
      return false;
    },
    endTextEdit: async () => {
      const pending = flushTextCommits();
      if (ctx.getState().textSelection) {
        ctx.dispatch({ type: 'SET_TEXT_SELECTION', selection: null });
      }
      store.commit({ t: 'endTextEdit' });
      await Promise.allSettled(pending);
    },
    getEditingRef: () => {
      const m = store.model();
      return m.editing ? (m.byId[m.editing]?.ref ?? null) : null;
    },
    getEditingId: () => store.model().editing,
    draftContents: (ref: AnnotationRef, text: string) => {
      store.commit({ t: 'setText', id: annotationKey(ref), text }); // optimistic, no engine churn
      scheduleTextCommit(ref);
    },
    draftRichText: (ref: AnnotationRef, doc: { paragraphs: RichTextParagraph[] }) => {
      store.commit({
        t: 'setRichText',
        id: annotationKey(ref),
        doc: { paragraphs: doc.paragraphs },
      });
      scheduleTextCommit(ref);
    },
    setTextSelection: (ref: AnnotationRef, range: { start: number; end: number } | null) => {
      const id = annotationKey(ref);
      const prev = ctx.getState().textSelection;
      const next: TextSelection | null = range ? { id, start: range.start, end: range.end } : null;
      if (
        (prev === null) === (next === null) &&
        (!prev ||
          !next ||
          (prev.id === next.id && prev.start === next.start && prev.end === next.end))
      ) {
        return;
      }
      ctx.dispatch({ type: 'SET_TEXT_SELECTION', selection: next });
    },
    getCssFontFamily: (family: string) => cssFontFamilyForFace(family, fonts),
  };

  return { commitText, scheduleTextCommit, flushTextCommits, api };
}

export type TextEditing = ReturnType<typeof createTextEditing>;
