import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { paintedNear } from '../../src/painted';
import { caretFamily } from '../../src/shapes/caret';

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
    const shape = caretFamily.read(caret(270));
    expect(shape).toEqual({ kind: 'caret', box: BOX, rotation: 270 });
    expect(caretFamily.write(shape, 'caret')).toEqual({ box: BOX, rotation: 270 });
    expect(caretFamily.write(caretFamily.read(caret(null)), 'caret')).toEqual({
      box: BOX,
      rotation: null,
    });
  });

  it('paints its whole box: hit anywhere in it, and within the margin of its edge', () => {
    const pieces = caretFamily.painted(caretFamily.read(caret(0)), { strokeWidth: 0 }, false);
    expect(paintedNear(pieces, { x: 97, y: 56 }, 0)).toBe(true);
    expect(paintedNear(pieces, { x: 102, y: 56 }, 1)).toBe(false);
    expect(paintedNear(pieces, { x: 102, y: 56 }, 2)).toBe(true);
    // The margin reaches as far every way: 1.5 past two sides is 2.1 from the corner.
    expect(paintedNear(pieces, { x: 101.5, y: 60.5 }, 2)).toBe(false);
    expect(paintedNear(pieces, { x: 101.5, y: 60.5 }, 2.2)).toBe(true);
  });
});
