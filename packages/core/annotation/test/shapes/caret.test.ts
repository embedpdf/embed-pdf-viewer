import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

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

  it('is hit anywhere in its box, plus the margin', () => {
    const shape = caretFamily.read(caret(0));
    expect(caretFamily.hit(shape, { x: 97, y: 56 }, 0, false, { strokeWidth: 0 })).toBe(true);
    expect(caretFamily.hit(shape, { x: 102, y: 56 }, 1, false, { strokeWidth: 0 })).toBe(false);
    expect(caretFamily.hit(shape, { x: 102, y: 56 }, 2, false, { strokeWidth: 0 })).toBe(true);
  });
});
