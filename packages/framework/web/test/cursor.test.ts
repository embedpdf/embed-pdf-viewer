import { describe, expect, it } from 'vitest';

import { svgCursor, toolCursorsOf } from '../src/cursor';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"></svg>';

describe('toolCursorsOf', () => {
  it('keeps a CSS cursor as it is', () => {
    expect(toolCursorsOf({ crosshair: 'cell', text: 'url(pen.png) 4 4, text' })).toEqual({
      crosshair: 'cell',
      text: 'url(pen.png) 4 4, text',
    });
  });

  it('turns an SVG into its cursor, falling back to the keyword it replaces', () => {
    expect(toolCursorsOf({ crosshair: { svg, hotspot: { x: 2, y: 22 } } })).toEqual({
      crosshair: svgCursor({ svg, hotspot: { x: 2, y: 22 }, fallback: 'crosshair' }),
    });
  });

  it("keeps an SVG's own fallback", () => {
    expect(toolCursorsOf({ text: { svg, fallback: 'copy' } })).toEqual({
      text: svgCursor({ svg, fallback: 'copy' }),
    });
  });
});
