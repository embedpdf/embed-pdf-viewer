import { describe, expect, it } from 'vitest';
import {
  initialModel,
  update,
  type Annot,
  type AnnotationFlags,
  type Geom,
} from '@embedpdf/core-annotation';

import { buildTextItems } from './text-item';
import { toPageRef } from '@embedpdf/engine-core/runtime';

/** The DOM text plate must sit exactly where the engine's AP generator lays
 *  the baked text, so the baked↔live swap is pixel-invisible: the box
 *  deflated by twice the border width on every side, plain box and callout
 *  alike (`FreeTextPlate` in cpdf_generateap.cpp — Acrobat's rule, plan
 *  `2026-09-15-free-text-plate-inset.md`). */

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

const freeText = (id: string, geom: Extract<Geom, { t: 'text' }>, strokeWidth: number): Annot => ({
  id,
  ref: null,
  page: PAGE,
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
  it('the plate inset is twice the border width, callout and plain box alike', () => {
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
    const [c] = buildTextItems(m, PAGE);
    expect(c!.id).toBe('C1');
    expect(c!.css.padding).toBe(12); // 2 × 6: Acrobat's plate rule

    m = update(m, { t: 'endTextEdit' })[0];
    m = update(m, { t: 'beginTextEdit', id: 'P1' })[0];
    const [p] = buildTextItems(m, PAGE);
    expect(p!.id).toBe('P1');
    expect(p!.css.padding).toBe(6); // 2 × 3
  });
});

describe('buildTextItems — the editor document', () => {
  it('renders paragraph alignment equal to the body as inherited', () => {
    const a = freeText('A1', { t: 'text', rect: { x: 10, y: 10, width: 80, height: 30 } }, 1);
    (a as { text?: unknown }).text = {
      fontFamily: 'helvetica',
      fontSize: 12,
      fontColor: '#000000',
      textAlign: 'center',
    };
    (a as { data?: unknown }).data = {
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
    let m = update(initialModel, { t: 'loaded', annots: [a] })[0];
    m = update(m, { t: 'beginTextEdit', id: 'A1' })[0];
    const [item] = buildTextItems(m, PAGE);
    expect(item!.css.align).toBe('center');
    expect(item!.richText.paragraphs).toEqual([
      { runs: [{ text: 'one' }] },
      { align: 'right', runs: [{ text: 'two' }] },
    ]);
  });
});
