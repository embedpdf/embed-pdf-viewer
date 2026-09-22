import {
  initialModel,
  update,
  type ModelAnnotation,
  type AnnotationFlags,
  type ContentGeometry,
} from '@embedpdf/core-annotation';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { buildTextItems } from '../src/text-item';

/** The DOM text plate must sit exactly where the engine's AP generator lays
 *  the baked text, so the baked↔live swap is pixel-invisible: the box
 *  deflated by twice the border width on every side, plain box and callout
 *  alike (`FreeTextPlate` in cpdf_generateap.cpp — Acrobat's rule; see
 *  `textPlateInset` in core-annotation). */

const PON = 1;
const PAGE = toPageRef(PON);
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
  geometry: Extract<ContentGeometry, { kind: 'text' }>,
  strokeWidth: number,
): ModelAnnotation => ({
  id,
  ref: null,
  page: PAGE,
  subtype: 'freeText',
  geometry,
  style: {
    color: '#e07b39',
    interiorColor: null,
    strokeWidth,
    opacity: 1,
    blendMode: 'normal',
    border: { kind: 'solid' },
  },
  flags: FLAGS,
  source: 'baked',
});

describe('buildTextItems — text plate mirrors the AP generator', () => {
  it('the plate inset is twice the border width, callout and plain box alike', () => {
    const callout = freeText(
      'C1',
      {
        kind: 'text',
        rect: { x: 200, y: 100, width: 120, height: 40 },
        callout: { tip: { x: 40, y: 60 }, knee: { x: 120, y: 120 }, ending: 'open-arrow' },
      },
      6,
    );
    const plain = freeText(
      'P1',
      { kind: 'text', rect: { x: 10, y: 10, width: 80, height: 30 } },
      3,
    );
    let model = update(initialModel, { type: 'loaded', annots: [callout, plain] })[0];
    // textBoxes only emits live text — edit each in turn.
    model = update(model, { type: 'beginTextEdit', id: 'C1' })[0];
    const [calloutItem] = buildTextItems(model, PAGE);
    expect(calloutItem!.id).toBe('C1');
    expect(calloutItem!.css.padding).toBe(12); // 2 × 6: Acrobat's plate rule

    model = update(model, { type: 'endTextEdit' })[0];
    model = update(model, { type: 'beginTextEdit', id: 'P1' })[0];
    const [plainItem] = buildTextItems(model, PAGE);
    expect(plainItem!.id).toBe('P1');
    expect(plainItem!.css.padding).toBe(6); // 2 × 3
  });
});

describe('buildTextItems — the editor document', () => {
  it('renders paragraph alignment equal to the body as inherited', () => {
    const annotation = freeText(
      'A1',
      { kind: 'text', rect: { x: 10, y: 10, width: 80, height: 30 } },
      1,
    );
    (annotation as { text?: unknown }).text = {
      fontFamily: 'helvetica',
      fontSize: 12,
      fontColor: '#000000',
      textAlign: 'center',
    };
    (annotation as { data?: unknown }).data = {
      subtype: 'free-text',
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
    let model = update(initialModel, { type: 'loaded', annots: [annotation] })[0];
    model = update(model, { type: 'beginTextEdit', id: 'A1' })[0];
    const [item] = buildTextItems(model, PAGE);
    expect(item!.css.align).toBe('center');
    expect(item!.richText.paragraphs).toEqual([
      { runs: [{ text: 'one' }] },
      { align: 'right', runs: [{ text: 'two' }] },
    ]);
  });
});
