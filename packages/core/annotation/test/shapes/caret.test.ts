import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { caretHit, readCaret, writeCaret } from '../../src/shapes/caret';

const BOX = { x: 94, y: 53, width: 6, height: 6 };

const caret = (rotation: number | null) =>
  ({
    subtype: 'caret',
    rect: BOX,
    box: BOX,
    rotation,
  }) as unknown as Extract<AnnotationDTO, { subtype: 'caret' }>;

describe('the caret family', () => {
  it("a caret's shape is its engine box and turn, written back unchanged", () => {
    const shape = readCaret(caret(270));
    expect(shape).toEqual({ kind: 'caret', box: BOX, rotation: 270 });
    expect(writeCaret(shape)).toEqual({ box: BOX, rotation: 270 });
    expect(writeCaret(readCaret(caret(null)))).toEqual({ box: BOX, rotation: null });
  });

  it('is hit anywhere in its box, plus the margin', () => {
    const shape = readCaret(caret(0));
    expect(caretHit(shape, { x: 97, y: 56 }, 0)).toBe(true);
    expect(caretHit(shape, { x: 102, y: 56 }, 1)).toBe(false);
    expect(caretHit(shape, { x: 102, y: 56 }, 2)).toBe(true);
  });
});
