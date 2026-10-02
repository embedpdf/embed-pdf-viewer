import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createToolbarWidths,
  observeContentWidth,
  observeWidth,
  toolbarMeasureKey,
} from '../src/toolbar-measure';

/** ResizeObserver stand-in: one per observe, resized by hand. */
function observers() {
  const created: Array<{
    callback: (entries: Array<{ contentRect: { width: number } }>) => void;
    disconnected: boolean;
  }> = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      record: (typeof created)[number];
      constructor(callback: (typeof created)[number]['callback']) {
        this.record = { callback, disconnected: false };
        created.push(this.record);
      }
      observe() {}
      disconnect() {
        this.record.disconnected = true;
      }
    },
  );
  return created;
}

afterEach(() => vi.unstubAllGlobals());

describe('createToolbarWidths', () => {
  it('turns reported widths into fit metrics, ignoring changes under half a pixel', () => {
    const widths = createToolbarWidths();
    expect(widths.report(toolbarMeasureKey.unit('main:zoom', 'icon'), 32)).toBe(true);
    expect(widths.report(toolbarMeasureKey.unit('main:zoom', 'icon'), 32.4)).toBe(false);
    expect(widths.report(toolbarMeasureKey.group('view'), 80)).toBe(true);
    expect(widths.report(toolbarMeasureKey.groupTrigger('view'), 24)).toBe(true);

    const metrics = widths.metrics(8, 1);
    expect(metrics.unit('main:zoom', 'icon')).toBe(32);
    expect(metrics.unit('main:zoom', 'label')).toBeUndefined();
    expect(metrics.groupCollapsed('view')).toBe(80);
    expect(metrics.groupTrigger('view')).toBe(24);
    // The "More" button counts as 32 px until measured; a separator is its width plus one gap.
    expect(metrics.overflowTrigger).toBe(32);
    expect(metrics.separator).toBe(9);
    widths.report(toolbarMeasureKey.overflowTrigger, 40);
    expect(widths.metrics(8, 1).overflowTrigger).toBe(40);
  });
});

describe('observing widths', () => {
  it('reports an element’s width now and on every resize, until detached', () => {
    const created = observers();
    let width = 50;
    const element = { getBoundingClientRect: () => ({ width }) } as unknown as Element;
    const onWidth = vi.fn();
    const detach = observeWidth(element, onWidth);
    width = 60;
    created[0]!.callback([]);
    expect(onWidth.mock.calls).toEqual([[50], [60]]);
    detach();
    expect(created[0]!.disconnected).toBe(true);
  });

  it('reports a container’s width now, then only changes over half a pixel', () => {
    const created = observers();
    const onWidth = vi.fn();
    observeContentWidth({ clientWidth: 300 } as HTMLElement, onWidth);
    created[0]!.callback([{ contentRect: { width: 300.4 } }]);
    created[0]!.callback([{ contentRect: { width: 280 } }]);
    expect(onWidth.mock.calls).toEqual([[300], [280]]);
  });
});
