import { describe, expect, it } from 'vitest';

import { zoomBoxPaint } from '../src/zoom-box';

describe('zoomBoxPaint', () => {
  it("follows the viewer's accent until a color is set, the fill at 8%", () => {
    expect(zoomBoxPaint({ fill: null, stroke: null }, '#3858e9')).toEqual({
      fill: 'var(--epdf-zoom-box-fill, color-mix(in srgb, var(--epdf-accent, #3858e9) 8%, transparent))',
      stroke: 'var(--epdf-zoom-box-stroke, var(--epdf-accent, #3858e9))',
    });
  });

  it('paints a set color, which its own variable still wins over', () => {
    expect(zoomBoxPaint({ fill: 'rgb(0 0 0 / 0.1)', stroke: '#e91e63' }, '#3858e9')).toEqual({
      fill: 'var(--epdf-zoom-box-fill, rgb(0 0 0 / 0.1))',
      stroke: 'var(--epdf-zoom-box-stroke, var(--epdf-accent, #e91e63))',
    });
  });
});
