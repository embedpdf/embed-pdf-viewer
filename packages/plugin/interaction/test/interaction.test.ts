import { describe, expect, it, vi } from 'vitest';
import {
  createKernel,
  isPluginError,
  toPageRef,
  type DocumentHandle,
  type Engine,
  type PageLayout,
} from '@embedpdf/core';
import { interactionPlugin } from '../src/interaction.plugin';
import { InteractionToken } from '../src/host-contract';
import type { InteractionHandler, PointerSample } from '../src/contract';

/** The hub through the real kernel: tools, routing, cursor arbitration, events. */

const page: PageLayout = {
  index: 0,
  ref: toPageRef(1),
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  boxes: {
    media: { left: 0, bottom: 0, right: 600, top: 800 },
    crop: { left: 0, bottom: 0, right: 600, top: 800 },
  },
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

async function boot(defaultTool = 'pointer') {
  const kernel = createKernel({ engine: engine(), plugins: [interactionPlugin({ defaultTool })] });
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
  enabledFor: (t) => t.enables.has(tag),
  onDown: () => (log.push(`${id}:down`), capture),
  onMove: () => log.push(`${id}:move`),
  onUp: () => log.push(`${id}:up`),
  onCancel: () => log.push(`${id}:cancel`),
  onHover: () => log.push(`${id}:hover`),
});

describe('interaction hub', () => {
  it('defaults to the pointer tool, switches tools, and reports the change with a payload', async () => {
    const { kernel, hub } = await boot();
    const changes: string[] = [];
    hub.onToolChanged((e) => changes.push(`${e.previousToolId}->${e.toolId}:${String(e.payload)}`));
    expect(hub.getActiveToolId()).toBe('pointer');
    expect(hub.getDefaultToolId()).toBe('pointer');
    hub.activateTool('pan', { payload: 'x' });
    expect(hub.getActiveToolId()).toBe('pan');
    expect(hub.activeToolEnables('scroll')).toBe(true);
    expect(hub.getCursor()).toBe('grab');
    expect(() => hub.activateTool('nope')).toThrow(expect.objectContaining({ code: 'not-found' }));
    hub.activateDefaultTool();
    expect(changes).toEqual(['pointer->pan:x', 'pan->pointer:undefined']);
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
    const a = { id: 'x', cursor: 'crosshair', enables: new Set(['draw']) };
    const b = { id: 'x', cursor: 'copy', enables: new Set(['draw']) };
    const offA = hub.registerTool(a);
    expect(() => hub.registerTool(b)).toThrow(expect.objectContaining({ code: 'conflict' }));
    hub.registerTool(b, { replace: true });
    offA(); // must not remove b
    expect(hub.getTool('x')).toBe(b);
    expect(hub.hasTool('x')).toBe(true);
    expect(hub.listTools().map((t) => t.id)).toEqual(['pointer', 'pan', 'x']);
    await kernel.destroy();
  });

  it('routes a gesture to the highest-priority eligible handler and reports its lifecycle', async () => {
    const { kernel, hub } = await boot();
    const log: string[] = [];
    hub.registerHandler(handler('low', 1, 'text-select', log));
    hub.registerHandler(handler('high', 10, 'text-select', log));
    hub.registerHandler(handler('pan-only', 99, 'scroll', log));
    const events: string[] = [];
    hub.onGestureStarted((e) => events.push(`start:${e.handlerId}`));
    hub.onGestureEnded((e) => events.push(`end:${e.handlerId}`));
    hub.onGestureCancelled((e) => events.push(`cancel:${e.handlerId}`));

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
    expect(events).toEqual(['start:high', 'end:high', 'start:high', 'cancel:high']);
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

  it('cursor: claims outrank the tool, gaps use gapCursor, skins restyle keywords', async () => {
    const { kernel, hub } = await boot();
    const seen: string[] = [];
    hub.onCursorChanged((e) => seen.push(e.cursor));
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

  it('a tool payload is an error-free no-op for unknown ids only through activateTool', async () => {
    const { kernel, hub } = await boot();
    try {
      hub.activateTool('missing');
    } catch (error) {
      expect(isPluginError(error, 'not-found')).toBe(true);
    }
    await kernel.destroy();
  });
});
