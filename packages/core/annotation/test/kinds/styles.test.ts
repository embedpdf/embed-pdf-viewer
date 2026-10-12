import { quadFromRect } from '@embedpdf/core-geometry';
import { annotationOfDraft, toPageRef, type AnnotationDraft } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { dashOf } from '../../src/kinds/styles';
import { styleOf } from '../../src/record';
import type { Style } from '../../src/types';

const PAGE = toPageRef(1);
const BOX = { x: 100, y: 200, width: 80, height: 40 };

/** The annotation the engine reads back after creating `draft`. */
const created = (draft: Record<string, unknown>) =>
  annotationOfDraft(draft as unknown as AnnotationDraft, {
    ref: { kind: 'objectNumber', page: PAGE, objectNumber: 1 },
    rect: BOX,
  });

describe('how each kind is drawn', () => {
  it('a stroked kind reads its stroke, fill and border by the engine names', () => {
    const square = created({
      subtype: 'square',
      box: BOX,
      color: '#ff0000',
      interiorColor: '#00ff00',
      strokeWidth: 3,
      opacity: 0.5,
      cloudyIntensity: 2,
    });
    expect(styleOf(square)).toMatchObject({
      color: '#ff0000',
      interiorColor: '#00ff00',
      strokeWidth: 3,
      opacity: 0.5,
      cloudyIntensity: 2,
    });
    const ink = created({ subtype: 'ink', inkList: [[{ x: 0, y: 0 }]], borderStyle: 'dashed' });
    expect(styleOf(ink)).toMatchObject({ interiorColor: null, borderStyle: 'dashed' });
  });

  it("each kind fills in what it doesn't keep", () => {
    const quad = quadFromRect(BOX);
    const highlight = created({ subtype: 'highlight', rect: BOX, quadPoints: [quad] });
    const caret = created({ subtype: 'caret', box: BOX });
    const redaction = created({ subtype: 'redact', rect: BOX });
    const stamp = created({ subtype: 'stamp', box: BOX, opacity: 0.4 });
    // A highlight's marks follow the line height: it strokes nothing itself.
    expect(styleOf(highlight).strokeWidth).toBe(0);
    expect(styleOf(caret).strokeWidth).toBe(1);
    expect(styleOf(redaction).strokeWidth).toBe(1.5);
    // A stamp's drawing is its appearance: its opacity is all the style it has.
    expect(styleOf(stamp)).toMatchObject({ opacity: 0.4, cloudyIntensity: null });
  });

  it('a border draws its own dash, the default one, or none under a cloud', () => {
    const style = (fields: Partial<Style>): Style => ({
      color: '#000000',
      interiorColor: null,
      strokeWidth: 1,
      opacity: 1,
      blendMode: 'normal',
      borderStyle: 'solid',
      dashArray: null,
      cloudyIntensity: null,
      ...fields,
    });
    expect(dashOf(style({}))).toBeUndefined();
    expect(dashOf(style({ borderStyle: 'dashed', dashArray: [4, 2] }))).toEqual([4, 2]);
    expect(dashOf(style({ borderStyle: 'dashed' }))).toEqual([3, 3]);
    expect(dashOf(style({ borderStyle: 'dashed', cloudyIntensity: 1 }))).toBeUndefined();
  });
});
