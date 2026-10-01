import { describe, expect, it, vi } from 'vitest';
import {
  createKernel,
  toPageRef,
  type DocumentHandle,
  type Engine,
  type PageLayout,
} from '@embedpdf/core';
import { interactionPlugin } from '../src/interaction.plugin';
import { InteractionToken } from '../src/host-contract';
import type { InteractionHandler, PointerSample } from '../src/host-contract';
import type { InteractionConfig, ToolPointerEvent } from '../src/contract';
import { interactionState } from '../src/state';
import { feedbackPlugin } from '../src/feedback';
import { FeedbackToken } from '../src/feedback.types';

/** A page's boxes in page space, each measured from the crop box's top-left; bleed, trim and art are the crop. */
const pageBoxesIn = (
  media: { left: number; bottom: number; right: number; top: number },
  crop: { left: number; bottom: number; right: number; top: number },
) => {
  const boxOf = (rect: typeof crop) => ({
    x: rect.left - crop.left,
    y: crop.top - rect.top,
    width: rect.right - rect.left,
    height: rect.top - rect.bottom,
  });
  return {
    media: boxOf(media),
    crop: boxOf(crop),
    bleed: boxOf(crop),
    trim: boxOf(crop),
    art: boxOf(crop),
  };
};

/** The hub through the real kernel: tools, routing, cursor arbitration, events. */

const page: PageLayout = {
  index: 0,
  ref: toPageRef(1),
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  boxes: pageBoxesIn(
    { left: 0, bottom: 0, right: 600, top: 800 },
    { left: 0, bottom: 0, right: 600, top: 800 },
  ),
  pdfCropBox: { left: 0, bottom: 0, right: 600, top: 800 },
} as PageLayout;

function engine(): Engine {
  const handle = {
    id: 'd',
    events: { subscribe: () => () => {}, lastServerId: () => null },
    pages: { list: () => Promise.resolve({ pageCount: 1, pages: [page] }) },
    security: { allows: () => true },
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
  return {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
}

async function boot(config: InteractionConfig = {}) {
  const kernel = createKernel({ engine: engine(), plugins: [interactionPlugin(config)] });
  await kernel.start();
  await kernel.documents.open({ kind: 'bytes', id: 'd', bytes: new Uint8Array() });
  return { kernel, hub: kernel.capability(InteractionToken, 'd') };
}

const sample = (phase: PointerSample['phase'], onPage = true): PointerSample => ({
  phase,
  viewport: { x: 0, y: 0 },
  ...(onPage ? { page: { ref: toPageRef(1), point: { x: 0, y: 0 } } } : {}),
  modifiers: { shift: false, alt: false, ctrl: false, meta: false },
});

const handler = (
  id: string,
  priority: number,
  tag: string,
  log: string[],
  capture = true,
): InteractionHandler => ({
  id,
  priority,
  enabledFor: (tool) => tool.enables.has(tag),
  onDown: () => (log.push(`${id}:down`), capture),
  onMove: () => log.push(`${id}:move`),
  onUp: () => log.push(`${id}:up`),
  onCancel: () => log.push(`${id}:cancel`),
  onHover: () => log.push(`${id}:hover`),
});

describe('interaction hub', () => {
  it('defaults to the pointer tool, switches tools, and reports each change', async () => {
    const { kernel, hub } = await boot();
    const changes: string[] = [];
    hub.onToolChanged((event) => changes.push(`${event.previousToolId}->${event.toolId}`));
    expect(hub.getActiveToolId()).toBe('pointer');
    expect(hub.getDefaultToolId()).toBe('pointer');
    hub.activateTool('pan');
    expect(hub.getActiveToolId()).toBe('pan');
    expect(hub.activeToolEnables('scroll')).toBe(true);
    expect(hub.getCursor()).toBe('grab');
    expect(() => hub.activateTool('nope')).toThrow(expect.objectContaining({ code: 'not-found' }));
    hub.activateDefaultTool();
    expect(changes).toEqual(['pointer->pan', 'pan->pointer']);
    await kernel.destroy();
  });

  it('announces every activation, including activating the active tool again', async () => {
    const { kernel, hub } = await boot();
    const events: unknown[] = [];
    hub.onToolChanged((event) => events.push(event));
    hub.activateTool('pan');
    hub.activateTool('pan');
    expect(events).toEqual([
      { toolId: 'pan', previousToolId: 'pointer' },
      { toolId: 'pan', previousToolId: 'pan' },
    ]);
    await kernel.destroy();
  });

  it('pushTool / popTool restore the previous tool', async () => {
    const { kernel, hub } = await boot();
    hub.pushTool('pan');
    expect(hub.getActiveToolId()).toBe('pan');
    hub.popTool();
    expect(hub.getActiveToolId()).toBe('pointer');
    hub.popTool(); // empty stack: no-op
    expect(hub.getActiveToolId()).toBe('pointer');
    await kernel.destroy();
  });

  it('registerTool rejects duplicates unless replaced, and a remover owns only its registration', async () => {
    const { kernel, hub } = await boot();
    const first = { id: 'x', cursor: 'crosshair', enables: new Set(['draw']) };
    const second = { id: 'x', cursor: 'copy', enables: new Set(['draw']) };
    const removeFirst = hub.registerTool(first);
    expect(() => hub.registerTool(second)).toThrow(expect.objectContaining({ code: 'conflict' }));
    hub.registerTool(second, { replace: true });
    removeFirst(); // must not remove the replacement
    expect(hub.getTool('x')?.cursor).toBe('copy');
    expect(hub.hasTool('x')).toBe(true);
    expect(hub.listTools().map((tool) => tool.id)).toEqual(['pointer', 'pan', 'x']);
    await kernel.destroy();
  });

  it('wakes readers when a tool is registered and again when it is removed', async () => {
    const { kernel, hub } = await boot();
    const tools = hub.listTools();
    expect(hub.listTools()).toBe(tools); // reference-stable while unchanged
    const listener = vi.fn();
    const unsubscribe = kernel.subscribe(listener);

    const remove = hub.registerTool({ id: 'ink', cursor: 'crosshair', enables: new Set(['draw']) });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(hub.listTools()).not.toBe(tools);
    expect(hub.hasTool('ink')).toBe(true);

    const withInk = hub.listTools();
    remove();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(hub.listTools()).not.toBe(withInk);
    expect(hub.getTool('ink')).toBeNull();
    remove(); // already removed: changes nothing and wakes no one
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    await kernel.destroy();
  });

  it('routes a gesture to the highest-priority eligible handler and reports its lifecycle', async () => {
    const { kernel, hub } = await boot();
    const log: string[] = [];
    hub.registerHandler(handler('low', 1, 'text-select', log));
    hub.registerHandler(handler('high', 10, 'text-select', log));
    hub.registerHandler(handler('pan-only', 99, 'scroll', log));
    const events: string[] = [];
    hub.onGestureStarted((event) => events.push(`start:${event.toolId}`));
    hub.onGestureEnded((event) => events.push(`end:${event.toolId}`));
    hub.onGestureCancelled((event) => events.push(`cancel:${event.toolId}`));

    hub.dispatchPointer(sample('move')); // hover, no owner
    hub.dispatchPointer(sample('down'));
    hub.dispatchPointer(sample('move'));
    hub.dispatchPointer(sample('up'));
    hub.dispatchPointer(sample('down'));
    hub.dispatchPointer(sample('cancel'));

    expect(log).toEqual([
      'high:hover',
      'low:hover',
      'high:down',
      'high:move',
      'high:up',
      'high:down',
      'high:cancel',
    ]);
    expect(events).toEqual(['start:pointer', 'end:pointer', 'start:pointer', 'cancel:pointer']);
    await kernel.destroy();
  });

  it('a non-capturing handler passes the gesture on', async () => {
    const { kernel, hub } = await boot();
    const log: string[] = [];
    hub.registerHandler(handler('first', 10, 'text-select', log, false));
    hub.registerHandler(handler('second', 5, 'text-select', log));
    hub.dispatchPointer(sample('down'));
    hub.dispatchPointer(sample('up'));
    expect(log).toEqual(['first:down', 'second:down', 'second:up']);
    await kernel.destroy();
  });

  it('cursor: claims outrank the tool, gaps use gapCursor, setToolCursor replaces keywords', async () => {
    const { kernel, hub } = await boot();
    const seen: string[] = [];
    hub.onCursorChanged((event) => seen.push(event.cursor));
    hub.dispatchPointer(sample('move', true));
    expect(hub.getCursor()).toBe('default');
    hub.claimCursor('sel', 'text', 10);
    expect(hub.getCursor()).toBe('text');
    hub.setToolCursor('pointer', { text: 'url(ibeam.svg), text' });
    expect(hub.getCursor()).toBe('url(ibeam.svg), text');
    hub.claimCursor('sel', null);
    hub.dispatchPointer(sample('move', false)); // over a gap
    expect(hub.getCursor()).toBe('default');
    hub.activateTool('pan');
    expect(hub.getCursor()).toBe('grab');
    expect(seen).toEqual(['text', 'url(ibeam.svg), text', 'default', 'grab']);
    await kernel.destroy();
  });

  it('lens scoping: a source-bound handler only sees its own lens; unstamped samples route everywhere', async () => {
    const { kernel, hub } = await boot();
    const log: string[] = [];
    hub.registerHandler(handler('main', 1, 'text-select', log), { source: 'stage' });
    hub.registerHandler(handler('thumbs', 1, 'text-select', log), { source: 'thumbs' });
    hub.dispatchPointer({ ...sample('down'), source: 'thumbs' });
    hub.dispatchPointer({ ...sample('up'), source: 'thumbs' });
    hub.dispatchPointer(sample('down'));
    expect(log).toEqual(['thumbs:down', 'thumbs:up', 'main:down']);
    await kernel.destroy();
  });

  it('wouldClaimTouch walks eligible handlers in priority order without capturing', async () => {
    const { kernel, hub } = await boot();
    const log: string[] = [];
    hub.registerHandler({ ...handler('claimer', 5, 'text-select', log), claimsTouch: () => true });
    expect(hub.wouldClaimTouch(sample('down'))).toBe(true);
    expect(log).toEqual([]);
    await kernel.destroy();
  });

  it('rejects an unknown tool without changing the armed one or announcing', async () => {
    const { kernel, hub } = await boot();
    const changes = vi.fn();
    hub.onToolChanged(changes);
    expect(() => hub.pushTool('missing')).toThrow(expect.objectContaining({ code: 'not-found' }));
    expect(hub.getActiveToolId()).toBe('pointer');
    expect(changes).not.toHaveBeenCalled();
    await kernel.destroy();
  });
});

describe('settings', () => {
  it('opens a document on the defaultTool setting, and activateDefaultTool follows a change', async () => {
    const { kernel, hub } = await boot({ defaultTool: 'pan' });
    expect(hub.getActiveToolId()).toBe('pan');
    expect(hub.getDefaultToolId()).toBe('pan');
    hub.activateTool('pointer');
    hub.updateSettings({ defaultTool: 'pointer' });
    hub.activateTool('pan');
    hub.activateDefaultTool();
    expect(hub.getActiveToolId()).toBe('pointer');
    hub.resetSettings();
    expect(hub.getDefaultToolId()).toBe('pan');
    await kernel.destroy();
  });

  it('registers the tools setting from the start, and swaps them when it changes', async () => {
    const pin = { id: 'pin', cursor: 'copy' };
    const { kernel, hub } = await boot({ tools: [pin] });
    expect(hub.listTools().map((tool) => tool.id)).toEqual(['pointer', 'pan', 'pin']);
    expect(hub.getTool('pin')?.enables.size).toBe(0);
    const changed = vi.fn();
    hub.onSettingsChanged(changed);
    const tools = hub.listTools();
    hub.updateSettings({ tools: [{ id: 'ruler', cursor: 'crosshair' }] });
    expect(hub.listTools()).not.toBe(tools);
    expect(hub.listTools().map((tool) => tool.id)).toEqual(['pointer', 'pan', 'ruler']);
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ changed: ['tools'] }));
    await kernel.destroy();
  });

  it('declares the State table: the active tool and the tools, empty without a document', async () => {
    const { kernel, hub } = await boot();
    expect(interactionState.read(hub)).toEqual({
      activeToolId: 'pointer',
      tools: hub.listTools(),
    });
    expect(interactionState.empty).toEqual({ activeToolId: null, tools: [] });
    await kernel.destroy();
  });
});

describe('a tool with its own pointer methods', () => {
  const at = (
    phase: PointerSample['phase'],
    point: { x: number; y: number } | null,
    project?: { x: number; y: number },
  ): PointerSample => ({
    phase,
    viewport: { x: 0, y: 0 },
    ...(point ? { page: { ref: toPageRef(1), point } } : {}),
    ...(project ? { project: () => project } : {}),
    modifiers: { shift: true, alt: false, ctrl: false, meta: false },
    pointerType: 'pen',
  });
  const pointsOf = (calls: Array<[ToolPointerEvent]>) => calls.map(([event]) => event.point);

  it('gets a press on a page in page coordinates, and the rest of a gesture it takes', async () => {
    const { kernel, hub } = await boot();
    const down = vi.fn((_event: ToolPointerEvent) => true);
    const move = vi.fn((_event: ToolPointerEvent) => {});
    const up = vi.fn((_event: ToolPointerEvent) => {});
    hub.registerTool({
      id: 'ruler',
      cursor: 'crosshair',
      touch: 'draw',
      onPointerDown: down,
      onPointerMove: move,
      onPointerUp: up,
    });
    const started = vi.fn();
    hub.onGestureStarted(started);
    hub.activateTool('ruler');
    expect(hub.getActiveTool().touch).toBe('draw');

    hub.dispatchPointer(at('down', { x: 10, y: 20 }));
    hub.dispatchPointer(at('move', { x: 30, y: 40 }));
    // Off the page: the source projects the pointer onto the gesture's page.
    hub.dispatchPointer(at('move', null, { x: -5, y: 900 }));
    hub.dispatchPointer(at('up', null));

    expect(down.mock.calls[0][0]).toEqual({
      page: toPageRef(1),
      point: { x: 10, y: 20 },
      modifiers: { shift: true, alt: false, ctrl: false, meta: false },
      pointerType: 'pen',
    });
    expect(pointsOf(move.mock.calls)).toEqual([
      { x: 30, y: 40 },
      { x: -5, y: 900 },
    ]);
    // The release can't be projected: it ends where the gesture last was.
    expect(pointsOf(up.mock.calls)).toEqual([{ x: -5, y: 900 }]);
    expect(started).toHaveBeenCalledWith({
      toolId: 'ruler',
      page: toPageRef(1),
      pointerType: 'pen',
    });
    await kernel.destroy();
  });

  it('passes a press it does not take on, and ends a cancelled gesture with onPointerUp', async () => {
    const { kernel, hub } = await boot();
    const log: string[] = [];
    let take = false;
    hub.registerTool({
      id: 'pin',
      cursor: 'copy',
      onPointerDown: () => take,
      onPointerUp: () => log.push('pin:up'),
      onHover: (event) => log.push(`pin:hover:${event.point.x}`),
    });
    hub.registerHandler({ ...handler('fallback', 10, 'unused', log), enabledFor: () => true });
    hub.activateTool('pin');

    hub.dispatchPointer(at('move', { x: 7, y: 7 }));
    hub.dispatchPointer(at('move', null)); // over a gap: no hover for the tool
    hub.dispatchPointer(at('down', { x: 1, y: 1 }));
    hub.dispatchPointer(at('up', { x: 1, y: 1 }));
    take = true;
    hub.dispatchPointer(at('down', { x: 1, y: 1 }));
    hub.dispatchPointer(at('cancel', { x: 2, y: 2 }));

    expect(log).toEqual([
      'pin:hover:7',
      'fallback:hover',
      'fallback:hover',
      'fallback:down',
      'fallback:up',
      'pin:up',
    ]);
    await kernel.destroy();
  });

  it('acts only while its tool is active, and goes with its tool', async () => {
    const { kernel, hub } = await boot();
    const down = vi.fn(() => true);
    const remove = hub.registerTool({ id: 'pin', cursor: 'copy', onPointerDown: down });
    hub.dispatchPointer(at('down', { x: 1, y: 1 }));
    expect(down).not.toHaveBeenCalled();
    hub.activateTool('pin');
    remove();
    hub.dispatchPointer(at('down', { x: 1, y: 1 }));
    expect(down).not.toHaveBeenCalled();

    const replaced = vi.fn(() => true);
    hub.registerTool({ id: 'pin', cursor: 'copy', onPointerDown: down });
    hub.registerTool({ id: 'pin', cursor: 'copy', onPointerDown: replaced }, { replace: true });
    hub.activateTool('pin');
    hub.dispatchPointer(at('down', { x: 1, y: 1 }));
    expect(down).not.toHaveBeenCalled();
    expect(replaced).toHaveBeenCalledTimes(1);
    await kernel.destroy();
  });
});

describe('feedback plugin', () => {
  it('exposes the injected provider, or a no-op without one', async () => {
    const provider = { selection: vi.fn(), impact: vi.fn(), notify: vi.fn() };
    const kernel = createKernel({ engine: engine(), plugins: [feedbackPlugin({ provider })] });
    await kernel.start();
    kernel.capability(FeedbackToken).impact('light');
    expect(provider.impact).toHaveBeenCalledWith('light');
    await kernel.destroy();

    const silent = createKernel({ engine: engine(), plugins: [feedbackPlugin()] });
    await silent.start();
    expect(() => silent.capability(FeedbackToken).notify('success')).not.toThrow();
    await silent.destroy();
  });
});
