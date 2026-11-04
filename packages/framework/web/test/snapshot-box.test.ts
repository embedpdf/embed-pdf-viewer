import { describe, expect, it } from 'vitest';

import { snapshotBoxPaint } from '../src/snapshot-box';

describe('snapshotBoxPaint', () => {
  it("follows the viewer's accent until a color is set, the fill at 8%", () => {
    expect(snapshotBoxPaint({ fill: null, stroke: null }, '#3858e9')).toEqual({
      fill: 'var(--epdf-snapshot-box-fill, color-mix(in srgb, var(--epdf-accent, #3858e9) 8%, transparent))',
      stroke: 'var(--epdf-snapshot-box-stroke, var(--epdf-accent, #3858e9))',
    });
  });

  it('paints a set color, which its own variable still wins over', () => {
    expect(snapshotBoxPaint({ fill: 'rgb(0 0 0 / 0.1)', stroke: '#e91e63' }, '#3858e9')).toEqual({
      fill: 'var(--epdf-snapshot-box-fill, rgb(0 0 0 / 0.1))',
      stroke: 'var(--epdf-snapshot-box-stroke, var(--epdf-accent, #e91e63))',
    });
  });
});
