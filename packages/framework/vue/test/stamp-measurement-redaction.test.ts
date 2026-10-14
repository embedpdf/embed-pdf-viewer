import { h, ref } from 'vue';
import type { Ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { definePlugin, toPageRef } from '@embedpdf/core';
import type { Kernel } from '@embedpdf/core';
import { interactionPlugin } from '../src/interaction';
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
} from '../src/measurement';
import type {
  AnnotationRef,
  MeasurementCapability,
  MeasurementReadout,
  PageScale,
} from '../src/measurement';
import {
  REDACTION_DEFAULTS,
  RedactionToken,
  redactionPlugin,
  redactionState,
  usePendingRedactions,
  useRedaction,
  useRedactionSettings,
  useRedactionState,
} from '../src/redaction';
import type { RedactionCapability, RedactionMark, RedactionMarkFilter } from '../src/redaction';
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
} from '../src/stamp';
import type {
  StampAssetPreview,
  StampCapability,
  StampLibrary,
  StampLibraryFilter,
} from '../src/stamp';
import { bytesInput, probe, settle, viewerWith } from './counter-plugin';

/**
 * The stamp, measurement and redaction composables. Before any document
 * opens (against the real plugins): the state reads its declared `empty`, the
 * settings the plugin's settings, the per-page and per-mark reads answer
 * empty, and the stamp API, which belongs to the workspace, works. Then the
 * binding itself (against small stand-ins for the plugins): a ref follows a
 * getter and updates only when its value changes, and a preview's object URL
 * is revoked when it's no longer shown.
 */

enableAutoUnmount(afterEach);

const plugins = () => [
  interactionPlugin(),
  annotationPlugin(),
  stampPlugin(),
  measurementPlugin({ presets: [] }),
  redactionPlugin({ overlay: { fill: '#112233' } }),
];

/** Mount a component whose setup runs `setup`, inside a viewer with `installed`. */
async function mountWith<T>(installed: ReturnType<typeof plugins>, setup: () => T) {
  let value: T | null = null;
  const Probe = probe(() => {
    value = setup();
  });
  const mounted = await viewerWith(installed, () => h(Probe));
  return { ...mounted, value: value as unknown as T };
}

describe('without a document', () => {
  it('the state composables read empty', async () => {
    const { value } = await mountWith(plugins(), () => ({
      stamp: useStampState((state) => state),
      measurement: useMeasurementState((state) => state),
      redaction: useRedactionState((state) => state),
      fields: { ...useStampState(), ...useRedactionState() },
    }));
    expect(value.stamp.value).toEqual(stampState.empty);
    expect(value.measurement.value).toEqual(measurementState.empty);
    expect(value.redaction.value).toEqual(redactionState.empty);
    expect(value.fields.armedAsset.value).toBeNull();
    expect(value.fields.pendingCount.value).toBe(0);
  });

  it('a page scale, a readout and the pending marks answer empty', async () => {
    const ref = { kind: 'objectNumber' as const, page: toPageRef(1), objectNumber: 9 };
    const { value } = await mountWith(plugins(), () => [
      usePageScale(0),
      usePageScale(null),
      useMeasurementReadout(ref),
      usePendingRedactions(),
    ]);
    expect(value.map((each) => each.value)).toEqual([
      { measure: null, source: 'default', ready: false, persistent: false },
      null,
      { unavailable: 'not-dimension' },
      [],
    ]);
  });

  it('the settings composables read the settings, and follow a change', async () => {
    const { kernel, value } = await mountWith(plugins(), () => ({
      previewWidth: useStampSettings((settings) => settings.previewWidth),
      measurement: useMeasurementSettings((settings) => settings),
      fill: useRedactionSettings((settings) => settings.overlay.fill),
      defaultScale: useMeasurementSettings().defaultScale,
    }));
    expect(value.previewWidth.value).toBe(STAMP_DEFAULTS.previewWidth);
    expect(value.measurement.value).toEqual({ ...MEASUREMENT_DEFAULTS, presets: [] });
    expect(value.fill.value).toBe('#112233');
    expect(REDACTION_DEFAULTS.overlay.fill).toBe('#000000');

    kernel.settingsOf(StampToken).updateSettings({ previewWidth: 64 });
    kernel.settingsOf(MeasurementToken).updateSettings({ defaultScale: 'imperial' });
    await settle();
    expect(value.previewWidth.value).toBe(64);
    expect(value.measurement.value).toEqual({ defaultScale: 'imperial', presets: [] });
    expect(value.defaultScale.value).toBe('imperial');
    expect(value.fill.value).toBe('#112233');
  });

  it('the stamp API is there; a document verb says no document is open', async () => {
    const { value } = await mountWith(plugins(), () => ({
      stamp: useStamp(),
      measurement: useMeasurement(),
      redaction: useRedaction(),
    }));
    const { stamp, measurement, redaction } = value;
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

describe('the stamp composables', () => {
  it('useStampLibraries follows a filter getter, and updates only when the list changes', async () => {
    const stamps = fakeStamps();
    stamps.addLibrary('standard', 'stamps');
    const kind = ref<string>('stamps');
    let libraries: Readonly<Ref<readonly StampLibrary[]>> | null = null;
    let renders = 0;
    const Probe = probe(() => {
      libraries = useStampLibraries(() => ({ kind: kind.value }));
      return () => {
        renders++;
        return h(
          'ul',
          libraries!.value.map((each) => h('li', each.id)),
        );
      };
    });
    const { wrapper } = await viewerWith([stamps.plugin], () => h(Probe));
    expect(wrapper.findAll('li').map((each) => each.text())).toEqual(['standard']);

    // A change elsewhere reads an equal list: nothing renders again.
    const before = renders;
    const list = libraries!.value;
    stamps.wake();
    await settle();
    expect(libraries!.value).toBe(list);
    expect(renders).toBe(before);

    stamps.addLibrary('seals', 'legal-seals');
    await settle();
    expect(wrapper.findAll('li').map((each) => each.text())).toEqual(['standard']);

    kind.value = 'legal-seals';
    await settle();
    expect(wrapper.findAll('li').map((each) => each.text())).toEqual(['seals']);
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
      const assetId = ref<string | null>('a');
      const Probe = probe(() => {
        const url = useStampAssetPreviewUrl(() => assetId.value);
        return () => (url.value ? h('img', { src: url.value }) : null);
      });
      const { wrapper } = await viewerWith([stamps.plugin], () => h(Probe));
      expect(wrapper.find('img').attributes('src')).toBe('blob:0');

      assetId.value = 'b';
      await settle();
      expect(revoked).toEqual(['blob:0']);
      expect(wrapper.find('img').attributes('src')).toBe('blob:1');

      // An asset whose preview isn't there yet shows nothing, then its preview when it comes.
      assetId.value = 'later';
      await settle();
      expect(revoked).toEqual(['blob:0', 'blob:1']);
      expect(wrapper.find('img').exists()).toBe(false);
      stamps.addPreview('later');
      await settle();
      expect(wrapper.find('img').attributes('src')).toBe('blob:2');

      wrapper.unmount();
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
  await settle();
}

describe('the measurement and redaction composables', () => {
  it('usePageScale and usePendingRedactions follow a page getter', async () => {
    const fake = fakeMarks();
    const page = ref<number | null>(0);
    const { kernel, value } = await mountWith(fake.plugins as never, () => ({
      scale: usePageScale(() => page.value),
      marks: usePendingRedactions(() => (page.value === null ? undefined : { page: page.value })),
    }));
    await openDocument(kernel);
    expect(value.scale.value?.measure).toMatchObject({ ratio: '1:100' });
    expect(value.marks.value).toEqual([{ pageIndex: 0 }]);

    page.value = 1;
    await settle();
    expect(value.scale.value?.measure).toMatchObject({ ratio: '1:50' });
    expect(value.marks.value).toEqual([{ pageIndex: 1 }]);

    page.value = null;
    await settle();
    expect(value.scale.value).toBeNull();
    expect(value.marks.value).toEqual([{ pageIndex: 0 }, { pageIndex: 1 }]);
  });

  it('useMeasurementReadout keeps its value while the readout stays the same', async () => {
    const fake = fakeMarks();
    const annotation = ref<AnnotationRef>({
      kind: 'objectNumber',
      page: toPageRef(1),
      objectNumber: 9,
    } as AnnotationRef);
    const { kernel, value } = await mountWith(fake.plugins as never, () =>
      useMeasurementReadout(() => annotation.value),
    );
    await openDocument(kernel);
    const first = value.value;
    expect(first).toEqual({ kind: 'distance', value: 9, label: '3.42 m' });

    fake.wake();
    await settle();
    expect(value.value).toBe(first);

    fake.relabel('342 cm');
    await settle();
    expect(value.value).toMatchObject({ label: '342 cm' });

    annotation.value = { ...annotation.value, objectNumber: 12 } as AnnotationRef;
    await settle();
    expect(value.value).toMatchObject({ value: 12 });
  });
});
