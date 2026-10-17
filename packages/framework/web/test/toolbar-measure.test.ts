import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createToolbarLengths,
  observeContentHeight,
  observeContentLength,
  observeContentWidth,
  observeHeight,
  observeLength,
  observeWidth,
  toolbarMeasureKey,
} from '../src/toolbar-measure';

/** ResizeObserver stand-in: one per observe, resized by hand. */
function observers() {
  const created: Array<{
    callback: (entries: Array<{ contentRect: { width: number; height: number } }>) => void;
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

describe('createToolbarLengths', () => {
  it('turns reported lengths into fit metrics, ignoring changes under half a pixel', () => {
    const lengths = createToolbarLengths();
    const zoom = toolbarMeasureKey.unit('main:zoom', 'icon');
    expect(lengths.report('horizontal', zoom, 32)).toBe(true);
    expect(lengths.report('horizontal', zoom, 32.4)).toBe(false);
    expect(lengths.report('horizontal', toolbarMeasureKey.group('view'), 80)).toBe(true);
    expect(lengths.report('horizontal', toolbarMeasureKey.groupTrigger('view'), 24)).toBe(true);

    const metrics = lengths.metrics('horizontal', 8, 1);
    expect(metrics.unit('main:zoom', 'icon')).toBe(32);
    expect(metrics.unit('main:zoom', 'label')).toBeUndefined();
    expect(metrics.groupCollapsed('view')).toBe(80);
    expect(metrics.groupTrigger('view')).toBe(24);
    // The "More" button counts as 32 px until measured; a separator is its width plus one gap.
    expect(metrics.overflowTrigger).toBe(32);
    expect(metrics.separator).toBe(9);
    lengths.report('horizontal', toolbarMeasureKey.overflowTrigger, 40);
    expect(lengths.metrics('horizontal', 8, 1).overflowTrigger).toBe(40);
  });

  it('keeps each orientation’s lengths apart', () => {
    const lengths = createToolbarLengths();
    const zoom = toolbarMeasureKey.unit('rail:zoom', 'icon');
    lengths.report('horizontal', zoom, 32);
    expect(lengths.metrics('vertical', 8, 1).unit('rail:zoom', 'icon')).toBeUndefined();
    // The same key on the other axis is a first report, not a change under half a pixel.
    expect(lengths.report('vertical', zoom, 32.2)).toBe(true);
    expect(lengths.metrics('vertical', 8, 1).unit('rail:zoom', 'icon')).toBe(32.2);
    expect(lengths.metrics('horizontal', 8, 1).unit('rail:zoom', 'icon')).toBe(32);
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
    created[0]!.callback([{ contentRect: { width: 300.4, height: 0 } }]);
    created[0]!.callback([{ contentRect: { width: 280, height: 0 } }]);
    expect(onWidth.mock.calls).toEqual([[300], [280]]);
  });
});

describe('observing heights', () => {
  it('reports an element’s height, and lengths along either orientation', () => {
    const created = observers();
    let height = 30;
    const element = { getBoundingClientRect: () => ({ width: 90, height }) } as unknown as Element;
    const onHeight = vi.fn();
    observeHeight(element, onHeight);
    height = 36;
    created[0]!.callback([]);
    expect(onHeight.mock.calls).toEqual([[30], [36]]);

    const onLength = vi.fn();
    observeLength(element, 'vertical', onLength);
    observeLength(element, 'horizontal', onLength);
    expect(onLength.mock.calls).toEqual([[36], [90]]);
  });

  it('reports a container’s height now, then only changes over half a pixel', () => {
    const created = observers();
    const onHeight = vi.fn();
    observeContentHeight({ clientWidth: 48, clientHeight: 600 } as HTMLElement, onHeight);
    created[0]!.callback([{ contentRect: { width: 48, height: 600.3 } }]);
    created[0]!.callback([{ contentRect: { width: 48, height: 540 } }]);
    expect(onHeight.mock.calls).toEqual([[600], [540]]);

    const onLength = vi.fn();
    observeContentLength(
      { clientWidth: 48, clientHeight: 600 } as HTMLElement,
      'vertical',
      onLength,
    );
    observeContentLength(
      { clientWidth: 48, clientHeight: 600 } as HTMLElement,
      'horizontal',
      onLength,
    );
    expect(onLength.mock.calls).toEqual([[600], [48]]);
  });
});
