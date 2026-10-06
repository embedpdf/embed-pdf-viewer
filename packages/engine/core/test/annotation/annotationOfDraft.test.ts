import { describe, expect, test } from 'vitest';
import type { AnnotationRef } from '../../src/identity/AnnotationRef';
import { annotationOfDraft, resolveAnnotationDraft } from '../../src/pageSpace/helpers';

const page = { kind: 'objectNumber', objectNumber: 3 } as const;
const ref: AnnotationRef = { kind: 'objectNumber', page, objectNumber: 41 };
const box = { x: 72, y: 72, width: 120, height: 80 };

describe('annotationOfDraft', () => {
  test('a pending square: its draft, its kind’s defaults, and what the context says', () => {
    const drawn = { x: 71.5, y: 71.5, width: 121, height: 81 };
    const square = annotationOfDraft(
      { subtype: 'square', box, color: '#123456' },
      { ref, index: 4, attribution: { author: 'Ada', userId: 'u-1' }, rect: drawn },
    );
    expect(square).toMatchObject({
      subtype: 'square',
      ref,
      page,
      index: 4,
      nm: null,
      box,
      rect: drawn,
      color: '#123456',
      opacity: 1,
      strokeWidth: 1,
      borderStyle: 'solid',
      interiorColor: null,
      rotation: null,
      print: true,
      author: 'Ada',
      userId: 'u-1',
      createdAt: null,
      popup: null,
      actions: null,
    });
  });

  test("a pending free text: its rich text carries its text style; color is the border's", () => {
    const text = annotationOfDraft(
      {
        subtype: 'free-text',
        box,
        intent: 'free-text',
        fontFamily: 'times-bold',
        fontSize: 20,
        textAlign: 'center',
        color: '#0000FF',
        contents: 'One\nTwo',
      },
      { ref, index: 0 },
    );
    expect(text.subtype === 'free-text' && text.contents).toBe('One\rTwo');
    expect(text.subtype === 'free-text' && text.richText).toEqual({
      body: expect.objectContaining({
        family: 'Times',
        weight: 700,
        size: 20,
        color: '#000000',
        align: 'center',
      }),
      paragraphs: [{ runs: [{ text: 'One' }] }, { runs: [{ text: 'Two' }] }],
    });
    expect(text).toMatchObject({ color: '#0000FF', fontColor: '#000000', intent: 'free-text' });
  });

  test('a note’s standard review state brings its model; a custom one without is refused', () => {
    const note = resolveAnnotationDraft({
      subtype: 'text',
      rect: { x: 0, y: 0, width: 20, height: 20 },
      state: 'accepted',
    });
    expect(note).toMatchObject({ stateModel: 'review' });
    expect(() =>
      resolveAnnotationDraft({
        subtype: 'text',
        rect: { x: 0, y: 0, width: 20, height: 20 },
        state: 'escalated',
      }),
    ).toThrow(expect.objectContaining({ code: 'InvalidArg' }));
  });
});
