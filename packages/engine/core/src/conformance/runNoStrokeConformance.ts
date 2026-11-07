import { decodePng, type Raster } from './appearanceRasters';
import { pdfOf } from './pdfOf';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { Annotation, AnnotationDraft } from '../annotation/kinds';
import type { Color } from '../annotation/primitives';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { PageHandle } from '../engine/PageHandle';
import type { PageBox } from '../geometry/pageSpace';
import { toPageRef } from '../identity/PageRef';

/** The kinds whose `color` is a stroke. */
const STROKED_KINDS = ['square', 'circle', 'polygon', 'line', 'ink'] as const;
type StrokedKind = (typeof STROKED_KINDS)[number];
type Stroked = Extract<Annotation, { subtype: StrokedKind | 'polyline' }>;

/** The stroke entries checked in Acrobat, and what each reads as. */
const STROKE_CASES = [
  { name: 'red', entries: '/C [1 0 0] /BS << /W 2 >>', color: '#ff0000', strokeWidth: 2 },
  { name: 'empty', entries: '/C [] /BS << /W 2 >>', color: null, strokeWidth: 2 },
  { name: 'left-out', entries: '/BS << /W 2 >>', color: null, strokeWidth: 2 },
  { name: 'width-0', entries: '/C [1 0 0] /BS << /W 0 >>', color: '#ff0000', strokeWidth: 0 },
  { name: 'default-width', entries: '/C [1 0 0]', color: '#ff0000', strokeWidth: 1 },
  { name: 'border-0', entries: '/C [1 0 0] /Border [0 0 0]', color: '#ff0000', strokeWidth: 0 },
] as const;

const PAGE_HEIGHT = 600;
const MARGIN = 20;
const CELL = 90;
const SIZE = 60;

/** A kind's entries for the cell whose lower left corner is (x, y), in the file's space. */
function kindEntries(kind: StrokedKind, x: number, y: number): string {
  const rect = `/Rect [${x} ${y} ${x + SIZE} ${y + SIZE}]`;
  const top = y + SIZE;
  switch (kind) {
    case 'square':
      return `/Subtype /Square ${rect} /IC [0 0 1]`;
    case 'circle':
      return `/Subtype /Circle ${rect} /IC [0 0 1]`;
    case 'polygon':
      return `/Subtype /Polygon ${rect} /Vertices [${x} ${y} ${x + SIZE} ${y} ${x + SIZE / 2} ${top}] /IC [0 0 1]`;
    case 'line':
      return `/Subtype /Line ${rect} /L [${x} ${y} ${x + SIZE} ${top}] /IC [0 0 1]`;
    case 'ink':
      return `/Subtype /Ink ${rect} /InkList [[${x} ${y} ${x + SIZE / 2} ${top} ${x + SIZE} ${y}]]`;
  }
}

const annotationObjects = STROKE_CASES.flatMap((stroke, row) =>
  STROKED_KINDS.map((kind, column) => {
    const x = MARGIN + column * CELL;
    const y = PAGE_HEIGHT - MARGIN - SIZE - row * CELL;
    return `<< /Type /Annot ${kindEntries(kind, x, y)} ${stroke.entries} /F 4 /NM (${stroke.name}-${kind}) >>`;
  }),
);

/**
 * One page of square, circle, polygon, line and ink annotations without
 * appearance streams, a row for each stroke case, each named
 * `<case>-<kind>`: `red-square`, `empty-ink`, … The squares, circles,
 * polygons and lines are filled blue.
 */
export const NO_STROKE_FIXTURE_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 ${PAGE_HEIGHT}] /Annots [${annotationObjects
    .map((_, index) => `${index + 4} 0 R`)
    .join(' ')}] >>`,
  ...annotationObjects,
]);

export interface NoStrokeConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open {@link NO_STROKE_FIXTURE_PDF}, fresh for each call. */
  open: (engine: Engine) => Promise<DocumentHandle>;
}

/**
 * A stroked kind's `color: null` is no stroke, read and written as Acrobat
 * does: `/C []` (ISO 32000's "no colour") or a `/C` left out reads as
 * `null`, a write of `null` stores `/C []`, and either draws the fill alone,
 * where the stroke's middle would be. `strokeWidth` stays as it is.
 */
export function runNoStrokeConformance(
  runner: ConformanceTestRunner,
  options: NoStrokeConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`no-stroke conformance: ${options.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await options.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const onPage = async (run: (page: PageHandle, doc: DocumentHandle) => Promise<void>) => {
      const doc = await options.open(engine);
      try {
        const { pages } = await doc.pages.list();
        await run(doc.page(toPageRef(pages[0]!.ref.objectNumber)), doc);
      } finally {
        await doc.close();
      }
    };

    const strokedOf = async (page: PageHandle): Promise<Map<string, Stroked>> => {
      const { annotations } = await page.annotations.list();
      return new Map(
        annotations.filter(isStroked).map((annotation) => [annotation.nm ?? '', annotation]),
      );
    };

    test('a /C left out or empty reads as no stroke and keeps its width', async () => {
      await onPage(async (page) => {
        const read = await strokedOf(page);
        for (const stroke of STROKE_CASES) {
          for (const kind of STROKED_KINDS) {
            const annotation = read.get(`${stroke.name}-${kind}`);
            expect(annotation?.color).toBe(stroke.color);
            expect(annotation?.strokeWidth).toBe(stroke.strokeWidth);
          }
        }
      });
    });

    test('a shape with no stroke draws its fill alone, where the stroke would be', async () => {
      await onPage(async (page) => {
        // The squares of the first three rows, 2 pt wide: red, empty, left out.
        const [red, empty, leftOut] = await Promise.all(
          [0, 1, 2].map((row) =>
            rasterOf(page, { x: MARGIN, y: MARGIN + row * CELL, width: SIZE, height: SIZE }),
          ),
        );
        // At 4 pixels a point: half a point in is the stroke's, a point and a
        // half in the stroke's or the fill's, the middle the fill's.
        const middle = (SIZE * SCALE) / 2;
        expect(colorAt(red!, 2, middle)).toBe('red');
        expect(colorAt(red!, 6, middle)).toBe('red');
        expect(colorAt(red!, middle, middle)).toBe('blue');
        for (const unstroked of [empty!, leftOut!]) {
          expect(colorAt(unstroked, 2, middle)).toBe('white');
          expect(colorAt(unstroked, 6, middle)).toBe('blue');
          expect(colorAt(unstroked, middle, middle)).toBe('blue');
        }
      });
    });

    test('color null writes /C [] and keeps the width; a color brings the stroke back', async () => {
      await onPage(async (page, doc) => {
        const square = (await strokedOf(page)).get('red-square')!;
        const { annotation: cleared } = await page.annotations.update(square.ref, {
          color: null,
        });
        expect(isStroked(cleared) && cleared.color).toBe(null);
        expect(isStroked(cleared) && cleared.strokeWidth).toBe(2);
        const text = new TextDecoder('latin1').decode(await doc.download());
        expect(lastObjectNamed(text, 'red-square')).toMatch(/\/C\s*\[\s*\]/);

        const { annotation: restroked } = await page.annotations.update(square.ref, {
          color: '#00ff00',
        });
        expect(isStroked(restroked) && restroked.color).toBe('#00ff00');
        expect(isStroked(restroked) && restroked.strokeWidth).toBe(2);
      });
    });

    test('every stroked kind is created without a stroke from color null', async () => {
      await onPage(async (page) => {
        const box = { x: 40, y: 40, width: 60, height: 60 };
        const points = [
          { x: 40, y: 100 },
          { x: 70, y: 40 },
          { x: 100, y: 100 },
        ];
        const drafts: AnnotationDraft[] = [
          { subtype: 'square', box, color: null, interiorColor: '#0000ff' },
          { subtype: 'circle', box, color: null, interiorColor: '#0000ff' },
          { subtype: 'polygon', vertices: points, color: null, interiorColor: '#0000ff' },
          { subtype: 'polyline', vertices: points, color: null },
          {
            subtype: 'line',
            linePoints: { start: points[0]!, end: points[2]! },
            lineEndings: { start: 'none', end: 'closed-arrow' },
            color: null,
            interiorColor: '#0000ff',
          },
          { subtype: 'ink', inkList: [points], color: null },
        ];
        for (const draft of drafts) {
          const { annotation } = await page.annotations.create(draft);
          expect(isStroked(annotation) && annotation.color).toBe(null);
          expect(isStroked(annotation) && annotation.strokeWidth).toBe(1);
        }
        // A color left out is the kind's default, a red stroke.
        const { annotation: defaulted } = await page.annotations.create({
          subtype: 'square',
          box,
        });
        expect(isStroked(defaulted) && defaulted.color).toBe('#ff0000' satisfies Color);
      });
    });
  });
}

/** Device pixels a point in the rendered squares. */
const SCALE = 4;

async function rasterOf(page: PageHandle, rect: PageBox): Promise<Raster> {
  const image = await page.render.image({
    format: 'png',
    target: { kind: 'rect', rect },
    viewport: { kind: 'scale', scale: SCALE },
  });
  const { url, revoke } = await image.objectUrl();
  try {
    return await decodePng(new Uint8Array(await (await fetch(url)).arrayBuffer()));
  } finally {
    revoke();
  }
}

/** The fixture's three colors at a pixel, or `other`. */
function colorAt(raster: Raster, x: number, y: number): 'red' | 'blue' | 'white' | 'other' {
  const at = (Math.round(y) * raster.width + Math.round(x)) * 4;
  const [r, g, b] = [raster.rgba[at]!, raster.rgba[at + 1]!, raster.rgba[at + 2]!];
  if (r > 200 && g < 60 && b < 60) return 'red';
  if (r < 60 && g < 60 && b > 200) return 'blue';
  if (r > 230 && g > 230 && b > 230) return 'white';
  return 'other';
}

function isStroked(annotation: Annotation): annotation is Stroked {
  return (
    (STROKED_KINDS as readonly string[]).includes(annotation.subtype) ||
    annotation.subtype === 'polyline'
  );
}

/** The last object in a PDF file's text that holds `/NM (name)`. */
function lastObjectNamed(text: string, name: string): string {
  const named = [...text.matchAll(new RegExp(`/NM\\s*\\(${name}\\)`, 'g'))];
  const at = named[named.length - 1]?.index;
  if (at === undefined) return '';
  return text.slice(text.lastIndexOf(' obj', at), text.indexOf('endobj', at));
}
