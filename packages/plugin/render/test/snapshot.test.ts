import { describe, expect, it } from 'vitest';
import { toPageRef, type PageRef } from '@embedpdf/core';
import type { Rotation, Point } from '@embedpdf/core-geometry';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { InteractionToken, type PointerSample } from '@embedpdf/plugin-interaction/contract/host';

import type { RenderConfig, SnapshotChangedEvent } from '../src/contract';
import { snapshotScale } from '../src/snapshot';
import { boot, image } from './harness';

/** The snapshot tool through the real kernel and interaction hub, over a 612 × 792 page. */

const PAGE = toPageRef(11);
const NO_KEYS = { shift: false, alt: false, ctrl: false, meta: false };

async function bootTool(
  options: {
    allows?: (capability: string) => boolean;
    config?: RenderConfig;
    policy?: unknown;
  } = {},
) {
  const fixture = await boot({ ...options, plugins: [interactionPlugin()] });
  const interaction = fixture.kernel.capability(InteractionToken, 'd');
  const events: SnapshotChangedEvent[] = [];
  fixture.render.onSnapshotChanged((event) => events.push(event));
  /** A pointer event on `page` at `point`, shown at 2 view px per point and turned `rotation`. */
  const pointer = (
    phase: PointerSample['phase'],
    point: Point,
    { page = PAGE, rotation = 0 }: { page?: PageRef; rotation?: Rotation } = {},
  ) =>
    interaction.dispatchPointer({
      phase,
      viewport: { x: point.x * 2, y: point.y * 2 },
      page: { ref: page, point, scale: 2, rotation },
      modifiers: NO_KEYS,
      pointerType: 'mouse',
    });
  /** Press at `from`, move to `to`, let go there. */
  const drag = (from: Point, to: Point, rotation: Rotation = 0) => {
    pointer('down', from, { rotation });
    pointer('move', to, { rotation });
    pointer('up', to, { rotation });
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve));
  return { ...fixture, interaction, events, pointer, drag, settle };
}

describe('the snapshot tool', () => {
  it('is a tool the render plugin adds beside the built-in ones', async () => {
    const fixture = await bootTool();
    const tool = fixture.interaction.getTool('snapshot');
    expect(tool).toMatchObject({ id: 'snapshot', cursor: 'crosshair', touch: 'draw' });
    expect(tool!.enables.has('snapshot-box')).toBe(true);
    await fixture.kernel.destroy();
  });

  it('a drag takes the box as a PNG at 2 pixels per point, once the changes are in', async () => {
    const fixture = await bootTool();
    fixture.interaction.activateTool('snapshot');
    fixture.drag({ x: 100, y: 200 }, { x: 300, y: 150 });

    const snapshot = fixture.render.getSnapshot();
    expect(snapshot).toMatchObject({
      page: PAGE,
      rect: { x: 100, y: 150, width: 200, height: 50 },
    });
    expect(fixture.events).toEqual([{ snapshot }]);
    await fixture.settle();
    expect(fixture.imageCalls).toHaveLength(1);
    expect(fixture.imageCalls[0]!.options).toMatchObject({
      target: { kind: 'rect', rect: { x: 100, y: 150, width: 200, height: 50 } },
      viewport: { kind: 'scale', scale: 2 },
      format: 'png',
    });
    expect(fixture.imageCalls[0]!.options.rotation).toBeUndefined();
    fixture.tasks[0]!.resolve(image('shot'));
    expect(await snapshot!.image).toMatchObject({ key: 'shot' });
    // The box stays on its page, held.
    expect(fixture.render.getSnapshotBox(PAGE)).toEqual(snapshot!.rect);
    expect(fixture.render.getSnapshotBox(toPageRef(22))).toBeNull();
    await fixture.kernel.destroy();
  });

  it('shows the box only once the drag is a box, and keeps it on its page', async () => {
    const fixture = await bootTool();
    fixture.interaction.activateTool('snapshot');
    fixture.pointer('down', { x: 600, y: 780 });
    fixture.pointer('move', { x: 601, y: 781 }); // 2 view px: still a click
    expect(fixture.render.getSnapshotBox(PAGE)).toBeNull();
    fixture.pointer('move', { x: 700, y: 900 }); // past the page's corner
    const box = fixture.render.getSnapshotBox(PAGE);
    expect(box).toEqual({ x: 600, y: 780, width: 12, height: 12 });
    expect(fixture.render.getSnapshotBox(PAGE)).toBe(box);
    expect(fixture.render.getSnapshot()).toBeNull(); // not until it's let go
    await fixture.kernel.destroy();
  });

  it('a click takes the whole page', async () => {
    const fixture = await bootTool();
    fixture.interaction.activateTool('snapshot');
    fixture.drag({ x: 300, y: 300 }, { x: 301, y: 300 });
    expect(fixture.render.getSnapshot()?.rect).toEqual({ x: 0, y: 0, width: 612, height: 792 });
    await fixture.kernel.destroy();
  });

  it('turns the picture as the page is shown', async () => {
    const fixture = await bootTool();
    fixture.interaction.activateTool('snapshot');
    fixture.drag({ x: 10, y: 10 }, { x: 110, y: 60 }, 90);
    await fixture.settle();
    expect(fixture.imageCalls[0]!.options.rotation).toBe(90);
    await fixture.kernel.destroy();
  });

  it('waits for a change on its way before it renders', async () => {
    const fixture = await bootTool();
    const answer = fixture.stage({
      label: { key: 'pages.rotate' },
      ops: [{ type: 'pages.rotate', pages: [toPageRef(22)], rotation: 90 }],
    } as never);
    fixture.interaction.activateTool('snapshot');
    fixture.drag({ x: 100, y: 100 }, { x: 200, y: 200 });
    await fixture.settle();
    expect(fixture.imageCalls).toHaveLength(0);
    answer.resolve({ ok: true });
    await fixture.settle();
    await fixture.settle();
    expect(fixture.imageCalls).toHaveLength(1);
    await fixture.kernel.destroy();
  });

  it('lets go on Escape’s verb, on another tool, and when the next one starts', async () => {
    const fixture = await bootTool();
    fixture.interaction.activateTool('snapshot');
    fixture.drag({ x: 100, y: 100 }, { x: 200, y: 200 });
    const first = fixture.render.getSnapshot()!;
    // The next press lets the first go; its picture stops.
    fixture.drag({ x: 300, y: 300 }, { x: 400, y: 400 });
    await expect(first.image).rejects.toMatchObject({ code: 'operation-cancelled' });
    const second = fixture.render.getSnapshot()!;
    expect(fixture.events).toEqual([{ snapshot: first }, { snapshot: null }, { snapshot: second }]);

    fixture.render.clearSnapshot();
    expect(fixture.render.getSnapshot()).toBeNull();
    expect(fixture.render.getSnapshotBox(PAGE)).toBeNull();

    fixture.drag({ x: 100, y: 100 }, { x: 200, y: 200 });
    fixture.interaction.activateTool('pointer');
    expect(fixture.render.getSnapshot()).toBeNull();
    expect(fixture.events.at(-1)).toEqual({ snapshot: null });
    await fixture.kernel.destroy();
  });

  it('a cancelled drag takes nothing; a press between pages does nothing', async () => {
    const fixture = await bootTool();
    fixture.interaction.activateTool('snapshot');
    fixture.pointer('down', { x: 100, y: 100 });
    fixture.pointer('move', { x: 200, y: 200 });
    fixture.pointer('cancel', { x: 200, y: 200 });
    expect(fixture.render.getSnapshotBox(PAGE)).toBeNull();
    expect(fixture.render.getSnapshot()).toBeNull();

    fixture.interaction.dispatchPointer({
      phase: 'down',
      viewport: { x: 5, y: 5 },
      modifiers: NO_KEYS,
    });
    expect(fixture.render.getSnapshotBox(PAGE)).toBeNull();
    expect(fixture.events).toEqual([]);
    await fixture.kernel.destroy();
  });

  it('needs doc.content.copy as well as doc.render', async () => {
    const fixture = await bootTool({ allows: (capability) => capability !== 'doc.content.copy' });
    expect(fixture.render.canSnapshot()).toBe(false);
    fixture.interaction.activateTool('snapshot');
    fixture.drag({ x: 100, y: 100 }, { x: 200, y: 200 });
    expect(fixture.render.getSnapshotBox(PAGE)).toBeNull();
    expect(fixture.render.getSnapshot()).toBeNull();
    await fixture.kernel.destroy();

    const unseen = await bootTool({ allows: (capability) => capability !== 'doc.render' });
    expect(unseen.render.canSnapshot()).toBe(false);
    await unseen.kernel.destroy();

    const allowed = await bootTool();
    expect(allowed.render.canSnapshot()).toBe(true);
    await allowed.kernel.destroy();
  });

  it('takes its size from the setting, lowered to fit the budget', async () => {
    const fixture = await bootTool({ config: { snapshot: { scale: 1 } } });
    fixture.interaction.activateTool('snapshot');
    fixture.drag({ x: 100, y: 100 }, { x: 200, y: 200 });
    await fixture.settle();
    expect(fixture.imageCalls[0]!.options.viewport).toEqual({ kind: 'scale', scale: 1 });
    await fixture.kernel.destroy();
  });

  it('takes its box look whole: a color left out follows the accent again', async () => {
    const fixture = await bootTool({
      config: { snapshot: { box: { fill: 'blue', stroke: 'navy' } } },
    });
    fixture.render.updateSettings({ snapshot: { box: { fill: 'red' } } });
    expect(fixture.render.getSettings().snapshot).toEqual({
      scale: 2,
      box: { fill: 'red', stroke: null },
    });
    await fixture.kernel.destroy();
  });
});

describe('a snapshot’s scale', () => {
  const page = { x: 0, y: 0, width: 612, height: 792 };
  const pixels = (scale: number) => Math.ceil(page.width * scale) * Math.ceil(page.height * scale);

  it('is the setting when the picture fits', () => {
    expect(snapshotScale(page, 2, { kind: 'continuous' })).toBe(2);
  });

  it('fits 16 million pixels, or a smaller deployment budget', () => {
    const local = snapshotScale(page, 10, { kind: 'continuous' });
    expect(pixels(local)).toBeLessThanOrEqual(16_000_000);
    expect(pixels(local)).toBeGreaterThan(15_900_000);

    const cloud = snapshotScale(page, 10, {
      kind: 'lattice',
      fullPage: { widths: [640] },
      maxRenderPixels: 4_000_000,
      formats: ['webp'],
      background: 'white',
      enforced: true,
    });
    expect(pixels(cloud)).toBeLessThanOrEqual(4_000_000);
    expect(pixels(cloud)).toBeGreaterThan(3_950_000);
  });
});
