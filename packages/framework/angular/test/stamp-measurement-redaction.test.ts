/**
 * The stamp, measurement and redaction services. Against the real plugins, before any document
 * opens: the State signals read their declared `empty`, the settings read and follow the
 * plugin's settings, the per-page and per-mark signals answer empty, the stamps (which belong to
 * the workspace) are there, and a document verb says no document is open. Against a small stamp
 * plugin of the test's own: the libraries and stamps as signals, a stamp's picture URL that
 * follows the stamp and a picture that arrives later, and keeping libraries in a store through
 * the service.
 */
import { Component, computed, inject, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventHook, definePlugin, toPageRef } from '@embedpdf/core';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { EpdfKernelHost, provideEmbedPdf, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfMeasurement,
  MEASUREMENT_DEFAULTS,
  MeasurementToken,
  measurementState,
  withMeasurement,
} from '@embedpdf/angular/measurement';
import {
  EpdfRedaction,
  REDACTION_DEFAULTS,
  redactionState,
  withRedaction,
} from '@embedpdf/angular/redaction';
import {
  EpdfStamp,
  memoryStampStore,
  persistStampLibraries,
  restoreStampLibraries,
  STAMP_DEFAULTS,
  StampToken,
  stampState,
  withStamp,
  type StampAsset,
  type StampAssetPreview,
  type StampCapability,
  type StampLibrary,
  type StampLibraryChangedEvent,
} from '@embedpdf/angular/stamp';
import { fakeEngine, kernelOf, mount, viewerHost } from './fixtures';

afterEach(() => TestBed.resetTestingModule());

// ── the real plugins, without a document ──

const features = (): EmbedPdfFeature[] => [
  withInteraction(),
  { plugins: [annotationPlugin()] },
  withStamp(),
  withMeasurement({ presets: [] }),
  withRedaction({ overlay: { fill: '#112233' } }),
];

async function mountMarks() {
  const fixture = await mount(viewerHost({ template: '', features: features() }));
  const injector = fixture.debugElement.injector;
  return {
    fixture,
    stamp: injector.get(EpdfStamp),
    measurement: injector.get(EpdfMeasurement),
    redaction: injector.get(EpdfRedaction),
  };
}

describe('without a document', () => {
  it('the State signals read empty', async () => {
    const { stamp, measurement, redaction } = await mountMarks();
    expect({ armedAsset: stamp.armedAsset() }).toEqual(stampState.empty);
    expect({
      busy: measurement.busy(),
      calibrationRequest: measurement.calibrationRequest(),
      lastReports: measurement.lastReports(),
    }).toEqual(measurementState.empty);
    expect({
      pendingCount: redaction.pendingCount(),
      applying: redaction.applying(),
      lastResult: redaction.lastResult(),
    }).toEqual(redactionState.empty);
  });

  it('a page scale, a readout and the pending marks answer empty', async () => {
    const { measurement, redaction } = await mountMarks();
    const ref = { kind: 'objectNumber' as const, page: toPageRef(1), objectNumber: 9 };
    expect(measurement.scaleOf(0)()).toEqual({
      measure: null,
      source: 'default',
      ready: false,
      persistent: false,
    });
    expect(measurement.scaleOf(null)()).toBeNull();
    expect(measurement.readoutOf(ref)()).toEqual({ unavailable: 'not-dimension' });
    expect(redaction.pending()).toEqual([]);
    expect(redaction.pendingOn(0)()).toEqual([]);
  });

  it('a page scale follows the page a function gives, null included', async () => {
    const { measurement } = await mountMarks();
    const page = signal<number | null>(null);
    const scale = measurement.scaleOf(page);
    expect(scale()).toBeNull();
    page.set(0);
    expect(scale()).toMatchObject({ ready: false });
  });

  it('the settings signals read the settings, and follow a change', async () => {
    const { fixture, stamp, measurement, redaction } = await mountMarks();
    const read = () => [
      stamp.settings().previewWidth,
      measurement.settings(),
      redaction.settings().overlay.fill,
    ];
    expect(read()).toEqual([
      STAMP_DEFAULTS.previewWidth,
      { ...MEASUREMENT_DEFAULTS, presets: [] },
      '#112233',
    ]);
    expect(REDACTION_DEFAULTS.overlay.fill).toBe('#000000');

    const kernel = kernelOf(fixture);
    kernel.settingsOf(StampToken).updateSettings({ previewWidth: 64 });
    kernel.settingsOf(MeasurementToken).updateSettings({ defaultScale: 'imperial' });
    expect(read()).toEqual([64, { defaultScale: 'imperial', presets: [] }, '#112233']);
  });

  it('the stamps are there; a document verb says no document is open', async () => {
    const { stamp, redaction } = await mountMarks();
    expect(stamp.getArmedAsset()).toBeNull();
    expect(stamp.canPlace()).toBe(false);
    expect(stamp.libraries()).toEqual([]);
    expect(stamp.assetsOf()()).toEqual([]);
    await expect(stamp.armAsset('any')).rejects.toMatchObject({ code: 'not-ready' });
    await expect(redaction.markPage(0)).rejects.toMatchObject({ code: 'not-ready' });
  });

  it('EPDF-102: a service whose feature the viewer doesn’t have', async () => {
    @Component({ selector: 'test-no-stamps', template: '' })
    class NoStamps {
      readonly stamp = inject(EpdfStamp);
    }
    await expect(
      mount(viewerHost({ template: '<test-no-stamps />', imports: [NoStamps] })),
    ).rejects.toThrow(/EPDF-102.*withStamp\(\)/);
  });
});

// ── a stamp plugin of the test's own ──

interface TestStamps {
  readonly libraries: readonly StampLibrary[];
  readonly assets: readonly StampAsset[];
  readonly previews: Readonly<Record<string, StampAssetPreview>>;
}

/** What the test changes the stamps with, besides the capability. */
interface TestStampCapability extends StampCapability {
  addLibrary(library: StampLibrary, assets: readonly StampAsset[]): void;
  setPreview(assetId: string, preview: StampAssetPreview): void;
}

const assetIn = (libraryId: string, name: string): StampAsset => ({
  id: `${libraryId}:${name}`,
  libraryId,
  kind: 'stamp',
  name,
  label: name,
  size: { width: 100, height: 40 },
  page: toPageRef(1),
});

const libraryOf = (id: string, assets: readonly StampAsset[]): StampLibrary => ({
  id,
  name: id,
  kind: 'stamps',
  assetIds: assets.map((asset) => asset.id),
});

const testStampPlugin = (exported: Uint8Array[], imported: Uint8Array[]) =>
  definePlugin({
    id: 'stamp',
    token: StampToken,
    scope: 'workspace',
    state: (): TestStamps => ({ libraries: [], assets: [], previews: {} }),
    create: (ctx) => {
      const changed = createEventHook<StampLibraryChangedEvent>();
      ctx.cleanup(() => changed.dispose());
      const api: Partial<TestStampCapability> = {
        listLibraries: () => ctx.state.get().libraries,
        listAssets: (filter) =>
          ctx.state
            .get()
            .assets.filter((asset) => !filter?.libraryId || asset.libraryId === filter.libraryId),
        getAssetPreview: (assetId) => ctx.state.get().previews[assetId] ?? null,
        getArmedAsset: () => null,
        exportLibrary: async (libraryId) => {
          const bytes = new TextEncoder().encode(libraryId);
          exported.push(bytes);
          return bytes;
        },
        importLibrary: async (source) => {
          const bytes = source as Uint8Array; // the test's stores keep plain bytes
          imported.push(bytes);
          return { library: libraryOf(new TextDecoder().decode(bytes), []) };
        },
        onLibraryChanged: changed.on,
        addLibrary: (library, assets) => {
          ctx.state.update((state) => ({
            ...state,
            libraries: [...state.libraries, library],
            assets: [...state.assets, ...assets],
          }));
          changed.emit({ libraryId: library.id, reason: 'created' });
        },
        setPreview: (assetId, preview) =>
          ctx.state.update((state) => ({
            ...state,
            previews: { ...state.previews, [assetId]: preview },
          })),
      };
      return { api: api as TestStampCapability };
    },
  });

/** A thumbnail: the stamp's picture with an image URL that lasts as long as the component. */
@Component({ selector: 'test-preview', template: '' })
class Preview {
  readonly assetId = input<string | null>(null);
  readonly url = inject(EpdfStamp).previewUrlOf(this.assetId);
}

/** A viewer with the test's stamps, a picker for one library, and a thumbnail. */
function stampsHost(exported: Uint8Array[] = [], imported: Uint8Array[] = []) {
  @Component({
    selector: 'test-stamps-host',
    imports: [Preview],
    providers: [
      provideEmbedPdf(
        { engine: fakeEngine().engine },
        { plugins: [testStampPlugin(exported, imported)], services: [EpdfStamp] },
      ),
    ],
    template: `@if (shown()) {
      <test-preview [assetId]="assetId()" />
    }`,
  })
  class StampsHost {
    readonly viewer = inject(EpdfKernelHost);
    readonly stamp = inject(EpdfStamp);
    readonly libraryId = signal('a');
    readonly assetId = signal<string | null>('a:one');
    readonly shown = signal(true);
    readonly assets = this.stamp.assetsOf(() => ({ libraryId: this.libraryId() }));
  }
  return StampsHost;
}

const picture = (byte: number): StampAssetPreview => ({
  bytes: new Uint8Array([byte]),
  mimeType: 'image/png',
});

describe('EpdfStamp', () => {
  let made: string[];
  let revoked: string[];

  beforeEach(() => {
    made = [];
    revoked = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      made.push(`blob:${made.length + 1}`);
      return made[made.length - 1];
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => void revoked.push(url));
  });
  afterEach(() => vi.restoreAllMocks());

  async function mountStamps(exported?: Uint8Array[], imported?: Uint8Array[]) {
    const fixture = await mount(stampsHost(exported, imported));
    const plugin = kernelOf(fixture).capability(StampToken) as TestStampCapability;
    const preview = () =>
      fixture.debugElement.query((element) => element.componentInstance instanceof Preview)
        ?.componentInstance as Preview | undefined;
    return { fixture, host: fixture.componentInstance, plugin, preview };
  }

  it('libraries() and assetsOf(filter) follow the stamps, and the filter’s signals', async () => {
    const { fixture, host, plugin } = await mountStamps();
    let reads = 0;
    const count = computed(() => (reads++, host.stamp.libraries().length));
    expect(count()).toBe(0);

    const one = [assetIn('a', 'one'), assetIn('a', 'two')];
    const other = [assetIn('b', 'three')];
    plugin.addLibrary(libraryOf('a', one), one);
    plugin.addLibrary(libraryOf('b', other), other);
    await fixture.whenStable();
    expect(host.stamp.libraries().map((library) => library.id)).toEqual(['a', 'b']);
    expect(host.assets()).toEqual(one);

    host.libraryId.set('b');
    expect(host.assets()).toEqual(other);

    // A change that leaves the libraries as they were wakes nobody.
    expect(count()).toBe(2);
    const before = reads;
    plugin.setPreview('a:one', picture(1));
    count();
    expect(reads).toBe(before);
  });

  it('previewUrlOf(id) shows a picture that arrives later, follows the stamp, and releases', async () => {
    const { fixture, host, plugin, preview } = await mountStamps();
    expect(preview()!.url()).toBeNull();

    plugin.setPreview('a:one', picture(1));
    await fixture.whenStable();
    expect(preview()!.url()).toBe('blob:1');

    plugin.setPreview('a:two', picture(2));
    host.assetId.set('a:two');
    await fixture.whenStable();
    expect(preview()!.url()).toBe('blob:2');
    expect(revoked).toEqual(['blob:1']);

    host.assetId.set(null);
    await fixture.whenStable();
    expect(preview()!.url()).toBeNull();
    expect(revoked).toEqual(['blob:1', 'blob:2']);

    host.assetId.set('a:one');
    await fixture.whenStable();
    expect(preview()!.url()).toBe('blob:3');
    host.shown.set(false); // the thumbnail goes
    await fixture.whenStable();
    expect(revoked).toEqual(['blob:1', 'blob:2', 'blob:3']);
  });

  it('persistStampLibraries(stamp, store) and restoreStampLibraries(stamp, store) take the service', async () => {
    const exported: Uint8Array[] = [];
    const imported: Uint8Array[] = [];
    const { host, plugin } = await mountStamps(exported, imported);
    const store = memoryStampStore();
    await store.put('kept', new TextEncoder().encode('kept'));

    expect(await restoreStampLibraries(host.stamp, store)).toEqual(['kept']);
    expect(imported.map((bytes) => new TextDecoder().decode(bytes))).toEqual(['kept']);

    const stop = persistStampLibraries(host.stamp, store, { except: ['skip'], debounceMs: 0 });
    plugin.addLibrary(libraryOf('mine', []), []);
    plugin.addLibrary(libraryOf('skip', []), []);
    await vi.waitFor(async () =>
      expect((await store.list()).map((row) => row.id).sort()).toEqual(['kept', 'mine']),
    );
    stop();
    plugin.addLibrary(libraryOf('later', []), []);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(exported.map((bytes) => new TextDecoder().decode(bytes))).toEqual(['mine']);
  });
});
