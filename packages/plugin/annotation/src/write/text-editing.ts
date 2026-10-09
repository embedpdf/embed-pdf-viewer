/**
 * Free-text editing. Every keystroke is an ordinary commit of the core's
 * `setText` / `setRichText`, into one change that is still being made (a
 * hold): the view shows the text at once, and the change keeps its place in
 * line holding the latest text. It is sent after a pause in typing, when
 * editing ends, when anything else is staged, and before a download; what is
 * typed after that goes into a new one.
 */
import { refOf, type Id, type Message, type Point, richDocOf } from '@embedpdf/core-annotation';
import {
  annotationKey,
  type AnnotationRef,
  type PageRef,
  type RichTextParagraph,
} from '@embedpdf/engine-core/runtime';

import { setTextSelection } from '../model';
import type { ChromeReads } from '../read/chrome';
import { cssFontFamilyForFace, textCommitPatch, type TextSelection } from '../rich-text';
import type { AnnotationContext, AnnotationServices } from '../services';
import type { Commit, StoreHold, Written } from '../services/store';

const TEXT_WRITE_DELAY_MS = 250;

export function createTextEditing(
  ctx: Pick<AnnotationContext, 'state' | 'clock' | 'cancellable'>,
  { store, fonts }: Pick<AnnotationServices, 'store' | 'fonts'>,
  chrome: Pick<ChromeReads, 'textBoxAt'>,
) {
  /** What is being typed: the record, the change it goes into, how it settles, and the pause before it is sent. */
  let typing: {
    readonly id: Id;
    readonly hold: StoreHold;
    written: Promise<Written> | null;
    cancelPause: () => void;
  } | null = null;

  /** Send what was typed now. Resolves once the engine answered it; never rejects. */
  const sendTyping = async (): Promise<void> => {
    const sent = typing;
    if (!sent) return;
    typing = null;
    sent.cancelPause();
    sent.hold.send();
    await sent.written;
  };

  /**
   * One edit of the record's text (a keystroke, or a format on the words
   * selected while typing) into its typing, sent once typing pauses.
   */
  const type = (id: Id, message: Message): Commit => {
    if (typing && (typing.id !== id || !typing.hold.open)) void sendTyping();
    typing ??= {
      id,
      hold: store.hold({ key: 'annotation.text' }),
      written: null,
      cancelPause: () => {},
    };
    const current = typing;
    const commit = store.commit(message, { into: current.hold });
    current.written = commit.written;
    current.cancelPause();
    current.cancelPause = ctx.clock.after(TEXT_WRITE_DELAY_MS, () => {
      if (typing === current) void sendTyping();
    });
    return commit;
  };

  // A record's text, as the engine writes it: its plain and rich text.
  store.onEffect('text', (effect, model) => {
    const record = model.byId[effect.id];
    const ref = refOf(record);
    if (!record || !ref) return;
    const patch = textCommitPatch(record, richDocOf(record.annotation, fonts).paragraphs, fonts);
    return [{ type: 'annotations.update', ref, patch: { subtype: 'free-text', ...patch } }];
  });

  /** The `text` noun (its `getEditing` and `toggleFormat` come from the reads and the selection). */
  const text = {
    begin: (ref: AnnotationRef) => {
      store.commit({ type: 'beginTextEdit', id: annotationKey(ref) });
    },
    end: async (options: { signal?: AbortSignal } = {}) => {
      const sent = sendTyping();
      if (ctx.state.get().textSelection) {
        ctx.state.update(setTextSelection, null);
      }
      store.commit({ type: 'endTextEdit' });
      await ctx.cancellable(options.signal, sent);
    },
  };

  const api = {
    beginTextEditAt: (
      page: PageRef,
      point: Point,
      scale?: number,
      rotation?: number,
      zoom?: number,
    ) => {
      const id = chrome.textBoxAt(page, point, { scale, rotation, zoom });
      if (id != null) {
        store.commit({ type: 'beginTextEdit', id });
        return true;
      }
      // Nothing editable here — report it so the caller can fall through to a
      // normal press instead of swallowing the gesture on a non-text annotation.
      return false;
    },
    getEditingId: () => store.model().editing,
    draftContents: (ref: AnnotationRef, text: string) => {
      const id = annotationKey(ref);
      type(id, { type: 'setText', id, text });
    },
    draftRichText: (ref: AnnotationRef, doc: { paragraphs: RichTextParagraph[] }) => {
      const id = annotationKey(ref);
      type(id, { type: 'setRichText', id, doc: { paragraphs: doc.paragraphs } });
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

  return { type, sendTyping, text, api };
}

export type TextEditing = ReturnType<typeof createTextEditing>;
