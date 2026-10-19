import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { DRAWN_FLAGS } from '../../src/flags';
import { DEFAULT_CHROME_GEOMETRY, geomRotation } from '../../src/geometry';
import { groupCaps } from '../../src/group';
import { groupUnionBounds, hitTest, isOnTextBox } from '../../src/hit';
import { unionRect } from '../../src/rect';
import { kindOf, linkChildRects, shapeOf, styleOf } from '../../src/record';
import { annotationSelectionFrame } from '../../src/selection';
import { calloutShape } from '../../src/shapes/text-box';
import type { Message, Model, Point, Shape } from '../../src/types';
import { initialModel } from '../../src/update';
import { selectionKnob } from '../../src/view';
import { modelWith, named, recordOf, run, STYLE, step } from '../support';

const PAGE = toPageRef(1);
const BOX = { x: 200, y: 100, width: 120, height: 40 };

/** A confirmed free text named `name`: a callout when `shape` has a line. */
const freeTextRecord = (name: string, shape: Shape) =>
  recordOf({
    ...named(name, PAGE),
    page: PAGE,
    subtype: 'free-text',
    geometry: shape,
    style: STYLE,
    flags: DRAWN_FLAGS,
    source: 'vector',
  });

/** A callout standing upright on a page shown turned 90°: its box turned 270°. */
const uprightCallout = (name = 'callout') =>
  freeTextRecord(name, calloutShape(BOX, 270, { x: 40, y: 60 }, { x: 120, y: 120 }, 'open-arrow'));

const plainTextBox = (name = 'text', rotation = 270) =>
  freeTextRecord(name, {
    kind: 'text-box',
    box: BOX,
    rotation,
    calloutLine: null,
    lineEnding: null,
  });

const selecting = (model: Model): Model => ({ ...model, selected: [...model.order] });

/** Every point on a 2pt grid around the box that hits the rotate knob. */
function knobHits(model: Model): number {
  let hits = 0;
  for (let x = BOX.x - 60; x <= BOX.x + BOX.width + 60; x += 2)
    for (let y = BOX.y - 100; y <= BOX.y + BOX.height + 100; y += 2)
      if (hitTest(model, PAGE, { x, y }, DEFAULT_CHROME_GEOMETRY, 6).kind === 'rotate') hits++;
  return hits;
}

describe('a callout is its own kind', () => {
  it('a free text with the callout intent reads as the callout; without it, as free text', () => {
    expect(kindOf(uprightCallout().annotation).name).toBe('free-text-callout');
    expect(kindOf(plainTextBox().annotation).name).toBe('free-text');
  });

  it('a callout drawn on a turned page stands upright and offers no rotate knob', () => {
    const pointer = (phase: 'down' | 'up', x: number, y: number): Message => ({
      type: 'createPointer',
      phase,
      subtype: 'free-text-callout',
      in: { page: PAGE, point: { x, y }, shift: false, displayRotation: 90, upright: true },
    });
    const model = run(initialModel, [
      pointer('down', 40, 60),
      pointer('up', 40, 60),
      pointer('down', 120, 120),
      pointer('up', 120, 120),
      pointer('down', 200, 100),
      pointer('up', 200, 100),
    ]);
    const created = model.byId[model.order[0]!]!;
    expect(kindOf(created.annotation).name).toBe('free-text-callout');
    expect(geomRotation(shapeOf(created.annotation))).toBe(270);
    expect(model.selected).toEqual([created.id]);
    expect(selectionKnob(model, PAGE)).toBeNull();
  });

  it('a selected callout has no knob to grab; a plain text box turned the same way does', () => {
    expect(knobHits(selecting(modelWith([uprightCallout()])))).toBe(0);
    const plain = selecting(modelWith([plainTextBox()]));
    expect(selectionKnob(plain, PAGE)).not.toBeNull();
    expect(knobHits(plain)).toBeGreaterThan(0);
  });

  it('rotate 90° leaves a callout as it is', () => {
    const model = selecting(modelWith([uprightCallout()]));
    const [after, effects] = step(model, { type: 'rotateSelection', degrees: 90 });
    expect(after).toBe(model);
    expect(effects).toEqual([]);
  });

  it('reset rotation keeps the turn that stands a callout upright', () => {
    const model = selecting(modelWith([uprightCallout()]));
    const [after, effects] = step(model, { type: 'resetRotation' });
    expect(after).toBe(model);
    expect(effects).toEqual([]);
    expect(geomRotation(shapeOf(after.byId[model.order[0]!]!.annotation))).toBe(270);
  });

  it('a group with a callout moves as one but neither turns nor resizes', () => {
    const model = selecting(modelWith([uprightCallout(), plainTextBox('text', 0)]));
    expect(groupCaps(model, model.selected)).toEqual({
      movable: true,
      resizable: false,
      rotatable: false,
    });
    expect(selectionKnob(model, PAGE)).toBeNull();
  });
});

describe('a callout is one object on the page', () => {
  // The upright callout's box shows as {240,60,40,120}; its line runs from the
  // tip (40,60) through the knee (120,120) to the box.
  const ON_LINE = { x: 80, y: 90 };
  const EMPTY_IN_FRAME = { x: 60, y: 170 };
  const IN_BOX = { x: 260, y: 120 };
  const hitAt = (model: Model, point: Point) =>
    hitTest(model, PAGE, point, DEFAULT_CHROME_GEOMETRY, 6).kind;

  it("its frame is everything it paints; a plain text box's frame is its box", () => {
    const frame = unionRect(annotationSelectionFrame(uprightCallout()).corners);
    expect(frame.x).toBeLessThan(40);
    expect(frame.y).toBeLessThan(60);
    expect(frame.x + frame.width).toBeCloseTo(280, 6);
    expect(frame.y + frame.height).toBeCloseTo(180, 6);
    expect(unionRect(annotationSelectionFrame(plainTextBox('text', 0)).corners)).toEqual(BOX);
  });

  it('selected, it is grabbed on its line and anywhere in its frame; unselected, only on what it paints', () => {
    const model = modelWith([uprightCallout()]);
    expect(hitAt(model, ON_LINE)).toBe('annot');
    expect(hitAt(model, EMPTY_IN_FRAME)).toBe('empty');
    const selected = selecting(model);
    expect(hitAt(selected, ON_LINE)).toBe('annot');
    expect(hitAt(selected, EMPTY_IN_FRAME)).toBe('annot');
    expect(hitAt(selected, { x: 400, y: 400 })).toBe('empty');
  });

  it("a group's box takes in a callout's line", () => {
    const union = groupUnionBounds(
      selecting(modelWith([uprightCallout(), plainTextBox('text', 0)])),
      PAGE,
    )!;
    expect(union.x).toBeLessThan(40);
    expect(union.y).toBeLessThan(60);
  });

  it('an attached link covers only the text box, not the line', () => {
    const callout = uprightCallout();
    const [link, ...more] = linkChildRects(
      shapeOf(callout.annotation),
      styleOf(callout.annotation),
    );
    expect(more).toEqual([]);
    expect(link!.x).toBeCloseTo(240, 6);
    expect(link!.y).toBeCloseTo(60, 6);
    expect(link!.width).toBeCloseTo(40, 6);
    expect(link!.height).toBeCloseTo(120, 6);
  });

  it('its text is on the box, and the margin reaches the handles on its border', () => {
    const callout = uprightCallout();
    expect(isOnTextBox(callout, IN_BOX, 0)).toBe(true);
    expect(isOnTextBox(callout, ON_LINE, 6)).toBe(false);
    expect(isOnTextBox(callout, EMPTY_IN_FRAME, 6)).toBe(false);
    const justLeftOfBox = { x: 236, y: 120 };
    expect(isOnTextBox(callout, justLeftOfBox, 0)).toBe(false);
    expect(isOnTextBox(callout, justLeftOfBox, 6)).toBe(true);
  });
});
