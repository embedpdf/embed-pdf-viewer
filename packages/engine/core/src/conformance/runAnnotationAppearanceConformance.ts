import type {
  ConformanceTestRunner,
  ConformanceFixture,
  ConformanceOptions,
} from './runMetadataConformance';
import type { AnnotationAppearanceMode } from '../dto/AnnotationRender';
import { appearanceRasters } from './appearanceRasters';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { isLocalPage } from '../engine/LocalPageHandle';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { toPageRef } from '../identity/PageRef';
import { AbortError } from '../promise/AbortError';
import type { PageState } from '../revision/PageState';

/**
 * Per-fixture knowledge for the annotation appearance conformance suite. The
 * harness asserts thresholds (not exact wire content) so the same suite runs
 * unchanged against the local and cloud engines and proves they emit the same
 * set of appearances — including weak (index-only) annotations.
 */
export interface AnnotationAppearanceConformanceFixture extends ConformanceFixture {
  /** PDF object number of the page whose appearances are rendered. */
  pageObjectNumber: number;
  /** At least this many `/AP` appearances are expected on that page. */
  minAppearanceCount: number;
  /**
   * `true` when the page has at least one weak (index-only) annotation that
   * carries an appearance stream. The point of this suite: that weak
   * appearance must still be emitted on the wire.
   */
  expectsWeakAppearance: boolean;
}

export interface AnnotationAppearanceConformanceOptions extends Omit<
  ConformanceOptions,
  'fixture'
> {
  fixture: AnnotationAppearanceConformanceFixture;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface NormalizedAppearance {
  ref: AnnotationRef;
  mode: AnnotationAppearanceMode;
  width: number;
  height: number;
  /** Raw RGBA bytes (raw-raster engines) or `null`. */
  raster: { data: ArrayBuffer; width: number; height: number; stride: number } | null;
  /** Encoded image bytes (image engines) or `null`. */
  encoded: Uint8Array | null;
}

export function runAnnotationAppearanceConformance(
  runner: ConformanceTestRunner,
  opts: AnnotationAppearanceConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`annotation appearance conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('renders the expected set of appearances with valid output', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const { pageState, appearances } = await collect(doc, opts);

        expect(pageState.page.pageObjectNumber).toBe(opts.fixture.pageObjectNumber);
        expect(appearances.length >= opts.fixture.minAppearanceCount).toBe(true);

        for (const appearance of appearances) {
          // Identity is the ref (durable or weak) — never a stableId.
          expect(['objectNumber', 'nm', 'index'].includes(appearance.ref.kind)).toBe(true);
          expect(['normal', 'rollover', 'down'].includes(appearance.mode)).toBe(true);
          expect(appearance.width > 0 && appearance.height > 0).toBe(true);

          if (appearance.encoded) {
            // Encoded engines must ship real PNG bytes, not an empty part.
            expect(appearance.encoded.length > PNG_SIGNATURE.length).toBe(true);
            expect(PNG_SIGNATURE.every((b, i) => appearance.encoded![i] === b)).toBe(true);
          }
        }
      } finally {
        await doc.close();
      }
    });

    if (opts.fixture.expectsWeakAppearance) {
      test('weak (index-only) annotations are emitted, not dropped', async () => {
        const doc = await openFixture(engine, opts);
        try {
          const { appearances } = await collect(doc, opts);
          const weak = appearances.find((a) => a.ref.kind === 'index');
          expect(weak !== undefined).toBe(true);
        } finally {
          await doc.close();
        }
      });
    }

    test('rendered appearances are not blank (non-zero alpha)', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(opts.fixture.pageObjectNumber));
        // Guards the blank-render regression: at least one appearance must
        // have a visible (non-transparent) pixel, as the engine gives it
        // (raw locally, a decoded image on the cloud).
        const rasters = await appearanceRasters(page);
        const anyVisible = [...rasters.values()].some(({ rgba }) =>
          rgba.some((byte, index) => index % 4 === 3 && byte !== 0),
        );
        expect(anyVisible).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('abort() rejects with AbortError', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(opts.fixture.pageObjectNumber));
        const p = isLocalPage(page)
          ? page.annotations.renderAppearancesRaw({ viewport: { kind: 'scale', scale: 1 } })
          : page.annotations.renderAppearances({
              format: 'png',
              viewport: { kind: 'scale', scale: 1 },
            });
        p.abort('test');
        await expect(p).rejects.toBeInstanceOf(AbortError);
      } finally {
        await doc.close();
      }
    });
  });
}

/**
 * The page's appearances as the engine gives them: raw rasters locally (its
 * encoder needs a browser canvas, which Node lacks), encoded images on the
 * cloud.
 */
async function collect(
  doc: DocumentHandle,
  opts: AnnotationAppearanceConformanceOptions,
): Promise<{ pageState: PageState; appearances: NormalizedAppearance[] }> {
  const page = doc.page(toPageRef(opts.fixture.pageObjectNumber));
  if (isLocalPage(page)) {
    const result = await page.annotations.renderAppearancesRaw({
      viewport: { kind: 'scale', scale: 1 },
    });
    return {
      pageState: result.pageState,
      appearances: result.appearances.map((a) => ({
        ref: a.ref,
        mode: a.mode,
        width: a.raster.width,
        height: a.raster.height,
        raster: a.raster,
        encoded: null,
      })),
    };
  }
  const result = await page.annotations.renderAppearances({
    format: 'png',
    viewport: { kind: 'scale', scale: 1 },
  });
  return {
    pageState: result.pageState,
    appearances: result.appearances.map((a) => ({
      ref: a.ref,
      mode: a.mode,
      width: a.image.width ?? 0,
      height: a.image.height ?? 0,
      raster: null,
      encoded: a.image.source.kind === 'bytes' ? a.image.source.bytes : new Uint8Array(),
    })),
  };
}

async function openFixture(engine: Engine, opts: AnnotationAppearanceConformanceOptions) {
  if (opts.openKind === 'bytes') {
    const bytes = await opts.fixture.bytes();
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes });
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}
