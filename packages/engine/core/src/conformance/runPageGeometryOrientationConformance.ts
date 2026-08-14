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
import { pdfQuadBounds } from '../geometry/convert';
import type { Engine } from '../engine/Engine';
import { PageGeometrySnapshotSchema } from '../wire/schemas';

const FLAG_EMPTY = 2;
/** Absolute tolerance for coordinate assertions (PDF points). */
const COORD_TOLERANCE = 1e-3;
/** Tolerance for baseline-angle assertions (radians). */
const ANGLE_TOLERANCE = 1e-3;

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
        /** Baseline angles (radians, CCW, PDF y-up) rotated runs may carry. */
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
      const snapshot = await doc.page(opts.fixture.pageObjectNumber).geometry.read();
      return { snapshot, close: () => doc.close() };
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

    test('run charStart indices tile the page glyph sequence', async () => {
      const { snapshot, close } = await readSnapshot();
      try {
        let next = 0;
        for (const run of snapshot.runs) {
          expect(run.charStart).toBe(next);
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
              expect('looseQuad' in glyph).toBe(false);
              if (glyph.flags & FLAG_EMPTY) {
                // Degenerate glyphs keep the legacy zeroed-box convention.
                expect(glyph.looseBox).toEqual({ left: 0, bottom: 0, right: 0, top: 0 });
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
              expect(glyph.flags & FLAG_EMPTY).toBe(FLAG_EMPTY);
              expect(glyph.looseBox).toEqual({ left: 0, bottom: 0, right: 0, top: 0 });
            }
          }
          return;
        }

        const rotatedRuns = snapshot.runs.filter(isRotatedGeometryRun);
        expect(rotatedRuns.length >= (expectation.minRotatedRuns ?? 1)).toBe(true);

        for (const run of rotatedRuns) {
          expect(
            expectation.rotations.some((angle) =>
              angleClose(run.rotation, angle, ANGLE_TOLERANCE),
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
                (glyph.flags & FLAG_EMPTY) === 0 &&
                Math.abs(glyph.looseQuad.p3.x - glyph.looseQuad.p1.x) > 1,
            );
          expect(shearedGlyphs.length > 0).toBe(true);
        }
      } finally {
        await close();
      }
    });

    function assertRotatedRunGeometry(run: RotatedGeometryRun): void {
      for (const glyph of run.glyphs) {
        if (glyph.flags & FLAG_EMPTY) {
          expect(glyph.looseQuad).toEqual({
            p1: { x: 0, y: 0 },
            p2: { x: 0, y: 0 },
            p3: { x: 0, y: 0 },
            p4: { x: 0, y: 0 },
          });
          continue;
        }
        const q = glyph.looseQuad;
        // The cell is a parallelogram: both baseline-direction edges match,
        // and both side edges match (slots: p1 US, p2 UE, p3 LS, p4 LE).
        expect(Math.abs(q.p2.x - q.p1.x - (q.p4.x - q.p3.x)) <= COORD_TOLERANCE).toBe(true);
        expect(Math.abs(q.p2.y - q.p1.y - (q.p4.y - q.p3.y)) <= COORD_TOLERANCE).toBe(true);
        // Contained in the run's page-space AABB.
        const bounds = pdfQuadBounds(q);
        expect(bounds.left >= run.rect.left - COORD_TOLERANCE).toBe(true);
        expect(bounds.right <= run.rect.right + COORD_TOLERANCE).toBe(true);
        expect(bounds.bottom >= run.rect.bottom - COORD_TOLERANCE).toBe(true);
        expect(bounds.top <= run.rect.top + COORD_TOLERANCE).toBe(true);
      }
    }
  });
}

function angleClose(a: number, b: number, tolerance: number): boolean {
  const delta = a - b;
  return Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) <= tolerance;
}

async function openFixture(engine: Engine, opts: PageGeometryOrientationOptions) {
  if (opts.openKind === 'bytes') {
    const bytes = await opts.fixture.bytes();
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes });
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}
