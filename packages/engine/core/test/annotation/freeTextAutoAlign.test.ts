/**
 * A free text's `textAlign: 'auto'`: the text's first strong character
 * decides its alignment and direction, in a create and an update.
 */
import { describe, expect, test } from 'vitest';

import type { Annotation, AnnotationDraft, AnnotationPatch } from '../../src/annotation/kinds';
import { pdfPredictAnnotationDraft } from '../../src/annotation/resolve/resolveAnnotationDraft';
import { pdfPredictAnnotationPatch } from '../../src/annotation/resolve/resolveAnnotationPatch';
import { DEFAULT_RICH_TEXT_BODY, textDirectionOf } from '../../src/dto/RichText';
import type { PdfCoordinates } from '../../src/pageSpace/coordinates';

type Read = Record<string, any>;

const draftOf = (fields: Record<string, unknown>) =>
  pdfPredictAnnotationDraft({
    subtype: 'free-text',
    box: { left: 0, bottom: 0, right: 100, top: 20 },
    ...fields,
  } as unknown as AnnotationDraft<PdfCoordinates>) as Read;

const box = (text: string) =>
  ({
    ref: { kind: 'objectNumber', page: { kind: 'objectNumber', objectNumber: 3 }, objectNumber: 9 },
    page: { kind: 'objectNumber', objectNumber: 3 },
    subtype: 'free-text',
    intent: 'free-text',
    box: { left: 0, bottom: 0, right: 100, top: 20 },
    contents: text,
    richText: {
      body: { ...DEFAULT_RICH_TEXT_BODY, size: 14 },
      paragraphs: [{ runs: [{ text }] }],
    },
    fontSize: 14,
    fontColor: '#000000',
    textAlign: 'left',
    calloutLine: null,
  }) as unknown as Annotation<PdfCoordinates>;

const patchOf = (current: Annotation<PdfCoordinates>, fields: Record<string, unknown>) =>
  pdfPredictAnnotationPatch(current, {
    subtype: 'free-text',
    ...fields,
  } as AnnotationPatch<PdfCoordinates>) as Read;

describe('textDirectionOf', () => {
  test('the first strong character decides', () => {
    expect(textDirectionOf('שלום world')).toBe('rtl');
    expect(textDirectionOf('hello עולם')).toBe('ltr');
    expect(textDirectionOf('12. مرحبا')).toBe('rtl');
    // Points and digits are not strong.
    expect(textDirectionOf('3 ְִבְּרֵאשִׁית')).toBe('rtl');
    expect(textDirectionOf('123 !?')).toBeNull();
    expect(textDirectionOf('')).toBeNull();
  });
});

describe("free text textAlign 'auto'", () => {
  test('right-to-left text is created right-aligned, rtl', () => {
    const draft = draftOf({ contents: '42 שלום', textAlign: 'auto' });
    expect(draft.textAlign).toBe('right');
    expect(draft.richText.body.align).toBe('right');
    expect(draft.richText.body.dir).toBe('rtl');
    expect(draft.contents).toBe('42 שלום');
  });

  test('left-to-right or letterless text is created left-aligned, ltr', () => {
    for (const contents of ['Hello שלום', '123']) {
      const draft = draftOf({ contents, textAlign: 'auto' });
      expect(draft.textAlign).toBe('left');
      expect(draft.richText.body.align).toBe('left');
      expect(draft.richText.body.dir).toBe('ltr');
    }
  });

  test('rich text keeps its body, with the direction over it', () => {
    const draft = draftOf({
      textAlign: 'auto',
      fontSize: 18,
      richText: {
        body: { color: '#ff0000' },
        paragraphs: [{ runs: [{ text: 'مرحبا' }] }],
      },
    });
    expect(draft.richText.body).toMatchObject({
      color: '#ff0000',
      size: 18,
      align: 'right',
      dir: 'rtl',
    });
  });

  test('an update follows the new text', () => {
    const patch = patchOf(box('Hello'), { contents: 'שלום\nעולם', textAlign: 'auto' });
    expect(patch.textAlign).toBe('right');
    expect(patch.richText.body).toMatchObject({ size: 14, align: 'right', dir: 'rtl' });
    expect(patch.richText.paragraphs).toHaveLength(2);
    expect(patch.contents).toBe('שלום\nעולם');
  });

  test('an update without new text follows the current text', () => {
    const patch = patchOf(box('שלום'), { textAlign: 'auto' });
    expect(patch.textAlign).toBe('right');
    expect(patch.richText.body).toMatchObject({ size: 14, dir: 'rtl' });
    expect(patch.richText.paragraphs[0].runs[0].text).toBe('שלום');
  });
});
