import { describe, expect, it } from 'vitest';

import type { OgLine } from '../src/og/highlight';
import { OVERFLOW_ROWS, VISIBLE_ROWS, toPanelRows } from '../src/og/panel';

const line = (...contents: string[]): OgLine =>
  contents.map((content) => ({ content, color: '#E6F0FF' }));
const text = (lines: OgLine[], limit?: number) =>
  toPanelRows(lines, limit).map((row) => row.tokens.map((token) => token.content).join(''));

describe('toPanelRows', () => {
  /**
   * The panel does not wrap — it clips, like the editor it imitates. A long
   * line stays one row and runs off the right edge, because reflowing it into
   * a continuation indent read as damage.
   */
  it('keeps a long line as a single row', () => {
    const long = 'const somethingRatherLong = anotherThingEntirely + oneMoreForGoodMeasure;';
    expect(text([line(long)])).toEqual([long]);
  });

  it('preserves tokens and their order untouched', () => {
    expect(text([line('import { useAnnotation } ', "from '@embedpdf/x/react'")])).toEqual([
      "import { useAnnotation } from '@embedpdf/x/react'",
    ]);
  });

  it('numbers rows from one, for the gutter', () => {
    expect(toPanelRows([line('a'), line('b'), line('c')]).map((r) => r.lineNumber)).toEqual([
      1, 2, 3,
    ]);
  });

  it('keeps a blank line as its own row', () => {
    expect(text([line('a'), [], line('b')])).toEqual(['a', '', 'b']);
  });

  it('draws past the visible rows so the fade has code under it', () => {
    const many = Array.from({ length: 40 }, (_, index) => line(`line ${index}`));
    expect(text(many)).toHaveLength(OVERFLOW_ROWS);
    expect(OVERFLOW_ROWS).toBeGreaterThan(VISIBLE_ROWS);
  });
});
