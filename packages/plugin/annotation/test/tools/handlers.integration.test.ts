/**
 * The pen's pointer handlers on the real capability: a stroke, then a press
 * before the wait for the next stroke runs out. Each press is offered to the
 * edit handler first and to the draw handler when it declines, as the
 * interaction hub does by priority.
 */
import { timerClock } from '@embedpdf/core';
import { annotationKey } from '@embedpdf/engine-core/runtime';
import type {
  InteractionHandler,
  InteractionHostCapability,
  PointerSample,
} from '@embedpdf/plugin-interaction/contract/host';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDrawHandler, createEditHandler } from '../../src/tools/handlers';
import { EMPTY, inkCreates, inkDrawingHarness, ON_SQUARE, SQUARE } from '../fixtures/ink-drawing';
import { PAGE } from '../harness';

/** The hub as the handlers see it, with the pen active. */
const penActive = {
  getActiveToolId: () => 'ink',
  hasCursorClaim: () => false,
  onToolChanged: () => () => {},
  claimCursor: () => {},
} as unknown as InteractionHostCapability;

const at = (phase: PointerSample['phase'], point: { x: number; y: number }): PointerSample => ({
  phase,
  viewport: point,
  modifiers: { shift: false, alt: false, ctrl: false, meta: false },
  page: { ref: PAGE, point, scale: 1, rotation: 0, zoom: 1 },
});

/** The pen's two handlers on a page with a square, and the gestures a user makes with them. */
const penOnPage = async () => {
  const harness = await inkDrawingHarness();
  const edit = createEditHandler(harness.capability, penActive);
  const draw = createDrawHandler(harness.capability, penActive, timerClock);
  /** A press and its release at `point`: the handler that took it, or null. */
  const click = (point: { x: number; y: number }): InteractionHandler | null => {
    const owner = [edit, draw].find((handler) => handler.onPointerDown(at('down', point))) ?? null;
    owner?.onPointerUp?.(at('up', point));
    return owner;
  };
  /** One pen stroke from `x`, lifted. */
  const stroke = (x: number): void => {
    const start = { x, y: 300 };
    const end = { x: x + 80, y: 300 };
    const owner = [edit, draw].find((handler) => handler.onPointerDown(at('down', start)));
    expect(owner).toBe(draw);
    draw.onPointerMove?.(at('move', { x: x + 40, y: 320 }));
    draw.onPointerMove?.(at('move', end));
    draw.onPointerUp?.(at('up', end));
  };
  return { harness, edit, draw, click, stroke };
};

describe('the pen: a press before the wait for the next stroke runs out', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('on another annotation keeps the stroke and selects that annotation', async () => {
    const { harness, edit, click, stroke } = await penOnPage();
    vi.useFakeTimers();
    stroke(300);
    vi.advanceTimersByTime(200);

    expect(click(ON_SQUARE)).toBe(edit);

    expect(inkCreates(harness)).toHaveLength(1);
    expect(harness.model().selected).toEqual([annotationKey(SQUARE)]);
    // The wait runs out with nothing left to finish.
    vi.advanceTimersByTime(800);
    expect(inkCreates(harness)).toHaveLength(1);
    expect(harness.model().order).toHaveLength(3);
    expect(harness.model().selected).toEqual([annotationKey(SQUARE)]);
  });

  it('on the empty page starts the next stroke of the same drawing', async () => {
    const { harness, stroke } = await penOnPage();
    vi.useFakeTimers();
    stroke(300);
    vi.advanceTimersByTime(200);
    stroke(EMPTY.x);
    expect(inkCreates(harness)).toHaveLength(0);

    vi.advanceTimersByTime(800);

    expect(inkCreates(harness)).toHaveLength(1);
    expect(inkCreates(harness)[0]).toHaveLength(2);
  });
});
