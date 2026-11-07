/**
 * A markup annotation's comment as rich text (`/RC`, ISO 32000-2 §12.5.6.2):
 * how its `contents` and `richText` follow each other in a create and an
 * update, the rule free text's text follows too.
 */
import { describe, expect, test } from 'vitest';

import type { Annotation, AnnotationDraft, AnnotationPatch } from '../../src/annotation/kinds';
import { pdfPredictAnnotationDraft } from '../../src/annotation/resolve/resolveAnnotationDraft';
import { pdfPredictAnnotationPatch } from '../../src/annotation/resolve/resolveAnnotationPatch';
import { DEFAULT_RICH_TEXT_BODY, type RichTextDocument } from '../../src/dto/RichText';
import type { PdfCoordinates } from '../../src/pageSpace/coordinates';

const note = (richText: RichTextDocument | null, contents: string | null) =>
  ({
    ref: { kind: 'objectNumber', page: { kind: 'objectNumber', objectNumber: 3 }, objectNumber: 9 },
    page: { kind: 'objectNumber', objectNumber: 3 },
    subtype: 'text',
    rect: { left: 10, bottom: 10, right: 30, top: 30 },
    contents,
    richText,
    color: '#ffff00',
    opacity: 1,
    icon: 'comment',
    open: false,
    state: null,
    stateModel: null,
  }) as unknown as Annotation<PdfCoordinates>;

const BOLD_HELLO: RichTextDocument = {
  body: { ...DEFAULT_RICH_TEXT_BODY, color: '#102030' },
  paragraphs: [{ runs: [{ text: 'Hello ' }, { text: 'world', style: { weight: 700 } }] }],
};

const patchOf = (current: Annotation<PdfCoordinates>, patch: Record<string, unknown>) =>
  pdfPredictAnnotationPatch(current, {
    subtype: current.subtype,
    ...patch,
  } as AnnotationPatch<PdfCoordinates>) as Record<string, unknown>;

describe('a comment as rich text', () => {
  test('a create with rich text brings its contents, its plain projection', () => {
    const draft = pdfPredictAnnotationDraft({
      subtype: 'square',
      box: { left: 0, bottom: 0, right: 10, top: 10 },
      richText: { paragraphs: BOLD_HELLO.paragraphs },
    } as unknown as AnnotationDraft<PdfCoordinates>) as Record<string, unknown>;
    expect(draft.contents).toBe('Hello world');
  });

  test('new rich text brings its contents', () => {
    const patch = patchOf(note(null, 'old'), {
      richText: { paragraphs: [{ runs: [{ text: 'a' }] }, { runs: [{ text: 'b' }] }] },
    });
    expect(patch.contents).toBe('a\nb');
  });

  test('new contents on a rich comment rewrite its paragraphs and keep its body', () => {
    const patch = patchOf(note(BOLD_HELLO, 'Hello world'), { contents: 'one\ntwo' });
    // No body: the engine keeps the comment's own, as the file states it.
    expect(patch.richText).toEqual({
      paragraphs: [{ runs: [{ text: 'one' }] }, { runs: [{ text: 'two' }] }],
    });
    // As the engine writes `/Contents`: the rich text's projection.
    expect(patch.contents).toBe('one\ntwo');
  });

  test('new contents on a plain comment keep it plain', () => {
    const patch = patchOf(note(null, 'old'), { contents: 'new' });
    expect(patch).not.toHaveProperty('richText');
  });

  test('null contents clear a rich comment, and null rich text makes it plain', () => {
    expect(patchOf(note(BOLD_HELLO, 'Hello world'), { contents: null }).richText).toBeNull();
    const plain = patchOf(note(BOLD_HELLO, 'Hello world'), { richText: null });
    expect(plain.richText).toBeNull();
    expect(plain).not.toHaveProperty('contents');
  });

  test('contents and rich text given together must agree, line breaks however spelled', () => {
    const richText = { paragraphs: [{ runs: [{ text: 'a\rb' }] }, { runs: [{ text: 'c' }] }] };
    // Acrobat spells a note's breaks `\n` in /Contents and `\r` in its rich text.
    expect(patchOf(note(null, null), { contents: 'a\nb\r\nc', richText }).contents).toBe('a\nb\nc');
    expect(() => patchOf(note(null, null), { contents: 'abc', richText })).toThrow(
      /`contents` must equal the plain projection of `richText`/,
    );
  });

  test('a free text keeps its own rule: new contents restate its whole rich text', () => {
    const freeText = {
      ...(note(BOLD_HELLO, 'Hello world') as unknown as Record<string, unknown>),
      subtype: 'free-text',
      fontFamily: 'helvetica',
      fontSize: 12,
      fontColor: '#102030',
      textAlign: 'left',
    } as unknown as Annotation<PdfCoordinates>;
    const patch = patchOf(freeText, { contents: 'plain' });
    expect((patch.richText as RichTextDocument).body).toEqual(BOLD_HELLO.body);
  });
});
