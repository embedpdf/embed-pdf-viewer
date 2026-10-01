import type { Annotation } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { calloutShape, textBoxFamily } from '../../src/shapes/text-box';

const BOX = { x: 200, y: 100, width: 120, height: 40 };
const TIP = { x: 40, y: 60 };
const KNEE = { x: 120, y: 120 };
// Where another writer put the end: on the box's left side, not its middle.
const STORED_END = { x: 200, y: 110 };

const freeText = (fields: Record<string, unknown>) =>
  ({
    subtype: 'free-text',
    rect: BOX,
    box: BOX,
    rotation: null,
    intent: 'free-text',
    ...fields,
  }) as unknown as Extract<Annotation, { subtype: 'free-text' }>;

const callout = freeText({
  intent: 'free-text-callout',
  calloutLine: [TIP, KNEE, STORED_END],
  lineEnding: 'open-arrow',
});

describe('the text box family reads and writes the engine fields', () => {
  it("a callout's line is read as stored, end and all, and written back unchanged", () => {
    const shape = textBoxFamily.read(callout);
    expect(shape).toEqual({
      kind: 'text-box',
      box: BOX,
      rotation: 0,
      calloutLine: [TIP, KNEE, STORED_END],
      lineEnding: 'open-arrow',
    });
    expect(textBoxFamily.write(shape, 'free-text')).toEqual({
      box: BOX,
      rotation: null,
      calloutLine: [TIP, KNEE, STORED_END],
      lineEnding: 'open-arrow',
    });
  });

  it('a plain text box has no line, and writes none', () => {
    const shape = textBoxFamily.read(freeText({ calloutLine: [TIP, STORED_END] }));
    expect(shape.calloutLine).toBeNull();
    expect(textBoxFamily.write(shape, 'free-text')).toEqual({ box: BOX, rotation: null });
  });
});

describe("a callout's end follows its box", () => {
  it('a move carries the whole line with the box', () => {
    const moved = textBoxFamily.translate(textBoxFamily.read(callout), { x: 10, y: 5 });
    expect(moved.box).toEqual({ ...BOX, x: 210, y: 105 });
    expect(moved.calloutLine).toEqual([
      { x: 50, y: 65 },
      { x: 130, y: 125 },
      { x: 210, y: 115 },
    ]);
  });

  it('a resize puts the end on the middle of the side the knee faces', () => {
    const resized = textBoxFamily.drag(textBoxFamily.read(callout), 'se', { x: 340, y: 160 });
    expect(resized.box).toEqual({ x: 200, y: 100, width: 140, height: 60 });
    expect(resized.calloutLine![2]).toEqual({ x: 200, y: 130 });
  });

  it('a tip drag on a straight line moves the end to the side the tip now faces', () => {
    const straight = calloutShape(BOX, 0, TIP, undefined, 'open-arrow');
    expect(straight.calloutLine).toEqual([TIP, { x: 200, y: 120 }]);
    const dragged = textBoxFamily.drag(straight, 'callout-tip', { x: 260, y: 0 });
    expect(dragged.calloutLine).toEqual([
      { x: 260, y: 0 },
      { x: 260, y: 100 },
    ]);
  });
});
