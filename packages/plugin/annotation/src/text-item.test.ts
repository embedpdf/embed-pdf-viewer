import { describe, expect, it } from 'vitest';
import {
  initialModel,
  update,
  type Annot,
  type AnnotationFlags,
  type Geom,
} from '@embedpdf/core-annotation';

import { buildTextItems } from './text-item';

/** The DOM text plate must sit exactly where the engine's AP generator lays
 *  the baked text, so the baked↔live swap is pixel-invisible:
 *    callout body inset = borderWidth + 2 (`kCalloutTextPadding`)
 *    plain free-text body inset = borderWidth (two half-width deflates)
 *  (cpdf_generateap.cpp, GenerateFreeTextAP — both branches). */

const PON = 1;
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

const freeText = (id: string, geom: Extract<Geom, { t: 'text' }>, strokeWidth: number): Annot => ({
  id,
  ref: null,
  pon: PON,
  subtype: 'freeText',
  geom,
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
  it('callout padding = strokeWidth + 2; plain free-text padding = strokeWidth', () => {
    const callout = freeText(
      'C1',
      {
        t: 'text',
        rect: { x: 200, y: 100, width: 120, height: 40 },
        callout: { tip: { x: 40, y: 60 }, knee: { x: 120, y: 120 }, ending: 'open-arrow' },
      },
      6,
    );
    const plain = freeText('P1', { t: 'text', rect: { x: 10, y: 10, width: 80, height: 30 } }, 3);
    let m = update(initialModel, { t: 'loaded', annots: [callout, plain] })[0];
    // textBoxes only emits LIVE text — edit each in turn.
    m = update(m, { t: 'beginTextEdit', id: 'C1' })[0];
    const [c] = buildTextItems(m, PON);
    expect(c!.id).toBe('C1');
    expect(c!.css.padding).toBe(8); // 6 + kCalloutTextPadding(2)

    m = update(m, { t: 'endTextEdit' })[0];
    m = update(m, { t: 'beginTextEdit', id: 'P1' })[0];
    const [p] = buildTextItems(m, PON);
    expect(p!.id).toBe('P1');
    expect(p!.css.padding).toBe(3); // border width, no extra padding
  });
});
