import type {
  ConformanceTestRunner,
  ConformanceFixture,
  ConformanceOptions,
} from './runMetadataConformance';
import type { AnnotationAppearanceMode } from '../dto/AnnotationRender';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { AnnotationRef } from '../identity/AnnotationRef';
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
   * carries an appearance stream. The whole point of this suite: that weak
   * appearance must still be emitted (it used to be dropped on the wire).
   */
  expectsWeakAppearance: boolean;
}

export interface AnnotationAppearanceConformanceOptions extends Omit<
  ConformanceOptions,
  'fixture'
> {
  fixture: AnnotationAppearanceConformanceFixture;
  /**
   * `true` for engines that expose the raw RGBA rasters (`renderAppearances`).
   * The local engine's encoder needs a browser Canvas, so under node it can
   * only be exercised via the raw rasters; the cloud engine ships encoded
   * images (`renderAppearanceImages`) and leaves this `false`.
   */
  supportsRawRasters?: boolean;
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
  const useRaw = opts.supportsRawRasters === true;

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
        const { pageState, appearances } = await collect(doc, opts, useRaw);

        expect(pageState.pageObjectNumber).toBe(opts.fixture.pageObjectNumber);
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
          const { appearances } = await collect(doc, opts, useRaw);
          const weak = appearances.find((a) => a.ref.kind === 'index');
          expect(weak !== undefined).toBe(true);
        } finally {
          await doc.close();
        }
      });
    }

    if (useRaw) {
      test('rendered appearances are not blank (non-zero alpha)', async () => {
        const doc = await openFixture(engine, opts);
        try {
          const { appearances } = await collect(doc, opts, useRaw);
          // Guards the blank-render regression: at least one appearance must
          // have a visible (non-transparent) pixel. Scanning the RGBA alpha
          // byte is decoder-free and unambiguous.
          const anyVisible = appearances.some((a) => a.raster !== null && hasOpaquePixel(a.raster));
          expect(anyVisible).toBe(true);
        } finally {
          await doc.close();
        }
      });
    }

    test('abort() rejects with AbortError', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(opts.fixture.pageObjectNumber);
        const p = useRaw
          ? page.annotations.renderAppearances({ scale: 1 })
          : page.annotations.renderAppearanceImages({ format: 'png', scale: 1 });
        p.abort('test');
        await expect(p).rejects.toBeInstanceOf(AbortError);
      } finally {
        await doc.close();
      }
    });
  });
}

async function collect(
  doc: DocumentHandle,
  opts: AnnotationAppearanceConformanceOptions,
  useRaw: boolean,
): Promise<{ pageState: PageState; appearances: NormalizedAppearance[] }> {
  const page = doc.page(opts.fixture.pageObjectNumber);
  if (useRaw) {
    const result = await page.annotations.renderAppearances({ scale: 1 });
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
  const result = await page.annotations.renderAppearanceImages({ format: 'png', scale: 1 });
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

function hasOpaquePixel(raster: {
  data: ArrayBuffer;
  width: number;
  height: number;
  stride: number;
}): boolean {
  const bytes = new Uint8Array(raster.data);
  for (let y = 0; y < raster.height; y++) {
    const row = y * raster.stride;
    for (let x = 0; x < raster.width; x++) {
      if (bytes[row + x * 4 + 3] !== 0) return true;
    }
  }
  return false;
}

async function openFixture(engine: Engine, opts: AnnotationAppearanceConformanceOptions) {
  if (opts.openKind === 'bytes') {
    const bytes = await opts.fixture.bytes();
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes });
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}
