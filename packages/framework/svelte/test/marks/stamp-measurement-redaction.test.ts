import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { definePlugin, toPageRef } from '@embedpdf/core';
import type { Kernel } from '@embedpdf/core';
import { interactionPlugin } from '../../src/interaction';
import {
  MEASUREMENT_DEFAULTS,
  MeasurementToken,
  measurementPlugin,
  measurementState,
  useMeasurement,
  useMeasurementReadout,
  useMeasurementSettings,
  useMeasurementState,
  usePageScale,
} from '../../src/measurement';
import type {
  AnnotationRef,
  MeasurementCapability,
  MeasurementReadout,
  PageScale,
} from '../../src/measurement';
import {
  REDACTION_DEFAULTS,
  RedactionToken,
  redactionPlugin,
  redactionState,
  usePendingRedactions,
  useRedaction,
  useRedactionSettings,
  useRedactionState,
} from '../../src/redaction';
import type { RedactionCapability, RedactionMark, RedactionMarkFilter } from '../../src/redaction';
import type { CurrentValue } from '../../src/runtime';
import {
  STAMP_DEFAULTS,
  StampToken,
  stampPlugin,
  stampState,
  useStamp,
  useStampAssetPreviewUrl,
  useStampLibraries,
  useStampSettings,
  useStampState,
} from '../../src/stamp';
import type {
  StampAssetPreview,
  StampCapability,
  StampLibrary,
  StampLibraryFilter,
} from '../../src/stamp';
import { bytesInput } from '../fixtures/counter-plugin';
import Probes from '../fixtures/Probes.svelte';
import { signal } from '../fixtures/signal.svelte';
import Toggled from '../fixtures/Toggled.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * The stamp, measurement and redaction readers. Before any document opens (against the real
 * plugins): the state reads its declared `empty`, the settings the plugin's settings, the per-page
 * and per-mark reads answer empty, and the stamp API, which belongs to the workspace, works. Then
 * the binding itself (against small stand-ins for the plugins): a value follows a function and
 * changes only when it says something new, and a preview's object URL is revoked when it's no
 * longer shown.
 */

const plugins = () => [
  interactionPlugin(),
  annotationPlugin(),
  stampPlugin(),
  measurementPlugin({ presets: [] }),
  redactionPlugin({ overlay: { fill: '#112233' } }),
];

/** A probe that records `pick(reader())` on every change. */
const probe = <Result>(read: () => Result, pick: (result: Result) => unknown) => {
  const seen: unknown[] = [];
  return { read, pick: pick as (result: unknown) => unknown, seen };
};

describe('without a document', () => {
  it('the state readers read empty', async () => {
    const states = probe(
      () => [useStampState(), useMeasurementState(), useRedactionState()],
      (records) => records.map((record) => ({ ...record })),
    );
    await viewerWith(plugins(), Probes, { probes: [states] });
    expect(latest(states.seen)).toEqual([
      stampState.empty,
      measurementState.empty,
      redactionState.empty,
    ]);
  });

  it('a page scale, a readout and the pending marks answer empty', async () => {
    const ref = { kind: 'objectNumber' as const, page: toPageRef(1), objectNumber: 9 };
    const reads = probe(
      () => [
        usePageScale(0),
        usePageScale(null),
        useMeasurementReadout(ref),
        usePendingRedactions(),
      ],
      (values: CurrentValue<unknown>[]) => values.map((value) => value.current),
    );
    await viewerWith(plugins(), Probes, { probes: [reads] });
    expect(latest(reads.seen)).toEqual([
      { measure: null, source: 'default', ready: false, persistent: false },
      null,
      { unavailable: 'not-dimension' },
      [],
    ]);
  });

  it('the settings readers read the settings, and follow a change', async () => {
    const settings = probe(
      () => ({
        previewWidth: useStampSettings((settings) => settings.previewWidth),
        measurement: useMeasurementSettings(),
        fill: useRedactionSettings((settings) => settings.overlay.fill),
      }),
      ({ previewWidth, measurement, fill }) => [
        previewWidth.current,
        { ...measurement },
        fill.current,
      ],
    );
    const { kernel } = await viewerWith(plugins(), Probes, { probes: [settings] });
    expect(latest(settings.seen)).toEqual([
      STAMP_DEFAULTS.previewWidth,
      { ...MEASUREMENT_DEFAULTS, presets: [] },
      '#112233',
    ]);
    expect(REDACTION_DEFAULTS.overlay.fill).toBe('#000000');

    kernel.settingsOf(StampToken).updateSettings({ previewWidth: 64 });
    kernel.settingsOf(MeasurementToken).updateSettings({ defaultScale: 'imperial' });
    flushSync();
    expect(latest(settings.seen)).toEqual([
      64,
      { defaultScale: 'imperial', presets: [] },
      '#112233',
    ]);
  });

  it('the stamp API is there; a document verb says no document is open', async () => {
    let apis: {
      stamp: StampCapability;
      measurement: MeasurementCapability;
      redaction: RedactionCapability;
    } | null = null;
    const capture = probe(
      () =>
        (apis = { stamp: useStamp(), measurement: useMeasurement(), redaction: useRedaction() }),
      () => 0,
    );
    await viewerWith(plugins(), Probes, { probes: [capture] });
    const { stamp, measurement, redaction } = apis!;
    expect(stamp.listLibraries()).toEqual([]);
    expect(stamp.getArmedAsset()).toBeNull();
    expect(stamp.canPlace()).toBe(false);
    await expect(stamp.armAsset('any')).rejects.toMatchObject({ code: 'not-ready' });
    await expect(redaction.markPage(0)).rejects.toMatchObject({ code: 'not-ready' });
    expect(() => measurement.getPageScale(0)).toThrow(
      expect.objectContaining({ code: 'not-ready' }),
    );
  });
});

// ── the binding, against stand-ins for the plugins ─────────────────────────────

/** A stamp plugin that only lists libraries and hands out previews, and can change both. */
function fakeStamps() {
  let libraries: StampLibrary[] = [];
  const previews = new Map<string, StampAssetPreview>();
  let wake = () => {};
  const library = (id: string, kind: string) => ({ id, kind, name: id }) as unknown as StampLibrary;
  const plugin = definePlugin({
    id: 'stamp',
    scope: 'workspace',
    token: StampToken,
    create: (ctx) => {
      wake = () => ctx.notify();
      return {
        api: {
          // A new array on every read, as the plugin's.
          listLibraries: (filter?: StampLibraryFilter) =>
            libraries.filter(
              (each) =>
                filter?.kind === undefined ||
                ([] as string[]).concat(filter.kind).includes(each.kind),
            ),
          getAssetPreview: (assetId: string) => previews.get(assetId) ?? null,
        } as unknown as StampCapability,
      };
    },
  });
  return {
    plugin,
    addLibrary(id: string, kind: string) {
      libraries = [...libraries, library(id, kind)];
      wake();
    },
    addPreview(assetId: string) {
      previews.set(assetId, { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' });
      wake();
    },
    wake: () => wake(),
  };
}

describe('the stamp readers', () => {
  it('useStampLibraries follows a filter function, and changes only when the list does', async () => {
    const stamps = fakeStamps();
    stamps.addLibrary('standard', 'stamps');
    const kind = signal('stamps');
    const lists = probe(
      () => useStampLibraries(() => ({ kind: kind.value })),
      (libraries: CurrentValue<readonly StampLibrary[]>) => libraries.current,
    );
    await viewerWith([stamps.plugin], Probes, { probes: [lists] });
    const ids = () => (latest(lists.seen) as StampLibrary[]).map((each) => each.id);
    expect(ids()).toEqual(['standard']);

    // A change elsewhere reads an equal list: nothing runs again, and the list is the same one.
    const runs = lists.seen.length;
    const list = latest(lists.seen);
    stamps.wake();
    flushSync();
    expect(lists.seen).toHaveLength(runs);
    expect(latest(lists.seen)).toBe(list);

    stamps.addLibrary('seals', 'legal-seals');
    flushSync();
    expect(ids()).toEqual(['standard']);

    kind.value = 'legal-seals';
    flushSync();
    expect(ids()).toEqual(['seals']);
  });

  it('useStampAssetPreviewUrl makes a URL for the preview, and revokes it when it goes', async () => {
    let made = 0;
    const revoked: string[] = [];
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${made++}`);
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
      revoked.push(url);
    });
    try {
      const stamps = fakeStamps();
      stamps.addPreview('a');
      stamps.addPreview('b');
      const assetId = signal<string | null>('a');
      const urls = probe(
        () => useStampAssetPreviewUrl(() => assetId.value),
        (url: CurrentValue<string | null>) => url.current,
      );
      const control: { hide?: () => void } = {};
      await viewerWith([stamps.plugin], Toggled, { probes: [urls], control });
      expect(latest(urls.seen)).toBe('blob:0');

      assetId.value = 'b';
      flushSync();
      expect(revoked).toEqual(['blob:0']);
      expect(latest(urls.seen)).toBe('blob:1');

      // A stamp whose preview isn't there yet shows nothing, then its preview when it comes.
      assetId.value = 'later';
      flushSync();
      expect(revoked).toEqual(['blob:0', 'blob:1']);
      expect(latest(urls.seen)).toBeNull();
      stamps.addPreview('later');
      flushSync();
      expect(latest(urls.seen)).toBe('blob:2');

      control.hide!();
      flushSync();
      expect(revoked).toEqual(['blob:0', 'blob:1', 'blob:2']);
    } finally {
      create.mockRestore();
      revoke.mockRestore();
    }
  });
});

/** Measurement and redaction plugins for one document: scales and marks per page, and readouts. */
function fakeMarks() {
  const scale = (ratio: string) =>
    ({
      measure: { subtype: 'rectilinear', ratio },
      source: 'page',
      ready: true,
      persistent: true,
    }) as unknown as PageScale;
  const scales = [scale('1:100'), scale('1:50')];
  const marks = [[{ pageIndex: 0 }], [{ pageIndex: 1 }]] as unknown as RedactionMark[][];
  const all = marks.flat();
  let label = '3.42 m';
  const readouts = new Map<string, MeasurementReadout>();
  let wake = () => {};
  const measurement = definePlugin({
    id: 'measurement',
    scope: 'document',
    token: MeasurementToken,
    create: (ctx) => {
      wake = () => ctx.notify();
      return {
        api: {
          getPageScale: (page: number) => scales[page],
          // The same object until the measurement or its label changes, as the plugin's.
          getReadout: (annotation: AnnotationRef) => {
            const value = (annotation as { objectNumber: number }).objectNumber;
            const key = `${value}|${label}`;
            let readout = readouts.get(key);
            if (!readout) {
              readout = { kind: 'distance', value, label } as MeasurementReadout;
              readouts.set(key, readout);
            }
            return readout;
          },
        } as unknown as MeasurementCapability,
      };
    },
  });
  const redaction = definePlugin({
    id: 'redaction',
    scope: 'document',
    token: RedactionToken,
    create: () => ({
      api: {
        listPending: (filter?: RedactionMarkFilter) =>
          filter?.page === undefined ? all : marks[filter.page as number],
      } as unknown as RedactionCapability,
    }),
  });
  return {
    plugins: [measurement, redaction],
    relabel(next: string) {
      label = next;
      wake();
    },
    wake: () => wake(),
  };
}

async function openDocument(kernel: Kernel) {
  await kernel.documents.open(bytesInput('doc'));
  flushSync();
}

describe('the measurement and redaction readers', () => {
  it('usePageScale and usePendingRedactions follow a page function', async () => {
    const fake = fakeMarks();
    const page = signal<number | null>(0);
    const reads = probe(
      () => ({
        scale: usePageScale(() => page.value),
        marks: usePendingRedactions(() => (page.value === null ? undefined : { page: page.value })),
      }),
      ({ scale, marks }) => ({ scale: scale.current, marks: marks.current }),
    );
    const { kernel } = await viewerWith(fake.plugins as never, Probes, { probes: [reads] });
    await openDocument(kernel);
    const now = () => latest(reads.seen) as { scale: PageScale | null; marks: RedactionMark[] };
    expect(now().scale?.measure).toMatchObject({ ratio: '1:100' });
    expect(now().marks).toEqual([{ pageIndex: 0 }]);

    page.value = 1;
    flushSync();
    expect(now().scale?.measure).toMatchObject({ ratio: '1:50' });
    expect(now().marks).toEqual([{ pageIndex: 1 }]);

    page.value = null;
    flushSync();
    expect(now().scale).toBeNull();
    expect(now().marks).toEqual([{ pageIndex: 0 }, { pageIndex: 1 }]);
  });

  it('useMeasurementReadout keeps its value while the readout stays the same', async () => {
    const fake = fakeMarks();
    const annotation = signal<AnnotationRef>({
      kind: 'objectNumber',
      page: toPageRef(1),
      objectNumber: 9,
    } as AnnotationRef);
    const readouts = probe(
      () => useMeasurementReadout(() => annotation.value),
      (readout: CurrentValue<unknown>) => readout.current,
    );
    const { kernel } = await viewerWith(fake.plugins as never, Probes, { probes: [readouts] });
    await openDocument(kernel);
    const first = latest(readouts.seen);
    expect(first).toEqual({ kind: 'distance', value: 9, label: '3.42 m' });

    const runs = readouts.seen.length;
    fake.wake();
    flushSync();
    expect(readouts.seen).toHaveLength(runs);
    expect(latest(readouts.seen)).toBe(first);

    fake.relabel('342 cm');
    flushSync();
    expect(latest(readouts.seen)).toMatchObject({ label: '342 cm' });

    annotation.value = { ...annotation.value, objectNumber: 12 } as AnnotationRef;
    flushSync();
    expect(latest(readouts.seen)).toMatchObject({ value: 12 });
  });
});
