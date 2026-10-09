/**
 * The appearance rule (src/appearance.ts): how a record is drawn after a
 * change, during a gesture, and when it is new. One rule for gestures,
 * sidebar edits and code edits.
 */
import { toPageRef, type AnnotationPatch } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { modelWith, recordOf, step, STYLE, withAnnotation } from './support';
import {
  applyChange,
  drawnAfter,
  rasterPlacement,
  sourceDuring,
  sourceOfConfirmed,
  sourceOfNew,
} from '../src/appearance';
import { DRAWN_FLAGS } from '../src/flags';
import { shapeOf } from '../src/record';
import type { Message, ModelAnnotation } from '../src/types';

const PAGE = toPageRef(1);
const BOX = { x: 100, y: 100, width: 100, height: 60 };

/** A confirmed record drawn from the engine's raster at `BOX`. */
const baked = (
  subtype: 'square' | 'stamp',
  over: Partial<Parameters<typeof recordOf>[0]> = {},
): ModelAnnotation =>
  recordOf({
    id: 'obj:1',
    ref: { kind: 'objectNumber', page: PAGE, objectNumber: 1 },
    page: PAGE,
    subtype,
    geometry: { kind: 'box', box: BOX, rotation: 0, ellipse: false },
    // Filled, so a press anywhere inside grabs it.
    style: { ...STYLE, interiorColor: '#ffffff' },
    flags: DRAWN_FLAGS,
    source: 'baked',
    apBox: BOX,
    ...over,
  });

const square = (patch: Record<string, unknown>) =>
  ({ subtype: 'square', ...patch }) as AnnotationPatch;

const editPtr = (phase: 'down' | 'move' | 'up', x: number, y: number): Message => ({
  type: 'editPointer',
  phase,
  in: { page: PAGE, point: { x, y }, shift: false },
});

describe('after a change', () => {
  it('nothing visible: drawn as it was', () => {
    const next = applyChange(baked('square'), square({ locked: true }));
    expect(next.annotation.locked).toBe(true);
    expect(next.source).toBe('baked');
    expect(next.apBox).toEqual(BOX);
  });

  it('a pure move: the raster stays and moves the same distance', () => {
    const next = applyChange(baked('square'), square({ box: { ...BOX, x: 130, y: 120 } }));
    expect(next.source).toBe('baked');
    expect(next.apBox).toEqual({ ...BOX, x: 130, y: 120 });
  });

  it('a move by a rect command is a pure move too; the rect goes along', () => {
    const record = baked('square');
    const rect = record.annotation.rect;
    const next = applyChange(record, square({ rect: { ...rect, x: rect.x + 30 } }));
    expect(next.source).toBe('baked');
    expect(next.apBox).toEqual({ ...BOX, x: BOX.x + 30 });
    expect(next.annotation.rect).toEqual({ ...rect, x: rect.x + 30 });
  });

  it('a pure move of a turned raster keeps its turn: the pixels are the same', () => {
    const turned = baked('square', {
      geometry: { kind: 'box', box: BOX, rotation: 30, ellipse: false },
      apRot: 30,
    });
    const next = applyChange(turned, square({ box: { ...BOX, x: 90, y: 140 } }));
    expect(next.source).toBe('baked');
    expect(next.apBox).toEqual({ ...BOX, x: 90, y: 140 });
    expect(next.apRot).toBe(30);
  });

  it('a restyle draws live', () => {
    expect(applyChange(baked('square'), square({ color: '#00ff00' })).source).toBe('vector');
  });

  it('a resize draws live', () => {
    const next = applyChange(baked('square'), square({ box: { ...BOX, width: 140 } }));
    expect(next.source).toBe('vector');
  });

  it('a record drawn live stays live when it moves', () => {
    const live = baked('square', { source: 'vector' });
    expect(applyChange(live, square({ box: { ...BOX, x: 130 } })).source).toBe('vector');
  });

  it('a stamp always shows its raster, drawn where its shape is, at its own proportions', () => {
    const stamp = baked('stamp');
    const resized = applyChange(stamp, {
      subtype: 'stamp',
      box: { ...BOX, width: 160 },
    } as AnnotationPatch);
    expect(resized.source).toBe('baked');
    const placed = rasterPlacement(
      modelWith([resized]),
      resized.id,
      undefined,
      shapeOf(resized.annotation),
    );
    // Fit `contain` in the wider box, as the engine fits the drawing: whole, centred.
    expect(placed.box).toEqual({ ...BOX, x: BOX.x + 30 });
    expect(drawnAfter(stamp, { subtype: 'stamp', opacity: 0.5 } as AnnotationPatch)).toEqual({});
  });

  it('a gesture and the same change stated in code draw alike', () => {
    const model = modelWith([baked('square')]);
    const [moved] = step(
      step(step(model, editPtr('down', 150, 130))[0], editPtr('move', 180, 150))[0],
      editPtr('up', 180, 150),
    );
    const byGesture = moved.byId['obj:1'];
    const byCode = applyChange(baked('square'), square({ box: { ...BOX, x: 130, y: 120 } }));
    expect([byGesture.source, byGesture.apBox]).toEqual([byCode.source, byCode.apBox]);
  });
});

describe('during a gesture', () => {
  it('a move carries the raster along', () => {
    const model = modelWith([baked('square')]);
    const [moving] = step(step(model, editPtr('down', 150, 130))[0], editPtr('move', 170, 140));
    expect(sourceDuring(moving, 'obj:1')).toBe('baked');
    const shape = shapeOf(moving.byId['obj:1'].annotation);
    expect(rasterPlacement(moving, 'obj:1', undefined, shape).box).toEqual({
      ...BOX,
      x: 120,
      y: 110,
    });
  });

  it('a resize draws live before its commit decides; a no-op grab leaves the raster', () => {
    const selected = step(
      step(modelWith([baked('square')]), editPtr('down', 150, 130))[0],
      editPtr('up', 150, 130),
    )[0];
    // The south-east handle sits on the box's corner.
    const [resizing] = step(
      step(selected, editPtr('down', 200, 160))[0],
      editPtr('move', 230, 190),
    );
    expect(sourceDuring(resizing, 'obj:1')).toBe('vector');
    const [released] = step(step(selected, editPtr('down', 200, 160))[0], editPtr('up', 200, 160));
    expect(sourceDuring(released, 'obj:1')).toBe('baked');
  });
});

describe('a new record', () => {
  it('draws live, except a stamp, which shows its image', () => {
    expect(sourceOfNew(baked('square').annotation)).toBe('vector');
    expect(sourceOfNew(baked('stamp').annotation)).toBe('baked');
  });
});

describe('a record the engine reports', () => {
  it('draws from the raster, unless this session drew it live', () => {
    expect(sourceOfConfirmed(baked('square').annotation, false)).toBe('baked');
    expect(sourceOfConfirmed(baked('square').annotation, true)).toBe('vector');
  });

  it('with no appearance in the file, draws live: every viewer draws that one from its fields', () => {
    const bare = withAnnotation(baked('square'), { hasAppearance: false });
    expect(sourceOfConfirmed(bare.annotation, false)).toBe('vector');
  });

  it('a stamp is always its raster, with or without an appearance', () => {
    const bare = withAnnotation(baked('stamp'), { hasAppearance: false });
    expect(sourceOfConfirmed(bare.annotation, false)).toBe('baked');
    expect(sourceOfConfirmed(bare.annotation, true)).toBe('baked');
  });
});
