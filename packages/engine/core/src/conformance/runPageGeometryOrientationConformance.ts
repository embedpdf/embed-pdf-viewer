import type {
  ConformanceTestRunner,
  ConformanceFixture,
  ConformanceOptions,
} from './runMetadataConformance';
import {
  isRotatedGeometryRun,
  type PageGeometrySnapshot,
  type RotatedGeometryRun,
} from '../dto/PageGeometrySnapshot';
import type { Engine } from '../engine/Engine';
import { toPageRef } from '../identity/PageRef';
import { pageQuadBounds } from '../pageSpace/helpers';
import { PageGeometrySnapshotSchema } from '../wire/schemas';

/** Absolute tolerance for coordinate assertions (points). */
const COORD_TOLERANCE = 1e-3;
/** Tolerance for baseline-angle assertions (radians). */
/** Degrees. */
const ROTATION_TOLERANCE = 0.06;

/**
 * Per-fixture expectations for the oriented-text geometry harness. One
 * fixture per call, mirroring the other conformance suites; the fixture
 * declares what its dominant text orientation must read back as.
 */
export interface PageGeometryOrientationFixture extends ConformanceFixture {
  /** PDF indirect object number of the page under test. */
  pageObjectNumber: number;
  expectation:
    | {
        /** Every run is the upright variant; no glyph carries oriented cells. */
        kind: 'upright';
      }
    | {
        /** The page loads and every glyph is degenerate (zeroed + empty flag). */
        kind: 'empty-only';
      }
    | {
        kind: 'rotated';
        /** Turns (degrees clockwise) rotated runs may carry. */
        rotations: number[];
        ascentFlip: boolean;
        /**
         * Assert sheared cells: with `rotations` ≈ [0], a non-zero start-edge
         * x-offset proves the parallelogram (an AABB could not express it).
         */
        sheared?: boolean;
        /** Minimum number of rotated runs the page must produce (default 1). */
        minRotatedRuns?: number;
      };
}

export interface PageGeometryOrientationOptions extends Omit<ConformanceOptions, 'fixture'> {
  fixture: PageGeometryOrientationFixture;
}

export function runPageGeometryOrientationConformance(
  runner: ConformanceTestRunner,
  opts: PageGeometryOrientationOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`page geometry orientation conformance: ${opts.label} [${opts.fixture.id}]`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const readSnapshot = async (): Promise<{
      snapshot: PageGeometrySnapshot;
      close: () => Promise<void>;
    }> => {
      const doc = await openFixture(engine, opts);
      const layout = await doc.page(toPageRef(opts.fixture.pageObjectNumber)).text.layout();
      return { snapshot: { runs: [...layout.runs] }, close: () => doc.close() };
    };

    test('snapshot round-trips the wire schema', async () => {
      const { snapshot, close } = await readSnapshot();
      try {
        const parsed = PageGeometrySnapshotSchema.safeParse(snapshot);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
          // Strip-mode parsing must not lose anything the reader emitted —
          // a rotated run silently coerced to upright would fail this.
          expect(parsed.data).toEqual(snapshot);
        }
      } finally {
        await close();
      }
    });

    test('run starts tile the page character sequence', async () => {
      const { snapshot, close } = await readSnapshot();
      try {
        let next = 0;
        for (const run of snapshot.runs) {
          expect(run.start).toBe(next);
          next += run.glyphs.length;
        }
      } finally {
        await close();
      }
    });

    test('runs match the fixture orientation expectation', async () => {
      const { snapshot, close } = await readSnapshot();
      try {
        const expectation = opts.fixture.expectation;
        if (expectation.kind === 'upright') {
          for (const run of snapshot.runs) {
            expect(isRotatedGeometryRun(run)).toBe(false);
            if (isRotatedGeometryRun(run)) continue;
            for (const glyph of run.glyphs) {
              expect('width' in glyph.loose).toBe(true); // a box, not a quad
              if (glyph.empty) {
                // Degenerate glyphs keep the zeroed-box convention.
                expect(glyph.loose).toEqual({ x: 0, y: 0, width: 0, height: 0 });
              }
            }
          }
          return;
        }

        if (expectation.kind === 'empty-only') {
          for (const run of snapshot.runs) {
            expect(isRotatedGeometryRun(run)).toBe(false);
            if (isRotatedGeometryRun(run)) continue;
            for (const glyph of run.glyphs) {
              expect(glyph.empty).toBe(true);
              expect(glyph.loose).toEqual({ x: 0, y: 0, width: 0, height: 0 });
            }
          }
          return;
        }

        const rotatedRuns = snapshot.runs.filter(isRotatedGeometryRun);
        expect(rotatedRuns.length >= (expectation.minRotatedRuns ?? 1)).toBe(true);

        for (const run of rotatedRuns) {
          expect(
            expectation.rotations.some((rotation) =>
              rotationClose(run.rotation, rotation, ROTATION_TOLERANCE),
            ),
          ).toBe(true);
          expect(run.ascentFlip).toBe(expectation.ascentFlip);
          assertRotatedRunGeometry(run);
        }

        if (expectation.sheared) {
          const shearedGlyphs = rotatedRuns
            .flatMap((run) => run.glyphs)
            .filter(
              (glyph) =>
                !glyph.empty && Math.abs(glyph.loose.lowerLeft.x - glyph.loose.upperLeft.x) > 1,
            );
          expect(shearedGlyphs.length > 0).toBe(true);
        }
      } finally {
        await close();
      }
    });

    function assertRotatedRunGeometry(run: RotatedGeometryRun): void {
      for (const glyph of run.glyphs) {
        if (glyph.empty) {
          expect(glyph.loose).toEqual({
            upperLeft: { x: 0, y: 0 },
            upperRight: { x: 0, y: 0 },
            lowerLeft: { x: 0, y: 0 },
            lowerRight: { x: 0, y: 0 },
          });
          continue;
        }
        const q = glyph.loose;
        // The cell is a parallelogram: the upper edge runs like the lower one.
        expect(
          Math.abs(q.upperRight.x - q.upperLeft.x - (q.lowerRight.x - q.lowerLeft.x)) <=
            COORD_TOLERANCE,
        ).toBe(true);
        expect(
          Math.abs(q.upperRight.y - q.upperLeft.y - (q.lowerRight.y - q.lowerLeft.y)) <=
            COORD_TOLERANCE,
        ).toBe(true);
        // Contained in the run's page-space AABB.
        const bounds = pageQuadBounds(q);
        const { rect } = run;
        expect(bounds.x >= rect.x - COORD_TOLERANCE).toBe(true);
        expect(bounds.x + bounds.width <= rect.x + rect.width + COORD_TOLERANCE).toBe(true);
        expect(bounds.y >= rect.y - COORD_TOLERANCE).toBe(true);
        expect(bounds.y + bounds.height <= rect.y + rect.height + COORD_TOLERANCE).toBe(true);
      }
    }
  });
}

function rotationClose(a: number, b: number, tolerance: number): boolean {
  const delta = ((((a - b) % 360) + 540) % 360) - 180;
  return Math.abs(delta) <= tolerance;
}

async function openFixture(engine: Engine, opts: PageGeometryOrientationOptions) {
  if (opts.openKind === 'bytes') {
    const bytes = await opts.fixture.bytes();
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes });
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}
