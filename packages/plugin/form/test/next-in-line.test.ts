/**
 * Where a field's new widget goes without a place of its own: next in line after its widgets.
 */
import { describe, expect, it } from 'vitest';

import { nextInLine } from '../src/write/next-in-line';

const PAGE = { width: 612, height: 792 };
const button = (x: number, y: number) => ({ x, y, width: 16, height: 16 });

describe('nextInLine', () => {
  it('puts the next under the only one, half its height away', () => {
    expect(nextInLine([button(72, 100)], PAGE)).toEqual(button(72, 124));
  });

  it('continues a column and a row with the step between the last two', () => {
    expect(nextInLine([button(72, 100), button(72, 130)], PAGE)).toEqual(button(72, 160));
    expect(nextInLine([button(72, 100), button(100, 100)], PAGE)).toEqual(button(128, 100));
    // Upward too: the step's direction is the group's.
    expect(nextInLine([button(72, 300), button(72, 270)], PAGE)).toEqual(button(72, 240));
  });

  it('starts a new column beside a column that reaches the page edge, at its top', () => {
    const column = [button(72, 740), button(72, 770)];
    // Next would be at 800, past 792: a new column, the gap (14) from the group's right edge.
    expect(nextInLine(column, PAGE)).toEqual(button(102, 740));
  });

  it('starts a new row under a row that reaches the page edge, at its left', () => {
    const row = [button(560, 100), button(590, 100)];
    expect(nextInLine(row, PAGE)).toEqual(button(560, 130));
  });

  it('keeps it on the page when there is no room beside the group either', () => {
    const corner = [button(590, 740), button(590, 770)];
    const next = nextInLine(corner, PAGE);
    expect(next.x + next.width).toBeLessThanOrEqual(PAGE.width);
    expect(next.y + next.height).toBeLessThanOrEqual(PAGE.height);
  });
});
