/**
 * Free-text typing: the editor's plain or rich result becomes the record's
 * text at once, and a `text` effect asks for the (debounced) engine write.
 */
import type { RichTextDocumentInput } from '@embedpdf/engine-core/runtime';

import { normalizeRuns, paragraphsFromPlainText, plainTextOf } from '../richtext';
import type { Effect, Id, Model } from '../types';
import { toVector } from './changes';

/** Apply the editor's plain text. Updates `contents` on the record's data and
 *  flips the box to `vector` so the live text shows. The `text` effect asks
 *  for the write; the plugin waits for a pause in typing before it runs. */
export function setText(model: Model, id: Id, text: string): [Model, Effect[]] {
  const annotation = model.byId[id];
  if (!annotation) return [model, []];
  // The rich projection follows plain text: body-style paragraphs, one per
  // line break, so an editor rendering `richText` shows what was typed.
  const data =
    annotation.data && annotation.data.subtype === 'free-text'
      ? {
          ...annotation.data,
          contents: text,
          richText: { ...annotation.data.richText, paragraphs: paragraphsFromPlainText(text) },
        }
      : annotation.data
        ? { ...annotation.data, contents: text }
        : annotation.data;
  const next = toVector({ ...annotation, data });
  return [{ ...model, byId: { ...model.byId, [id]: next } }, [{ type: 'text', id }]];
}

/** Apply the editor's rich document, like `setText`. The DTO's body is kept
 *  (a partial input body layers on it); `contents` is the projection. */
export function setRichText(model: Model, id: Id, doc: RichTextDocumentInput): [Model, Effect[]] {
  const annotation = model.byId[id];
  if (!annotation || !annotation.data || annotation.data.subtype !== 'free-text')
    return [model, []];
  const normalized = normalizeRuns(doc);
  const richText = {
    body: { ...annotation.data.richText.body, ...(normalized.body ?? {}) },
    paragraphs: normalized.paragraphs,
  };
  const next = toVector({
    ...annotation,
    data: { ...annotation.data, richText, contents: plainTextOf(richText) },
  });
  return [{ ...model, byId: { ...model.byId, [id]: next } }, [{ type: 'text', id }]];
}
