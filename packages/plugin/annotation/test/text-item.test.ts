import {
  initialModel,
  textBoxFamily,
  type ModelAnnotation,
  type AnnotationFlags,
  type Shape,
  type Model,
} from '@embedpdf/core-annotation';
import { annotationOfDraft, toPageRef, type AnnotationDraft } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { buildTextItems } from '../src/text-item';

/** The DOM text plate must sit exactly where the engine's AP generator lays
 *  the baked text, so the baked↔live swap is pixel-invisible: the box
 *  deflated by twice the border width on every side, plain box and callout
 *  alike (`FreeTextPlate` in cpdf_generateap.cpp — Acrobat's rule; see
 *  `textPlateInset` in core-annotation). */

const PON = 1;
const PAGE = toPageRef(PON);

/** These records, with `editing` in text edit (only live text becomes a text item). */
const editingIn = (records: ModelAnnotation[], editing: string): Model => ({
  ...initialModel,
  byId: Object.fromEntries(records.map((record) => [record.id, record])),
  order: records.map((record) => record.id),
  selected: [editing],
  editing,
});
const FLAGS: AnnotationFlags = {
  invisible: false,
  hidden: false,
  print: true,
  noZoom: false,
  noRotate: false,
  noView: false,
  readOnly: false,
  locked: false,
  toggleNoView: false,
  lockedContents: false,
};

const freeText = (
  id: string,
  geometry: Extract<Shape, { kind: 'text-box' }>,
  strokeWidth: number,
): ModelAnnotation => {
  const draft = {
    subtype: 'free-text',
    ...textBoxFamily.write(geometry, 'free-text'),
    intent: geometry.calloutLine ? 'free-text-callout' : 'free-text',
    contents: '',
    color: '#e07b39',
    strokeWidth,
    ...FLAGS,
  } as AnnotationDraft;
  const annotation = annotationOfDraft(draft, {
    ref: { kind: 'nm', page: PAGE, nm: id },
    index: 0,
  });
  return { id, unconfirmed: true, source: 'baked', annotation };
};

describe('buildTextItems — text plate mirrors the AP generator', () => {
  it('the plate inset is twice the border width, callout and plain box alike', () => {
    const callout = freeText(
      'C1',
      {
        kind: 'text-box',
        box: { x: 200, y: 100, width: 120, height: 40 },
        rotation: 0,
        calloutLine: [
          { x: 40, y: 60 },
          { x: 120, y: 120 },
          { x: 200, y: 120 },
        ],
        lineEnding: 'open-arrow',
      },
      6,
    );
    const plain = freeText(
      'P1',
      {
        kind: 'text-box',
        box: { x: 10, y: 10, width: 80, height: 30 },
        rotation: 0,
        calloutLine: null,
        lineEnding: null,
      },
      3,
    );
    // textBoxes only emits live text — edit each in turn.
    const [calloutItem] = buildTextItems(editingIn([callout, plain], 'C1'), PAGE);
    expect(calloutItem!.id).toBe('C1');
    expect(calloutItem!.css.padding).toBe(12); // 2 × 6: Acrobat's plate rule

    const [plainItem] = buildTextItems(editingIn([callout, plain], 'P1'), PAGE);
    expect(plainItem!.id).toBe('P1');
    expect(plainItem!.css.padding).toBe(6); // 2 × 3
  });
});

describe('buildTextItems — the editor document', () => {
  it('renders paragraph alignment equal to the body as inherited', () => {
    const record = freeText(
      'A1',
      {
        kind: 'text-box',
        box: { x: 10, y: 10, width: 80, height: 30 },
        rotation: 0,
        calloutLine: null,
        lineEnding: null,
      },
      1,
    );
    (record as { annotation?: unknown }).annotation = {
      ...record.annotation,
      textAlign: 'center',
      contents: 'one\rtwo',
      richText: {
        body: {
          family: 'Helvetica',
          weight: 400,
          italic: false,
          size: 12,
          color: '#000000',
          decoration: [],
          script: 'normal',
          letterSpacing: 0,
          horizontalScale: 1,
          align: 'center',
          dir: 'ltr',
        },
        // An echo that resolved every paragraph (older engines), and one
        // paragraph that really differs.
        paragraphs: [
          { align: 'center', dir: 'ltr', runs: [{ text: 'one' }] },
          { align: 'right', dir: 'ltr', runs: [{ text: 'two' }] },
        ],
      },
    };
    const [item] = buildTextItems(editingIn([record], 'A1'), PAGE);
    expect(item!.css.align).toBe('center');
    expect(item!.richText.paragraphs).toEqual([
      { runs: [{ text: 'one' }] },
      { align: 'right', runs: [{ text: 'two' }] },
    ]);
  });
});
