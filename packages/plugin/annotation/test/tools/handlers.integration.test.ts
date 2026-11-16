/**
 * The pen's pointer handlers on the real capability: a stroke, then a press
 * before the wait for the next stroke runs out. Each press is offered to the
 * edit handler first and to the draw handler when it declines, as the
 * interaction hub does by priority.
 */
import { createTestContext } from '@embedpdf/core/testing';
import { annotationKey } from '@embedpdf/engine-core/runtime';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import type {
  InteractionHandler,
  InteractionHostCapability,
  PointerSample,
} from '@embedpdf/plugin-interaction/contract/host';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDrawHandler, createEditHandler } from '../../src/tools/handlers';
import {
  createsOf,
  EMPTY,
  inkCreates,
  inkDrawingHarness,
  ON_SQUARE,
  SQUARE,
} from '../fixtures/ink-drawing';
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
  const draw = createDrawHandler(harness.capability, penActive);
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

/** The real interaction plugin, built on a context of its own as the kernel builds it. */
const interactionHub = (): InteractionHostCapability => {
  const definition = interactionPlugin();
  const ctx = createTestContext({
    id: 'interaction',
    state: (definition.state as () => unknown)(),
    settings: definition.settings,
  });
  return ctx.connect(definition.create(ctx as never)) as InteractionHostCapability;
};

describe('the pen through the interaction plugin', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a press that finishes a drawing and sends the user to the default tool still drags what it hit', async () => {
    const hub = interactionHub();
    const harness = await inkDrawingHarness(
      { afterCreate: { select: true, tool: 'default' } },
      { wired: true, interaction: hub },
    );
    hub.activateTool('ink');
    vi.useFakeTimers();
    hub.dispatchPointer(at('down', { x: 300, y: 300 }));
    hub.dispatchPointer(at('move', { x: 340, y: 320 }));
    hub.dispatchPointer(at('move', { x: 380, y: 300 }));
    hub.dispatchPointer(at('up', { x: 380, y: 300 }));
    vi.advanceTimersByTime(200);
    expect(inkCreates(harness)).toHaveLength(0);

    hub.dispatchPointer(at('down', ON_SQUARE));

    // The drawing is kept, and its tool's setting sends the user to the default tool.
    expect(inkCreates(harness)).toHaveLength(1);
    expect(hub.getActiveToolId()).toBe(hub.getDefaultToolId());
    // The press still holds the square it hit, and drags it.
    expect(harness.model().selected).toEqual([annotationKey(SQUARE)]);
    expect(harness.model().draft).toMatchObject({ kind: 'move' });
    const rectOf = () => harness.model().byId[annotationKey(SQUARE)]!.annotation.rect;
    const before = rectOf();
    hub.dispatchPointer(at('move', { x: ON_SQUARE.x + 30, y: ON_SQUARE.y }));
    hub.dispatchPointer(at('up', { x: ON_SQUARE.x + 30, y: ON_SQUARE.y }));
    expect(rectOf()).toEqual({ ...before, x: before.x + 30 });
  });

  it('a tool picked during the wait finishes the drawing and stays the active tool', async () => {
    const hub = interactionHub();
    const harness = await inkDrawingHarness(
      { afterCreate: { select: true, tool: 'default' } },
      { wired: true, interaction: hub },
    );
    hub.activateTool('ink');
    hub.dispatchPointer(at('down', { x: 300, y: 300 }));
    hub.dispatchPointer(at('move', { x: 340, y: 320 }));
    hub.dispatchPointer(at('up', { x: 340, y: 320 }));

    hub.activateTool('ink-highlight');

    expect(inkCreates(harness)).toHaveLength(1);
    expect(hub.getActiveToolId()).toBe('ink-highlight');
  });
});

describe('a shape made click by click, through the interaction plugin', () => {
  /** A click: a press and its release at `point`; `clickCount` 2 is the second press of a double-click. */
  const click = (
    hub: InteractionHostCapability,
    point: { x: number; y: number },
    clickCount = 1,
  ): void => {
    hub.dispatchPointer({ ...at('down', point), clickCount });
    hub.dispatchPointer(at('up', point));
  };

  it('a polygon takes a corner on another annotation, which is not selected', async () => {
    const hub = interactionHub();
    const harness = await inkDrawingHarness(undefined, { wired: true, interaction: hub });
    hub.activateTool('polygon');
    click(hub, { x: 300, y: 300 });
    click(hub, { x: 380, y: 300 });

    click(hub, ON_SQUARE);

    expect(harness.model().draft).toMatchObject({ kind: 'create-poly' });
    expect(harness.capability.draft.get()).toMatchObject({ pointCount: 3 });
    expect(harness.model().selected).toEqual([]);

    // The double-click's second press finishes the polygon with its three corners.
    click(hub, ON_SQUARE, 2);
    const [polygon] = createsOf(harness, 'polygon');
    expect(polygon?.vertices).toEqual([{ x: 300, y: 300 }, { x: 380, y: 300 }, ON_SQUARE]);
    expect(harness.model().draft).toBeNull();
  });

  it('a callout takes its knee on another annotation, which is not selected', async () => {
    const hub = interactionHub();
    const harness = await inkDrawingHarness(undefined, { wired: true, interaction: hub });
    hub.activateTool('free-text-callout');
    click(hub, EMPTY);

    click(hub, ON_SQUARE);

    expect(harness.model().draft).toMatchObject({
      kind: 'create-callout',
      step: 'box',
      knee: ON_SQUARE,
    });
    expect(harness.model().selected).toEqual([]);
  });

  it('a first click on another annotation still selects it: no shape waits yet', async () => {
    const hub = interactionHub();
    const harness = await inkDrawingHarness(undefined, { wired: true, interaction: hub });
    hub.activateTool('polygon');

    click(hub, ON_SQUARE);

    expect(harness.model().selected).toEqual([annotationKey(SQUARE)]);
    expect(harness.capability.draft.get()).toBeNull();
  });
});
