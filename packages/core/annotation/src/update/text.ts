/**
 * Free-text typing: the editor's plain or rich result becomes the record's
 * text at once, and a `text` effect asks for the (debounced) engine write.
 */
import { DEFAULT_RICH_TEXT_BODY, type RichTextDocumentInput } from '@embedpdf/engine-core/runtime';

import { normalizeRuns, paragraphsFromPlainText, plainTextOf } from '../richtext';
import type { Effect, Id, Model } from '../types';

/** Apply the editor's plain text. Updates `contents` on the record's
 *  annotation and flips the box to `vector` so the live text shows. The `text`
 *  effect asks for the write; the plugin waits for a pause in typing before it runs. */
export function setText(model: Model, id: Id, text: string): [Model, Effect[]] {
  const record = model.byId[id];
  if (!record) return [model, []];
  // The rich projection follows plain text: body-style paragraphs, one per
  // line break, so an editor rendering `richText` shows what was typed; and
  // `contents` is their plain projection, as the engine reads it back.
  const paragraphs = paragraphsFromPlainText(text);
  const annotation =
    record.annotation.subtype === 'free-text'
      ? {
          ...record.annotation,
          contents: plainTextOf({ paragraphs }),
          richText: { ...record.annotation.richText, paragraphs },
        }
      : { ...record.annotation, contents: text };
  return [
    { ...model, byId: { ...model.byId, [id]: { ...record, annotation } } },
    [{ type: 'text', id }],
  ];
}

/** Apply the editor's rich document, like `setText`, as the engine does: a
 *  body it gives is replaced whole over the defaults, and without one the
 *  annotation's body is kept; `contents` is the projection. */
export function setRichText(model: Model, id: Id, doc: RichTextDocumentInput): [Model, Effect[]] {
  const record = model.byId[id];
  if (!record || record.annotation.subtype !== 'free-text') return [model, []];
  const normalized = normalizeRuns(doc);
  const richText = {
    body: normalized.body
      ? { ...DEFAULT_RICH_TEXT_BODY, ...normalized.body }
      : record.annotation.richText.body,
    paragraphs: normalized.paragraphs,
  };
  const next = {
    ...record,
    annotation: { ...record.annotation, richText, contents: plainTextOf(richText) },
  };
  return [{ ...model, byId: { ...model.byId, [id]: next } }, [{ type: 'text', id }]];
}
