import { decodePng, type Raster } from './appearanceRasters';
import type { PageSpaceFixture, PageSpaceFixturePage } from './pageSpaceFixtures';
import { PAGE_SPACE_FIXTURES } from './pageSpaceFixtures';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { AnnotationDTO } from '../annotation/kinds';
import type { PageLayout } from '../dto/PageLayout';
import type { PageImageHandle, PageImageOptions } from '../dto/PageRender';
import type { PageDestination } from '../dto/PdfDestination';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { PdfRect } from '../geometry/primitives';
import type { PageRef } from '../identity/PageRef';

export interface PageSpaceConformanceOptions {
  label: string;
  /** Build a fresh engine for this suite. The suite tears it down at the end. */
  makeEngine: () => Promise<Engine> | Engine;
  /** Open a fresh copy of `fixture`. */
  open: (engine: Engine, fixture: PageSpaceFixture) => Promise<DocumentHandle>;
  /** Only these fixtures (by name); all when left out. */
  only?: readonly string[];
}

/** A box measured from the top-left of the visible page: x right, y down. */
interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where things really are on a page, checked against what the renderer
 * draws. An unturned render starts at the top-left of the visible page, so a
 * position measured from there, times the scale, is a pixel. The fixtures
 * write their answers out by hand from ISO 32000; this suite converts the
 * engine's values with those answers, never with engine code, so it checks
 * the engine's boxes, the renderer and every position the API returns.
 */
export function runPageSpaceConformance(
  runner: ConformanceTestRunner,
  opts: PageSpaceConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;
  const fixtures = PAGE_SPACE_FIXTURES.filter(
    (fixture) => !opts.only || opts.only.includes(fixture.name),
  );

  describe(`page space conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    for (const fixture of fixtures) {
      describe(`${fixture.name}: ${fixture.about}`, () => {
        let doc: DocumentHandle;
        let layouts: PageLayout[];

        beforeAll(async () => {
          doc = await opts.open(engine, fixture);
          layouts = (await doc.pages.list()).pages;
        });

        afterAll(async () => {
          if (doc) await doc.close();
        });

        const eachPage = async (
          check: (page: PageSpaceFixturePage, layout: PageLayout) => Promise<void>,
        ) => {
          expect(layouts.length).toBe(fixture.pages.length);
          for (const [index, page] of fixture.pages.entries()) {
            await check(page, layouts[index]!);
          }
        };
        // A page whose visible box has no area shows nothing to look at.
        const eachShownPage = (
          check: (page: PageSpaceFixturePage, layout: PageLayout) => Promise<void>,
        ) =>
          eachPage((page, layout) =>
            hasArea(page.expected.visible) ? check(page, layout) : Promise.resolve(),
          );

        test('the page size is the visible page box', async () => {
          await eachPage(async (page, layout) => {
            const visible = page.expected.visible;
            expect(layout.size).toEqual({
              width: visible.right - visible.left,
              height: visible.top - visible.bottom,
            });
          });
        });

        test('the boxes are as ISO defines them, measured from the visible page', async () => {
          await eachPage(async (page, layout) => {
            const { boxes, visible } = page.expected;
            expect(layout.pdfCropBox).toEqual(visible);
            expect(layout.boxes).toEqual({
              media: toPage(boxes.media, visible),
              crop: toPage(boxes.crop, visible),
              bleed: toPage(boxes.bleed, visible),
              trim: toPage(boxes.trim, visible),
              art: toPage(boxes.art, visible),
            });
            expect(layout.boxes.crop).toEqual({
              x: 0,
              y: 0,
              width: width(visible),
              height: height(visible),
            });
          });
        });

        test('the turn and the unit size', async () => {
          await eachPage(async (page, layout) => {
            expect(layout.rotation).toBe(page.expected.rotation);
            expect(layout.userUnit).toBe(page.expected.userUnit);
          });
        });

        test("a render starts at the visible page box's top-left", async () => {
          await eachShownPage(async (page, layout) => {
            const visible = page.expected.visible;
            const scale = scaleFor(visible);
            const raster = await render(doc, layout.ref, { viewport: { kind: 'scale', scale } });
            expect(Math.abs(raster.width - width(visible) * scale) <= 1).toBe(true);
            expect(Math.abs(raster.height - height(visible) * scale) <= 1).toBe(true);
            for (const mark of page.marks) {
              expect(darkAt(raster, middleOf(toPage(mark, visible)), scale)).toBe(true);
            }
            // The corner itself is empty: the first mark starts 40 units in.
            expect(darkAt(raster, { x: 20, y: 20 }, scale)).toBe(false);
          });
        });

        test('text is found where it is drawn', async () => {
          const slice = await doc.search.query({ text: 'Corner' });
          await eachShownPage(async (page, layout) => {
            const visible = page.expected.visible;
            const word = page.words[0]!;
            const match = slice.matches.find((m) => samePage(m.page, layout.ref));
            expect(match !== undefined).toBe(true);
            const box = match!.segments[0]!.rect;
            expect(Math.abs(box.x - (word.x - visible.left)) <= 3).toBe(true);
            expect(box.y < visible.top - word.y && box.y + box.height > visible.top - word.y).toBe(
              true,
            );
            const scale = scaleFor(visible);
            const raster = await render(doc, layout.ref, { viewport: { kind: 'scale', scale } });
            expect(darkInside(raster, box, scale) > 0).toBe(true);
          });
        });

        test('a created annotation is drawn where it was put', async () => {
          await eachShownPage(async (page, layout) => {
            const visible = page.expected.visible;
            const spot: PageBox = {
              x: width(visible) / 2 - 20,
              y: height(visible) / 2 - 20,
              width: 40,
              height: 40,
            };
            const handle = doc.page(layout.ref);
            const { annotation } = await handle.annotations.create({
              subtype: 'square',
              box: spot,
              color: '#000000',
              interiorColor: '#000000',
            });
            try {
              const read = annotation.rect;
              expect(read.x <= spot.x && read.x + read.width >= spot.x + spot.width).toBe(true);
              expect(read.y <= spot.y && read.y + read.height >= spot.y + spot.height).toBe(true);
              const scale = scaleFor(visible);
              const raster = await render(doc, layout.ref, {
                viewport: { kind: 'scale', scale },
                includeAnnotations: true,
              });
              expect(darkAt(raster, middleOf(spot), scale)).toBe(true);
            } finally {
              await handle.annotations.delete(annotation.ref);
            }
          });
        });

        // Widgets are read like every annotation (checked against the pixels
        // above), so reading back the rect that was asked shows where it went.
        test("a form field's widget is placed where it was put", async () => {
          await eachShownPage(async (page, layout) => {
            const visible = page.expected.visible;
            const spot: PageBox = {
              x: width(visible) / 2 - 30,
              y: height(visible) / 2 - 10,
              width: 60,
              height: 20,
            };
            const { field } = await doc.forms.create({
              family: 'text',
              name: `placed_${layout.ref.objectNumber}`,
              widgets: [{ page: layout.ref, rect: spot }],
            });
            try {
              const widget = field.widgets[0]!;
              const { annotations } = await doc.page(layout.ref).annotations.list();
              const read = annotations.find(
                (a) => a.ref.kind === 'objectNumber' && a.ref.objectNumber === widget.objectNumber,
              );
              expect(read?.rect).toEqual(spot);
            } finally {
              await doc.forms.delete(field.ref);
            }
          });
        });

        test('a region render shows its own area', async () => {
          await eachShownPage(async (page, layout) => {
            const raster = await render(doc, layout.ref, {
              target: { kind: 'rect', rect: toPage(page.marks[0]!, page.expected.visible) },
              viewport: { kind: 'scale', scale: 0.1 },
            });
            expect(raster.width > 0 && raster.height > 0).toBe(true);
            expect(everyPixelDark(raster)).toBe(true);
          });
        });

        if (fixture.pages.some((page) => page.links?.length)) {
          test("a destination is measured from its target page's visible box", async () => {
            await eachPage(async (page, layout) => {
              if (!page.links?.length) return;
              const { annotations } = await doc.page(layout.ref).annotations.list();
              const links = annotations.filter(
                (a): a is Extract<AnnotationDTO, { subtype: 'link' }> => a.subtype === 'link',
              );
              for (const link of page.links) {
                const read = links.find((a) =>
                  sameBox(a.rect, toPage(link.rect, page.expected.visible)),
                );
                expect(read !== undefined).toBe(true);
                const target = read!.target;
                expect(target?.kind).toBe('goto');
                if (target?.kind !== 'goto') continue;
                const destination = target.destination;
                expect(samePage(destination.page, layouts[link.toPage]!.ref)).toBe(true);
                expect(placeOf(destination)).toEqual(link.expected);
              }
            });
          });
        }

        if (fixture.pages.some((page) => page.openAction)) {
          test("a page's open action is measured from its target page's visible box", async () => {
            await eachPage(async (page, layout) => {
              if (!page.openAction) return;
              const root = layout.actions?.open?.root;
              expect(root?.type).toBe('goto');
              if (root?.type !== 'goto') return;
              const target = layouts[page.openAction.toPage]!.ref;
              expect(samePage(root.destination.page, target)).toBe(true);
              expect(placeOf(root.destination)).toEqual(page.openAction.expected);
            });
          });
        }

        if (fixture.fieldAction) {
          const { toPage, expected } = fixture.fieldAction;
          test("a field's actions are measured from their target page's visible box", async () => {
            const { fields } = await doc.forms.list();
            const script = fields.find((field) => field.name === 'total')?.actions?.calculate?.root;
            expect(script?.type).toBe('javascript');
            const goTo = script?.next[0];
            expect(goTo?.type).toBe('goto');
            if (goTo?.type !== 'goto') return;
            expect(samePage(goTo.destination.page, layouts[toPage]!.ref)).toBe(true);
            expect(placeOf(goTo.destination)).toEqual(expected);
          });
        }

        if (fixture.openDestination) {
          const { toPage, expected } = fixture.openDestination;
          test("the document's open destination is measured from its page's visible box", async () => {
            const { openDestination } = await doc.actions.get();
            expect(openDestination != null).toBe(true);
            expect(samePage(openDestination!.page, layouts[toPage]!.ref)).toBe(true);
            expect(placeOf(openDestination!)).toEqual(expected);
          });
        }

        test('a redaction removes what is inside it, and only that', async () => {
          const page = fixture.pages[0]!;
          const layout = layouts[0]!;
          const visible = page.expected.visible;
          if (!hasArea(visible)) return;
          const slice = await doc.search.query({ text: 'Corner' });
          const match = slice.matches.find((m) => samePage(m.page, layout.ref));
          expect(match !== undefined).toBe(true);
          const found = match!.segments[0]!.rect;
          const handle = doc.page(layout.ref);
          const { annotation } = await handle.annotations.create({
            subtype: 'redact',
            rect: {
              x: found.x - 2,
              y: found.y - 2,
              width: found.width + 4,
              height: found.height + 4,
            },
          });
          await doc.redaction.apply({ annotations: [annotation.ref] });

          const after = await doc.search.query({ text: 'Corner' });
          expect(after.matches.some((m) => samePage(m.page, layout.ref))).toBe(false);
          const scale = scaleFor(visible);
          const raster = await render(doc, layout.ref, { viewport: { kind: 'scale', scale } });
          expect(darkInside(raster, found, scale)).toBe(0);
          for (const mark of page.marks) {
            expect(darkAt(raster, middleOf(toPage(mark, visible)), scale)).toBe(true);
          }
        });
      });
    }
  });
}

// ── positions, converted the way the fixtures define them ──

const width = (r: PdfRect) => r.right - r.left;
const height = (r: PdfRect) => r.top - r.bottom;
const hasArea = (r: PdfRect) => width(r) > 0 && height(r) > 0;

function toPage(r: PdfRect, visible: PdfRect): PageBox {
  return { x: r.left - visible.left, y: visible.top - r.top, width: width(r), height: height(r) };
}

const middleOf = (box: PageBox) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** A page-space destination's kind and place, without its page and zoom. */
function placeOf(destination: PageDestination) {
  switch (destination.kind) {
    case 'xyz':
      return { kind: 'xyz', x: destination.x ?? null, y: destination.y ?? null };
    case 'fitH':
      return { kind: 'fitH', y: destination.y ?? null };
    case 'fitV':
      return { kind: 'fitV', x: destination.x ?? null };
    case 'fitR': {
      const { x, y, width, height } = destination;
      return { kind: 'fitR', x, y, width, height };
    }
    default:
      return { kind: destination.kind };
  }
}

const sameBox = (a: PageBox, b: PageBox) =>
  Math.abs(a.x - b.x) < 0.01 &&
  Math.abs(a.y - b.y) < 0.01 &&
  Math.abs(a.width - b.width) < 0.01 &&
  Math.abs(a.height - b.height) < 0.01;

const samePage = (a: PageRef, b: PageRef) => a.objectNumber === b.objectNumber;

// ── pixels ──

/** Half size, or less for a large page: at most 2000 pixels on the long side, so 24 pt words stay dark. */
const scaleFor = (visible: PdfRect) =>
  Math.min(0.5, 2000 / Math.max(width(visible), height(visible)));

async function render(
  doc: DocumentHandle,
  ref: PageRef,
  options: PageImageOptions,
): Promise<Raster> {
  return decode(await doc.page(ref).render.image({ format: 'png', ...options }));
}

/** The image's pixels, fetched the way an app would: through its object URL. */
async function decode(image: PageImageHandle): Promise<Raster> {
  const { url, revoke } = await image.objectUrl();
  try {
    return await decodePng(new Uint8Array(await (await fetch(url)).arrayBuffer()));
  } finally {
    revoke();
  }
}

function isDark(raster: Raster, px: number, py: number): boolean {
  if (px < 0 || py < 0 || px >= raster.width || py >= raster.height) return false;
  const at = (py * raster.width + px) * 4;
  const { rgba } = raster;
  return rgba[at]! < 80 && rgba[at + 1]! < 80 && rgba[at + 2]! < 80 && rgba[at + 3]! > 128;
}

function darkAt(raster: Raster, point: { x: number; y: number }, scale: number): boolean {
  return isDark(raster, Math.floor(point.x * scale), Math.floor(point.y * scale));
}

function darkInside(raster: Raster, box: PageBox, scale: number): number {
  let count = 0;
  const x0 = Math.ceil(box.x * scale);
  const x1 = Math.floor((box.x + box.width) * scale);
  const y0 = Math.ceil(box.y * scale);
  const y1 = Math.floor((box.y + box.height) * scale);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) if (isDark(raster, x, y)) count++;
  }
  return count;
}

function everyPixelDark(raster: Raster): boolean {
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) if (!isDark(raster, x, y)) return false;
  }
  return true;
}
