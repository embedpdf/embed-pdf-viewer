/**
 * A small annotation's handles stand out on a frame twice their grab size, so
 * each handle and the annotation between them stay reachable and visible.
 * With the default chrome geometry a grab zone is 12 wide, so the frame is 24.
 */
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { modelWith, named, recordOf, run, STYLE } from './support';
import { DRAWN_FLAGS } from '../src/flags';
import { DEFAULT_CHROME_GEOMETRY } from '../src/geometry';
import { hitTest } from '../src/hit';
import { shapeOf } from '../src/record';
import type { ChromeNode, Message, Model, ModelAnnotation, Point, Rect, Shape } from '../src/types';
import { chrome, selectionKnob } from '../src/view';

const PAGE = toPageRef(1);
const PAGE_BOX: Rect = { x: 0, y: 0, width: 600, height: 800 };
const CHROME = DEFAULT_CHROME_GEOMETRY;

const boxRecord = (name: string, box: Rect, subtype = 'widget-toggle', rotation = 0) =>
  recordOf({
    ...named(name, PAGE),
    page: PAGE,
    subtype,
    geometry: { kind: 'box', box, rotation, ellipse: false },
    style: STYLE,
    flags: DRAWN_FLAGS,
    source: 'vector',
  });

const selecting = (...records: ModelAnnotation[]): Model => ({
  ...modelWith(records),
  selected: records.map((record) => record.id),
});

const handlesOf = (nodes: ChromeNode[]) =>
  nodes.filter((node): node is Extract<ChromeNode, { kind: 'handle' }> => node.kind === 'handle');

const pointer = (phase: 'down' | 'move' | 'up', point: Point): Message => ({
  type: 'editPointer',
  phase,
  in: { page: PAGE, point, shift: false, pageBox: PAGE_BOX, chrome: CHROME },
});

const hitAt = (model: Model, point: Point) => hitTest(model, PAGE, point, CHROME, 2, PAGE_BOX);

const boxOf = (record: ModelAnnotation): Rect => {
  const shape = shapeOf(record.annotation);
  return shape.kind === 'box' ? shape.box : { x: 0, y: 0, width: 0, height: 0 };
};

// A 10 × 10 checkbox: its handles stand out 7 on each side, on a 24 × 24 frame.
const CHECKBOX = { x: 100, y: 100, width: 10, height: 10 };

describe('a small box’s handles stand out on a frame twice their grab size', () => {
  it('draws its handles on the frame, joined by a dashed line, and its outline on the box', () => {
    const nodes = chrome(selecting(boxRecord('box', CHECKBOX)), PAGE, PAGE_BOX, CHROME);
    expect(handlesOf(nodes).map((handle) => handle.at)).toEqual([
      { x: 93, y: 93 },
      { x: 105, y: 93 },
      { x: 117, y: 93 },
      { x: 117, y: 105 },
      { x: 117, y: 117 },
      { x: 105, y: 117 },
      { x: 93, y: 117 },
      { x: 93, y: 105 },
    ]);
    expect(nodes.find((node) => node.kind === 'handle-frame')).toEqual({
      kind: 'handle-frame',
      corners: [
        { x: 93, y: 93 },
        { x: 117, y: 93 },
        { x: 117, y: 117 },
        { x: 93, y: 117 },
      ],
    });
    expect(nodes.find((node) => node.kind === 'outline')).toEqual({
      kind: 'outline',
      rect: CHECKBOX,
    });
  });

  it('keeps a big box’s handles on its corners, with no dashed frame', () => {
    const big = { x: 100, y: 100, width: 100, height: 60 };
    const nodes = chrome(selecting(boxRecord('box', big)), PAGE, PAGE_BOX, CHROME);
    expect(handlesOf(nodes)[0]!.at).toEqual({ x: 100, y: 100 });
    expect(nodes.some((node) => node.kind === 'handle-frame')).toBe(false);
  });

  it('a press in the middle moves it; a press on a handle grabs that handle', () => {
    const model = selecting(boxRecord('box', CHECKBOX));
    expect(hitAt(model, { x: 105, y: 105 })).toMatchObject({ kind: 'annot' });
    for (const handle of handlesOf(chrome(model, PAGE, PAGE_BOX, CHROME))) {
      const target = hitAt(model, handle.at);
      expect(target.kind).toBe('handle');
    }
    expect(hitAt(model, { x: 117, y: 117 })).toMatchObject({ kind: 'handle', handle: 'se' });
  });

  it('dragging a handle moves its side as far as the pointer moves, and it stays under the pointer', () => {
    let model = selecting(boxRecord('box', CHECKBOX));
    model = run(model, [pointer('down', { x: 117, y: 117 }), pointer('move', { x: 122, y: 120 })]);
    expect(model.draft?.kind).toBe('handle');
    // The south-east handle, fifth in the list.
    const live = handlesOf(chrome(model, PAGE, PAGE_BOX, CHROME))[4]!;
    expect(live.at.x).toBeCloseTo(122, 9);
    expect(live.at.y).toBeCloseTo(120, 9);
    model = run(model, [pointer('up', { x: 122, y: 120 })]);
    const box = boxOf(model.byId[model.order[0]!]!);
    expect(box.x).toBeCloseTo(100, 9);
    expect(box.y).toBeCloseTo(100, 9);
    expect(box.width).toBeCloseTo(15, 9);
    expect(box.height).toBeCloseTo(13, 9);
  });

  it('turned, its handles stand out on the turned frame, and a drag still resizes one to one', () => {
    let model = selecting(boxRecord('box', CHECKBOX, 'square', 90));
    // Turned 90° about (105,105): the box's own right side now faces down.
    const east = hitAt(model, { x: 105, y: 117 });
    expect(east).toMatchObject({ kind: 'handle', handle: 'e' });
    model = run(model, [
      pointer('down', { x: 105, y: 117 }),
      pointer('move', { x: 105, y: 121 }),
      pointer('up', { x: 105, y: 121 }),
    ]);
    expect(boxOf(model.byId[model.order[0]!]!).width).toBeCloseTo(14, 9);
  });

  it('at the page’s edge its frame slides onto the page, so every handle can be grabbed', () => {
    const atEdge = { x: 0, y: 300, width: 10, height: 10 };
    const handles = handlesOf(chrome(selecting(boxRecord('box', atEdge)), PAGE, PAGE_BOX, CHROME));
    expect(Math.min(...handles.map((handle) => handle.at.x))).toBeCloseTo(0, 9);
    expect(Math.max(...handles.map((handle) => handle.at.x))).toBeCloseTo(24, 9);
  });

  it('its rotate knob hangs off the frame, clear of the handles', () => {
    const model = selecting(boxRecord('box', CHECKBOX, 'square'));
    const knob = selectionKnob(model, PAGE, PAGE_BOX, CHROME)!;
    expect(knob.from).toEqual({ x: 105, y: 93 });
  });
});

describe('a small group’s handles stand out the same way', () => {
  it('spreads the group box’s handles and resizes it one to one', () => {
    let model = selecting(
      boxRecord('a', { x: 100, y: 100, width: 10, height: 10 }, 'square'),
      boxRecord('b', { x: 120, y: 100, width: 10, height: 10 }, 'square'),
    );
    // The union is 30 × 10: 7 above and below it.
    const handles = handlesOf(chrome(model, PAGE, PAGE_BOX, CHROME));
    expect(handles[4]!.at).toEqual({ x: 130, y: 117 });
    model = run(model, [
      pointer('down', { x: 130, y: 117 }),
      pointer('move', { x: 136, y: 117 }),
      pointer('up', { x: 136, y: 117 }),
    ]);
    const right = boxOf(model.byId[named('b', PAGE).id]!);
    expect(right.x + right.width).toBeCloseTo(136, 9);
  });
});

describe('where grab zones meet, the nearest handle wins', () => {
  it('a press nearer a short line’s end grabs that end, not the first one listed', () => {
    const line = recordOf({
      ...named('line', PAGE),
      page: PAGE,
      subtype: 'line',
      geometry: {
        kind: 'line',
        linePoints: { start: { x: 100, y: 100 }, end: { x: 108, y: 100 } },
        rotation: 0,
      } as Shape,
      style: STYLE,
      flags: DRAWN_FLAGS,
      source: 'vector',
    });
    const model = selecting(line);
    expect(hitAt(model, { x: 105, y: 100 })).toMatchObject({ kind: 'handle', handle: 'v1' });
    expect(hitAt(model, { x: 103, y: 100 })).toMatchObject({ kind: 'handle', handle: 'v0' });
    // Selected, it can be grabbed to move a little way off the line, where its frame grew.
    expect(hitAt(model, { x: 104, y: 110 })).toMatchObject({ kind: 'annot' });
    expect(hitAt(modelWith([line]), { x: 104, y: 110 })).toEqual({ kind: 'empty' });
  });
});
