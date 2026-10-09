import { measureFromKnownLength, toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { endingNodes } from '../../src/endings';
import { DRAWN_FLAGS } from '../../src/flags';
import { paintedOf } from '../../src/hit';
import { distanceLayout, measurementOf } from '../../src/measurement';
import { paintedNear } from '../../src/painted';
import { shapeOf } from '../../src/record';
import { rectFromPoints, segDist } from '../../src/rect';
import { calloutShape } from '../../src/shapes/text-box';
import type { Message, Point, Rect, Shape, Style } from '../../src/types';
import { annotsInBox, selectionInBox } from '../../src/update';
import { answering, modelWith, named, recordOf, run, STYLE } from '../support';

const PAGE = toPageRef(1);
const SQUARE = { x: 100, y: 100, width: 100, height: 60 };

const recordNamed = (
  name: string,
  subtype: string,
  geometry: Shape,
  style: Partial<Style> = {},
  more: Partial<Parameters<typeof recordOf>[0]> = {},
) =>
  recordOf({
    ...named(name, PAGE),
    page: PAGE,
    subtype,
    geometry,
    style: { ...STYLE, ...style },
    flags: DRAWN_FLAGS,
    source: 'vector',
    ...more,
  });

const square = (name: string, box = SQUARE, style: Partial<Style> = {}, rotation = 0) =>
  recordNamed(name, 'square', { kind: 'box', box, rotation, ellipse: false }, style);

describe('the marquee touches what an annotation paints', () => {
  const ids = (...names: string[]) => names.map((name) => named(name, PAGE).id);

  it('an unfilled square is caught on its border, not in its empty middle; a filled one anywhere in it', () => {
    const model = modelWith([
      square('open'),
      square('filled', { ...SQUARE, x: 300 }, { interiorColor: '#eeeeee' }),
    ]);
    expect(
      annotsInBox(model, PAGE, rectFromPoints({ x: 130, y: 120 }, { x: 170, y: 140 })),
    ).toEqual([]);
    expect(annotsInBox(model, PAGE, rectFromPoints({ x: 90, y: 120 }, { x: 105, y: 140 }))).toEqual(
      ids('open'),
    );
    expect(
      annotsInBox(model, PAGE, rectFromPoints({ x: 330, y: 120 }, { x: 370, y: 140 })),
    ).toEqual(ids('filled'));
  });

  it('a turned square is caught where its turned border is', () => {
    const model = modelWith([square('turned', SQUARE, {}, 45)]);
    // The middle of the turned square: empty.
    expect(
      annotsInBox(model, PAGE, rectFromPoints({ x: 140, y: 120 }, { x: 160, y: 140 })),
    ).toEqual([]);
    // The corner of the turned square's bounds, x 93.4.., y 73.4..: empty, as each corner is.
    expect(annotsInBox(model, PAGE, rectFromPoints({ x: 94, y: 74 }, { x: 98, y: 78 }))).toEqual(
      [],
    );
    // Across the middle, reaching the border on both sides.
    expect(annotsInBox(model, PAGE, rectFromPoints({ x: 60, y: 125 }, { x: 240, y: 135 }))).toEqual(
      ids('turned'),
    );
  });

  it("a diagonal line is caught on its ink, not in its bounds' empty corners; an arrowhead alone catches it", () => {
    const line = recordNamed('line', 'line', {
      kind: 'line',
      linePoints: { start: { x: 100, y: 100 }, end: { x: 200, y: 200 } },
      lineEndings: { start: 'none', end: 'open-arrow' },
      rotation: 0,
    });
    const model = modelWith([line]);
    expect(
      annotsInBox(model, PAGE, rectFromPoints({ x: 170, y: 105 }, { x: 195, y: 130 })),
    ).toEqual([]);
    expect(
      annotsInBox(model, PAGE, rectFromPoints({ x: 145, y: 145 }, { x: 155, y: 155 })),
    ).toEqual(ids('line'));
    // The end of one barb of the open arrow at (200,200), clear of the line itself.
    const [arrow] = endingNodes({ x: 200, y: 200 }, Math.PI / 4, 'open-arrow', STYLE.strokeWidth);
    const barb = arrow!.kind === 'poly' ? arrow.points[0]! : { x: 0, y: 0 };
    expect(segDist(barb, { x: 100, y: 100 }, { x: 200, y: 200 })).toBeGreaterThan(2);
    const atBarb = rectFromPoints(
      { x: barb.x - 0.5, y: barb.y - 0.5 },
      { x: barb.x + 0.5, y: barb.y + 0.5 },
    );
    expect(annotsInBox(model, PAGE, atBarb)).toEqual(ids('line'));
  });

  it("a callout is caught on its line alone, not in its frame's empty space", () => {
    const callout = recordNamed(
      'callout',
      'free-text',
      calloutShape(
        { x: 200, y: 100, width: 120, height: 40 },
        0,
        { x: 40, y: 60 },
        { x: 120, y: 120 },
        'open-arrow',
      ),
    );
    const model = modelWith([callout]);
    expect(annotsInBox(model, PAGE, rectFromPoints({ x: 76, y: 86 }, { x: 84, y: 94 }))).toEqual(
      ids('callout'),
    );
    expect(annotsInBox(model, PAGE, rectFromPoints({ x: 50, y: 120 }, { x: 70, y: 135 }))).toEqual(
      [],
    );
  });

  it('a distance measurement is caught on its caption alone', () => {
    const distance = recordNamed(
      'distance',
      'line',
      {
        kind: 'line',
        linePoints: { start: { x: 40, y: 100 }, end: { x: 240, y: 100 } },
        lineEndings: { start: 'closed-arrow', end: 'closed-arrow' },
        rotation: 0,
      },
      {},
      {
        measure: {
          intent: 'line-dimension',
          measure: measureFromKnownLength(100, { value: 2, unit: 'm' }),
          captionEnabled: true,
          captionPosition: 'top',
          captionOffset: null,
          leader: { length: 12, extension: 5 },
          contents: 'stored',
        },
      },
    );
    const model = modelWith([distance]);
    const measure = measurementOf(distance.annotation)!;
    const layout = distanceLayout(
      shapeOf(distance.annotation),
      measure as never,
      STYLE.strokeWidth,
    )!;
    const caption = layout.caption!;
    // A small box in the caption's middle, clear of every line.
    const middle = caption.center;
    const inside = rectFromPoints(
      { x: middle.x - 1, y: middle.y - 1 },
      { x: middle.x + 1, y: middle.y + 1 },
    );
    const lines = paintedOf(distance).filter(
      (piece) => piece.kind === 'stroke' && piece.halfWidth > 0,
    );
    expect(paintedNear(lines, middle, 1)).toBe(false);
    expect(annotsInBox(model, PAGE, inside)).toEqual(ids('distance'));
  });

  it('a screen-anchored note is caught where it shows at the view, not where it is stored', () => {
    const note = recordNamed(
      'note',
      'text',
      { kind: 'box', box: { x: 100, y: 100, width: 20, height: 20 }, rotation: 0, ellipse: false },
      {},
      { flags: { ...DRAWN_FLAGS, noZoom: true, noRotate: true } },
    );
    const model = modelWith([note]);
    // At 200%, the icon shows at half its stored size, from its top-left corner.
    const storedCorner = rectFromPoints({ x: 115, y: 115 }, { x: 118, y: 118 });
    expect(annotsInBox(model, PAGE, storedCorner)).toEqual(ids('note'));
    expect(annotsInBox(model, PAGE, storedCorner, undefined, { zoom: 2, rotation: 0 })).toEqual([]);
    expect(
      annotsInBox(model, PAGE, rectFromPoints({ x: 102, y: 102 }, { x: 104, y: 104 }), undefined, {
        zoom: 2,
        rotation: 0,
      }),
    ).toEqual(ids('note'));
  });

  it('an inert annotation is not caught', () => {
    const model = modelWith([square('open')]);
    const border = rectFromPoints({ x: 90, y: 120 }, { x: 105, y: 140 });
    expect(annotsInBox(model, PAGE, border, new Set(ids('open')))).toEqual([]);
  });
});

describe('what a box selects', () => {
  it('takes the rest of the group of an annotation it touches', () => {
    const primary = square('primary');
    const member = recordNamed(
      'member',
      'square',
      { kind: 'box', box: { ...SQUARE, x: 300 }, rotation: 0, ellipse: false },
      {},
      { annotation: answering(named('primary', PAGE).ref, 'group') },
    );
    const model = modelWith([primary, member]);
    const memberBorder = rectFromPoints({ x: 290, y: 120 }, { x: 305, y: 140 });
    expect(annotsInBox(model, PAGE, memberBorder)).toEqual([named('member', PAGE).id]);
    expect(new Set(selectionInBox(model, PAGE, memberBorder))).toEqual(
      new Set([named('primary', PAGE).id, named('member', PAGE).id]),
    );
  });

  it('is what the marquee gesture selects', () => {
    const model = modelWith([
      square('open'),
      square('filled', { ...SQUARE, x: 300 }, { interiorColor: '#eeeeee' }),
    ]);
    const pointer = (phase: 'down' | 'move' | 'up', point: Point): Message => ({
      type: 'marqueePointer',
      phase,
      in: { page: PAGE, point, shift: false },
    });
    const from = { x: 90, y: 120 };
    const to = { x: 340, y: 140 };
    const after = run(model, [pointer('down', from), pointer('move', to), pointer('up', to)]);
    expect(after.selected).toEqual(selectionInBox(model, PAGE, rectFromPoints(from, to)));
    expect(after.selected.length).toBe(2);
  });
});

describe('a marquee of no size catches what a click with no margin hits', () => {
  const fixtures = [
    square('open'),
    square('turned', SQUARE, { interiorColor: '#eeeeee' }, 30),
    recordNamed(
      'callout',
      'free-text',
      calloutShape(
        { x: 200, y: 100, width: 120, height: 40 },
        0,
        { x: 40, y: 60 },
        { x: 120, y: 120 },
        'closed-arrow',
      ),
    ),
    recordNamed(
      'ink',
      'ink',
      {
        kind: 'ink',
        inkList: [
          [
            { x: 60, y: 60 },
            { x: 120, y: 180 },
            { x: 200, y: 90 },
          ],
        ],
        rotation: 0,
      },
      { strokeWidth: 6 },
    ),
  ];

  it.each(fixtures.map((record) => [record.id, record] as const))('%s', (_id, record) => {
    const model = modelWith([record]);
    const pieces = paintedOf(record);
    for (let x = 30; x < 340; x += 2.37)
      for (let y = 30; y < 220; y += 2.41) {
        const point = { x, y };
        const box: Rect = { x, y, width: 0, height: 0 };
        expect(annotsInBox(model, PAGE, box).length === 1).toBe(paintedNear(pieces, point, 0));
      }
  });
});
