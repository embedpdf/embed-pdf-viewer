/**
 * Where a mark goes in a field's box, as the engine draws it: fitted whole and centred in a
 * signature field's frame; inside an image field's border (twice its width when the border is
 * beveled or inset); turned with a turned field.
 */
import { describe, expect, it } from 'vitest';

import { markPlaceIn } from '../src/tools/mark-place';

const box = { x: 10, y: 20, width: 200, height: 50 };
const look = (borderWidth: number, borderStyle: 'solid' | 'beveled' | 'inset' = 'solid') => ({
  border: '#6b7280',
  borderWidth,
  borderStyle,
  background: null,
  color: null,
  fontFamily: null,
  fontSize: null,
  textAlign: 'left' as const,
});

describe('where a mark goes in a field', () => {
  it('a signature field takes it whole into its frame, centred', () => {
    // Two to one in 200 × 50: 100 × 50, in the middle.
    expect(
      markPlaceIn(
        { box, rotation: 0, look: look(2), control: 'signature' },
        { width: 2, height: 1 },
      ),
    ).toEqual({ box: { x: 60, y: 20, width: 100, height: 50 }, rot: 0 });
    // Taller than the box's shape: as high as the box, centred across it.
    expect(
      markPlaceIn(
        { box, rotation: 0, look: look(1), control: 'signature' },
        { width: 1, height: 1 },
      )?.box,
    ).toEqual({ x: 85, y: 20, width: 50, height: 50 });
  });

  it('an image field keeps it inside its border, twice the width for a shaded one', () => {
    // 1 pt border: 198 × 48 inside, the mark 96 × 48 in the middle.
    expect(
      markPlaceIn({ box, rotation: 0, look: look(1), control: 'image' }, { width: 2, height: 1 })
        ?.box,
    ).toEqual({ x: 62, y: 21, width: 96, height: 48 });
    // Beveled 1 pt: 2 pt in from each side.
    expect(
      markPlaceIn(
        { box, rotation: 0, look: look(1, 'beveled'), control: 'image' },
        { width: 2, height: 1 },
      )?.box,
    ).toEqual({ x: 64, y: 22, width: 92, height: 46 });
  });

  it('turns with a turned field, and has no place in a box with no room', () => {
    expect(
      markPlaceIn(
        { box, rotation: 90, look: look(1), control: 'signature' },
        { width: 2, height: 1 },
      )?.rot,
    ).toBe(90);
    expect(
      markPlaceIn(
        { box: { ...box, width: 2 }, rotation: 0, look: look(1), control: 'image' },
        { width: 2, height: 1 },
      ),
    ).toBeNull();
    expect(
      markPlaceIn(
        { box, rotation: 0, look: look(1), control: 'signature' },
        { width: 0, height: 1 },
      ),
    ).toBeNull();
  });
});
