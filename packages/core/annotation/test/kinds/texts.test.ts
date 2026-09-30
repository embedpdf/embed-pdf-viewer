import { annotationOfDraft, toPageRef, type AnnotationDraft } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { textOf } from '../../src/record';

const PAGE = toPageRef(1);
const BOX = { x: 100, y: 200, width: 80, height: 40 };

/** The annotation the engine reads back after creating `draft`. */
const created = (draft: Record<string, unknown>) =>
  annotationOfDraft(draft as unknown as AnnotationDraft, {
    ref: { kind: 'nm', page: PAGE, nm: 'test' },
    index: 0,
    rect: BOX,
  });

describe('how each kind sets its text', () => {
  it("a free text's text is its rich body: bold, italic, underline read off it", () => {
    const freeText = created({
      subtype: 'free-text',
      box: BOX,
      contents: 'hi',
      fontFamily: 'helvetica',
      fontSize: 14,
      fontColor: '#112233',
      textAlign: 'justify',
    });
    const body = freeText.subtype === 'free-text' ? freeText.richText.body : undefined;
    expect(textOf(freeText)).toEqual({
      fontFamily: 'helvetica',
      fontSize: 14,
      fontColor: '#112233',
      // The editor has no justify: it shows left-aligned.
      textAlign: 'left',
    });
    const bold = {
      ...freeText,
      richText: { body: { ...body!, weight: 700, decoration: ['underline'] }, paragraphs: [] },
    } as typeof freeText;
    expect(textOf(bold)).toMatchObject({ bold: true, underline: true });
    expect(textOf(bold)).not.toHaveProperty('italic');
  });

  it('a form field fills in its font, size and colour; a kind without text has none', () => {
    const field = created({ subtype: 'widget', rect: BOX });
    expect(textOf({ ...field, fieldFamily: 'text' } as typeof field)).toMatchObject({
      fontFamily: 'helvetica',
      fontSize: 0,
      fontColor: '#000000',
    });
    expect(textOf(created({ subtype: 'square', box: BOX }))).toBeUndefined();
  });

  it("a redaction's label is set like free text", () => {
    const redaction = created({
      subtype: 'redact',
      rect: BOX,
      fontFamily: 'courier',
      fontSize: 0,
      fontColor: '#ff0000',
      textAlign: 'center',
    });
    expect(textOf(redaction)).toEqual({
      fontFamily: 'courier',
      fontSize: 0,
      fontColor: '#ff0000',
      textAlign: 'center',
    });
  });
});
