/**
 * Free-text editing. Every keystroke is an ordinary commit: the core's
 * `setText` / `setRichText` puts the edited record in the change set, the
 * view shows it at once, and its `text` effect waits for the next engine
 * write of that record. The write runs after a pause in typing (or at once
 * when editing ends) and sends the latest text, so it carries every keystroke
 * that waited for it: they settle together, accepted or refused.
 */
import type { Id, Point } from '@embedpdf/core-annotation';
import {
  annotationKey,
  type AnnotationRef,
  type PageRef,
  type RichTextParagraph,
} from '@embedpdf/engine-core/runtime';

import { setTextSelection } from '../model';
import type { AnnotationReads } from '../read/annotations';
import type { ChromeReads } from '../read/chrome';
import { cssFontFamilyForFace, richDocOf, textCommitPatch, type TextSelection } from '../rich-text';
import type { AnnotationContext, AnnotationServices } from '../services';
import { throwIfFailed } from './outcomes';
import type { Commit } from '../services/store';

const TEXT_WRITE_DELAY_MS = 250;

interface Waiter {
  resolve(): void;
  reject(error: unknown): void;
}

export function createTextEditing(
  ctx: Pick<AnnotationContext, 'doc' | 'state' | 'cleanup'>,
  { store, identity, fonts }: Pick<AnnotationServices, 'store' | 'identity' | 'fonts'>,
  annotations: Pick<AnnotationReads, 'loadedOrThrow'>,
  chrome: Pick<ChromeReads, 'hitAt'>,
) {
  /** The pause timer of each record being typed in. */
  const timers = new Map<Id, ReturnType<typeof setTimeout>>();
  /** The keystrokes of each record waiting for its next write, oldest first. */
  const waiting = new Map<Id, Waiter[]>();
  ctx.cleanup(() => timers.forEach((timer) => clearTimeout(timer)));

  /** Write the record's text once typing pauses. */
  const writeAfterPause = (id: Id): void => {
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => flushText(id), TEXT_WRITE_DELAY_MS),
    );
  };

  /**
   * Write the record's current text now, and settle every keystroke that
   * waited for it: they are all in this one write. A record the engine has
   * not confirmed yet is written once its create is, under its real key.
   * Resolves when the write settled; never rejects (each keystroke's own
   * write reports a refusal).
   */
  const flushText = (id: Id): Promise<void> => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    const waiters = waiting.get(id) ?? [];
    waiting.delete(id);
    return identity
      .withRef(id, async (ref) => {
        const record = store.model().byId[annotationKey(ref)];
        if (!record) return;
        const patch = textCommitPatch(record, richDocOf(record, fonts).paragraphs, fonts);
        await ctx.doc.page(ref.page).annotations.update(ref, { subtype: 'free-text', ...patch });
      })
      .then(
        () => waiters.forEach((waiter) => waiter.resolve()),
        (error: unknown) => waiters.forEach((waiter) => waiter.reject(error)),
      );
  };

  // Typing waiting for its write moves with its record to a new key.
  identity.onFollow((from, to) => {
    const moved = waiting.get(from);
    if (!moved) return;
    waiting.delete(from);
    clearTimeout(timers.get(from));
    timers.delete(from);
    waiting.set(to, [...moved, ...(waiting.get(to) ?? [])]);
    writeAfterPause(to);
  });

  /** Write every record with typing still waiting. */
  const flushAllText = (): Promise<void>[] => [...waiting.keys()].map(flushText);

  // A keystroke waits for the next write of its record, after a pause in typing.
  store.onEffect('text', (effect) => ({
    ids: [effect.id],
    perform: () =>
      new Promise<void>((resolve, reject) => {
        waiting.set(effect.id, [...(waiting.get(effect.id) ?? []), { resolve, reject }]);
        writeAfterPause(effect.id);
      }),
  }));

  /** Apply a text message and write it at once; rejects when the engine refuses it. */
  const writeNow = async (id: Id, commit: () => Commit): Promise<void> => {
    const committed = commit();
    void flushText(id);
    throwIfFailed(await committed.written);
  };

  const api = {
    setContents: async (ref: AnnotationRef, text: string) => {
      const annotation = annotations.loadedOrThrow(ref);
      await writeNow(annotation.id, () =>
        store.commit({ type: 'setText', id: annotation.id, text }),
      );
    },
    setRichText: async (ref: AnnotationRef, doc: { paragraphs: RichTextParagraph[] }) => {
      const annotation = annotations.loadedOrThrow(ref);
      await writeNow(annotation.id, () =>
        store.commit({
          type: 'setRichText',
          id: annotation.id,
          doc: { paragraphs: doc.paragraphs },
        }),
      );
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
      const writes = flushAllText();
      if (ctx.state.get().textSelection) {
        ctx.state.update(setTextSelection, null);
      }
      store.commit({ type: 'endTextEdit' });
      await Promise.all(writes);
    },
    getEditingRef: () => {
      const model = store.model();
      return model.editing ? (model.byId[model.editing]?.ref ?? null) : null;
    },
    getEditingId: () => store.model().editing,
    draftContents: (ref: AnnotationRef, text: string) => {
      store.commit({ type: 'setText', id: annotationKey(ref), text });
    },
    draftRichText: (ref: AnnotationRef, doc: { paragraphs: RichTextParagraph[] }) => {
      store.commit({
        type: 'setRichText',
        id: annotationKey(ref),
        doc: { paragraphs: doc.paragraphs },
      });
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

  return { flushText, flushAllText, api };
}

export type TextEditing = ReturnType<typeof createTextEditing>;
