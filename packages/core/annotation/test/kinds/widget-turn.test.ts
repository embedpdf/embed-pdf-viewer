/**
 * A form widget as a turning box: its frame (`box`) and its quarter turn
 * (`rotation`, `/MK /R`), the rect it stands in, the quarter-turn command,
 * Orientation, and an upright form tool's ghost against its commit.
 */
import type { Rotation } from '@embedpdf/core-geometry';
import type { Annotation, AnnotationFlags, PageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import {
  gesturePlacement,
  initialModel,
  kindNamed,
  kindOf,
  orientationPatch,
  pageItems,
  placedBoxFields,
  placedShape,
  resolveClickPlacement,
  selectionProperties,
  shapeOf,
  standingRect,
  uprightRotation,
  type Model,
  type ModelAnnotation,
  type Rect,
} from '../../src';
import { boxFamily } from '../../src/shapes/box';
import { STYLE, recordOf, restyle, rounded, step } from '../support';

const PAGE: PageRef = { kind: 'objectNumber', objectNumber: 1 };
const FLAGS = { print: true } as AnnotationFlags;

/** A text field's frame: 160 wide, 24 tall, its middle at (100, 100). */
const FRAME: Rect = { x: 20, y: 88, width: 160, height: 24 };
/** Where that frame stands at 90 and 270: 24 wide, 160 tall, about the same middle. */
const STANDING: Rect = { x: 88, y: 20, width: 24, height: 160 };

const QUARTER_TURNS: readonly Rotation[] = [0, 90, 180, 270];

const widget = (rotation: number, box: Rect = FRAME, id = 'W1'): ModelAnnotation =>
  recordOf({
    id,
    ref: { kind: 'objectNumber', objectNumber: 9, page: PAGE },
    page: PAGE,
    subtype: 'widget-text',
    geometry: { kind: 'box', box, rotation, ellipse: false },
    style: STYLE,
    flags: FLAGS,
    source: 'baked',
    apBox: standingRect(box, rotation),
  });

const selected = (record: ModelAnnotation): Model => ({
  ...initialModel,
  byId: { [record.id]: record },
  order: [record.id],
  selected: [record.id],
});

describe("a widget's frame and rect at each quarter turn", () => {
  it.each(QUARTER_TURNS)('at %i°: its shape is its box and turn', (rotation) => {
    const { annotation } = widget(rotation);
    const shape = shapeOf(annotation);
    expect(shape).toEqual({ kind: 'box', box: FRAME, rotation, ellipse: false });
    // Written back as the engine's fields: the frame, and the turn (`null` upright).
    expect(boxFamily.write(shape as never, 'widget')).toEqual({
      box: FRAME,
      rotation: rotation || null,
    });
  });

  it.each(QUARTER_TURNS)('at %i°: its rect is where the turned frame stands', (rotation) => {
    const { annotation } = widget(rotation);
    expect(annotation.rect).toEqual(rotation % 180 ? STANDING : FRAME);
  });

  it('a widget without a box (not yet read by the engine) is its rect, unturned', () => {
    const bare = { subtype: 'widget', fieldKind: 'text', hasMark: false, rect: FRAME };
    expect(shapeOf(bare as unknown as Annotation)).toEqual({
      kind: 'box',
      box: FRAME,
      rotation: 0,
      ellipse: false,
    });
  });

  it.each(QUARTER_TURNS)(
    'at %i°: its picture fills the rect it stands in, with no turn of its own',
    (rotation) => {
      const record = widget(rotation);
      const [item] = pageItems(selected(record), PAGE);
      // The engine draws a widget's contents turned (`/MK /R`): the picture is placed, not turned.
      expect(item!.apBox).toEqual(rotation % 180 ? STANDING : FRAME);
      expect(item!.apRot).toBeUndefined();
      // The painter draws upright in the frame, which the item turns.
      expect(item!.frame.box).toEqual(FRAME);
      expect(item!.frame.rotation).toBe(rotation);
      // In the frame, the picture lands back on the rect: turned against the frame.
      expect(item!.raster!.rotation).toBe((360 - rotation) % 360);
      expect(item!.raster!.box.width).toBe(rotation % 180 ? 24 : 160);
    },
  );
});

describe('the quarter-turn command on a widget', () => {
  it('a widget turns by quarter turns and shows no rotation handle', () => {
    const caps = kindNamed('widget-text').caps;
    expect(caps.quarterTurns).toBe(true);
    expect(caps.rotatable).toBe(false);
    expect(caps.groupRotatable).toBe(false);
  });

  it('turns the whole widget about its middle: the frame stays, the rect stands the other way', () => {
    const [after, effects] = step(selected(widget(0)), { type: 'rotateSelection', degrees: 90 });
    expect(effects).toEqual([
      { type: 'patch', id: 'W1', patch: { subtype: 'widget', rotation: 90 } },
    ]);
    const { annotation } = after.byId['W1']!;
    expect(shapeOf(annotation)).toMatchObject({ box: FRAME, rotation: 90 });
    expect(rounded(annotation.rect)).toEqual(STANDING);
  });

  it('four quarter turns come back upright, and counterclockwise turns the other way', () => {
    let model = selected(widget(0));
    for (let turn = 0; turn < 4; turn++) {
      [model] = step(model, { type: 'rotateSelection', degrees: 90 });
    }
    expect(shapeOf(model.byId['W1']!.annotation)).toMatchObject({ box: FRAME, rotation: 0 });
    const [back] = step(selected(widget(0)), { type: 'rotateSelection', degrees: -90 });
    expect(shapeOf(back.byId['W1']!.annotation)).toMatchObject({ rotation: 270 });
  });

  it('takes no free turn: only a quarter turn turns it', () => {
    const [after, effects] = step(selected(widget(0)), {
      type: 'rotateSelection',
      // A turn the message's type doesn't allow, as untyped code could send it.
      degrees: 30 as unknown as 90,
    });
    expect(effects).toEqual([]);
    expect(shapeOf(after.byId['W1']!.annotation)).toMatchObject({ rotation: 0 });
  });

  it('reset rotation turns it upright again', () => {
    const [after, effects] = step(selected(widget(270)), { type: 'resetRotation' });
    expect(effects).toEqual([
      { type: 'patch', id: 'W1', patch: { subtype: 'widget', rotation: null } },
    ]);
    expect(rounded(after.byId['W1']!.annotation.rect)).toEqual(FRAME);
  });

  it('a marked widget takes a quarter turn too: the engine fits its mark again', () => {
    expect(kindNamed('widget-mark').caps.quarterTurns).toBe(true);
  });
});

describe('a turn at the edge of the page', () => {
  /** The page's box, by the page's object number: what the plugin gives a turn. */
  const PAGE_BOXES = { 1: { x: 0, y: 0, width: 600, height: 800 } };
  /** A field against the top edge: its turned box would reach 64 past it. */
  const AT_TOP: Rect = { x: 20, y: 4, width: 160, height: 24 };

  const turn = (model: Model, pageBoxes?: Record<number, Rect>) =>
    step(model, { type: 'rotateSelection', degrees: 90, pageBoxes });
  const rectOf = (model: Model, id = 'W1') => rounded(model.byId[id]!.annotation.rect);

  it('with room to turn, the widget turns about its middle and stays there', () => {
    const [after, effects] = turn(selected(widget(0)), PAGE_BOXES);
    expect(effects).toEqual([
      { type: 'patch', id: 'W1', patch: { subtype: 'widget', rotation: 90 } },
    ]);
    expect(rectOf(after)).toEqual(STANDING);
  });

  it('where the turn would carry it past the edge, it lands against the edge', () => {
    const [after, effects] = turn(selected(widget(0, AT_TOP)), PAGE_BOXES);
    // Turned about its middle it would stand at y -64; it is moved down by that much.
    expect(rectOf(after)).toEqual({ x: 88, y: 0, width: 24, height: 160 });
    expect(shapeOf(after.byId['W1']!.annotation)).toMatchObject({
      box: { x: 20, y: 68, width: 160, height: 24 },
      rotation: 90,
    });
    // One write: the turn and the new place together.
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      type: 'patch',
      id: 'W1',
      patch: { rotation: 90, box: { x: 20, y: 68, width: 160, height: 24 } },
    });
  });

  it('a turned widget is found on the page at any edge', () => {
    const page = PAGE_BOXES[1];
    const edges: Rect[] = [
      AT_TOP,
      { x: 20, y: page.height - 28, width: 160, height: 24 },
      { x: 4, y: 300, width: 24, height: 160 },
      { x: page.width - 28, y: 300, width: 24, height: 160 },
    ];
    for (const box of edges) {
      const [after] = turn(selected(widget(0, box)), PAGE_BOXES);
      const rect = rectOf(after);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(page.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(page.height);
      // It moved along one axis only: the other still runs through the old middle.
      const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const turned = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      expect(turned.x === middle.x || turned.y === middle.y).toBe(true);
    }
  });

  it('several widgets turn about their common middle and move together', () => {
    const left = widget(0, AT_TOP, 'W1');
    const right = widget(0, { ...AT_TOP, x: 200 }, 'W2');
    const model: Model = {
      ...initialModel,
      byId: { W1: left, W2: right },
      order: ['W1', 'W2'],
      selected: ['W1', 'W2'],
    };
    const [free] = turn(model);
    const [kept] = turn(model, PAGE_BOXES);
    // Without a page they stand past the top edge; with one, both moved down by the same.
    const moved = rectOf(kept, 'W1').y - rectOf(free, 'W1').y;
    expect(moved).toBeGreaterThan(0);
    expect(rectOf(kept, 'W2').y - rectOf(free, 'W2').y).toBe(moved);
    expect(rectOf(kept, 'W1').x).toBe(rectOf(free, 'W1').x);
    expect(Math.min(rectOf(kept, 'W1').y, rectOf(kept, 'W2').y)).toBe(0);
  });

  it('a turned box larger than the page is pinned to its top left, as a move pins it', () => {
    // 160 tall once turned, on a page 120 high.
    const [after] = turn(selected(widget(0)), { 1: { x: 0, y: 0, width: 200, height: 120 } });
    expect(rectOf(after)).toEqual({ x: 88, y: 0, width: 24, height: 160 });
  });

  it('reset rotation keeps the widget on its page too', () => {
    // Turned 270° it stands 2 from the left edge; upright again its frame would start at -66.
    const turned = widget(270, { x: -66, y: 88, width: 160, height: 24 });
    expect(rounded(turned.annotation.rect)).toEqual({ x: 2, y: 20, width: 24, height: 160 });
    const [after] = step(selected(turned), { type: 'resetRotation', pageBoxes: PAGE_BOXES });
    expect(rectOf(after)).toEqual({ x: 0, y: 88, width: 160, height: 24 });
  });

  it('without a page box the turn leaves the widget where it turned', () => {
    const [after] = turn(selected(widget(0, AT_TOP)));
    expect(rectOf(after)).toEqual({ x: 88, y: -64, width: 24, height: 160 });
  });

  it('a page with no box in the list is left alone', () => {
    const [after] = turn(selected(widget(0, AT_TOP)), { 2: PAGE_BOXES[1] });
    expect(rectOf(after).y).toBe(-64);
  });
});

describe('Orientation', () => {
  it('is offered over a selection of widgets, after their look and before the flags', () => {
    const { annotation } = widget(0);
    const keys = selectionProperties(initialModel, [annotation]).map((property) => property.key);
    expect(keys.indexOf('orientation')).toBeGreaterThan(keys.indexOf('textAlign'));
    expect(keys.indexOf('orientation')).toBeLessThan(keys.indexOf('locked'));
    // A tool has none: its kind's own properties are the tool's.
    expect(kindOf(annotation).properties.map((property) => property.key)).not.toContain(
      'orientation',
    );
  });

  it('is not offered when the selection holds another kind', () => {
    const square = { subtype: 'square' } as unknown as Annotation;
    const keys = selectionProperties(initialModel, [widget(0).annotation, square]).map(
      (property) => property.key,
    );
    expect(keys).not.toContain('orientation');
  });

  it.each(QUARTER_TURNS)('to %i° keeps the rect and turns the contents', (rotation) => {
    const record = widget(0);
    const patch = orientationPatch(record.annotation, rotation);
    expect(patch).toEqual({
      box: rotation % 180 ? STANDING : FRAME,
      rotation: rotation || null,
    });
    const model = selected(record);
    const [after] = step(model, restyle(model, patch));
    const { annotation } = after.byId['W1']!;
    expect(rounded(annotation.rect)).toEqual(FRAME);
    expect(shapeOf(annotation)).toMatchObject({ rotation });
  });

  it('from a quarter turn back upright keeps the rect too', () => {
    const record = widget(90);
    expect(record.annotation.rect).toEqual(STANDING);
    const patch = orientationPatch(record.annotation, 0);
    expect(patch).toEqual({ box: STANDING, rotation: null });
    const model = selected(record);
    const [after] = step(model, restyle(model, patch));
    expect(rounded(after.byId['W1']!.annotation.rect)).toEqual(STANDING);
  });

  it('is nothing for a kind that takes no quarter turn', () => {
    const square = recordOf({
      id: 'S1',
      ref: { kind: 'objectNumber', objectNumber: 10, page: PAGE },
      page: PAGE,
      subtype: 'square',
      geometry: { kind: 'box', box: FRAME, rotation: 0, ellipse: false },
      style: STYLE,
      flags: FLAGS,
      source: 'baked',
    });
    expect(orientationPatch(square.annotation, 90)).toEqual({});
  });
});

describe('an upright form tool: its ghost is its commit', () => {
  const tool = {
    subtype: 'widget',
    fieldKind: 'text',
    hasMark: false,
  } as unknown as Annotation;
  const PAGE_BOX: Rect = { x: 0, y: 0, width: 612, height: 792 };
  const CLICK = { width: 160, height: 24 } as const;

  it.each(QUARTER_TURNS)('a click on a page shown turned %i°', (displayRotation) => {
    const frame = { pageBox: PAGE_BOX, upright: true, displayRotation };
    const placement = resolveClickPlacement({ x: 300, y: 400 }, CLICK, frame);
    expect(placement.kind).toBe('box');
    if (placement.kind !== 'box') return;
    // The ghost: the shape the box family lays there.
    const ghost = placedShape(tool, placement);
    // The commit: the fields the form's place handler sends.
    const commit = placedBoxFields(placement);
    expect(ghost).toMatchObject({ kind: 'box', box: commit.box, rotation: commit.rotation ?? 0 });
    expect(boxFamily.write(ghost as never, 'widget')).toEqual(commit);
    // It reads upright as the person sees the page: the turn undoes the page's.
    expect(commit.rotation ?? 0).toBe(uprightRotation(displayRotation));
    // And shows the tool's size as seen: 160 × 24 before its turn.
    expect(commit.box).toMatchObject({ width: 160, height: 24 });
    const stands = standingRect(commit.box, commit.rotation ?? 0);
    expect(stands.width).toBe(displayRotation % 180 ? 24 : 160);
    expect(stands.x + stands.width / 2).toBeCloseTo(300, 9);
    expect(stands.y + stands.height / 2).toBeCloseTo(400, 9);
  });

  it.each(QUARTER_TURNS)('a drag on a page shown turned %i°', (displayRotation) => {
    const frame = { pageBox: PAGE_BOX, upright: true, displayRotation };
    const dragged: Rect = { x: 100, y: 200, width: 40, height: 120 };
    const placement = gesturePlacement(
      'box',
      { x: dragged.x, y: dragged.y },
      { x: dragged.x + dragged.width, y: dragged.y + dragged.height },
      CLICK,
      frame,
    );
    expect(placement?.kind).toBe('box');
    if (placement?.kind !== 'box') return;
    const ghost = placedShape(tool, placement);
    const commit = placedBoxFields(placement);
    expect(boxFamily.write(ghost as never, 'widget')).toEqual(commit);
    expect(commit.rotation ?? 0).toBe(uprightRotation(displayRotation));
    // The field stands on the region the author dragged.
    expect(standingRect(commit.box, commit.rotation ?? 0)).toEqual(dragged);
  });

  it('a tool that is not upright places along the page, unturned', () => {
    const placement = resolveClickPlacement({ x: 300, y: 400 }, CLICK, {
      pageBox: PAGE_BOX,
      upright: false,
      displayRotation: 90,
    });
    if (placement.kind !== 'box') throw new Error('a click places a box');
    expect(placedBoxFields(placement)).toEqual({
      box: { x: 220, y: 388, width: 160, height: 24 },
      rotation: null,
    });
  });
});
