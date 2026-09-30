/**
 * An annotation's `rect` is the upright box around what its appearance
 * paints. The engine measures it on the appearance it bakes; the viewer, on
 * the drawing it draws live, while the write is on its way (core
 * `record/written.ts`). The two drawings are the same drawing, so the two
 * boxes must be the same box: after a create, a move and a restyle, for
 * every kind whose rect follows its drawing.
 *
 * And the rule around it: a move keeps the appearance an annotation has,
 * including none, and keeps its rect's padding; rendering never writes.
 */
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  measureFromKnownLength,
  type AnnotationDraft,
  type AnnotationDTO,
  type AnnotationPatch,
  type LocalDocumentHandle,
  type LocalEngine,
  type LocalPageHandle,
} from '@embedpdf/engine-core/runtime';

import { annotationAfter, annotationOfNew } from '../../../core/annotation/src/record';
import { createLocalEngine } from '../src/index';
import { lastObjectBody, pdf } from './helpers/miniPdf';

/** A page-space box. */
type Rect = { x: number; y: number; width: number; height: number };

const at = (x: number, y: number) => ({ x, y });
const quad = (x: number, y: number, width: number, height: number) => ({
  upperLeft: at(x, y),
  upperRight: at(x + width, y),
  lowerLeft: at(x, y + height),
  lowerRight: at(x + width, y + height),
});
const SCALE = measureFromKnownLength(100, { value: 5, unit: 'm' });
const LINE = { subtype: 'line', color: '#000000', strokeWidth: 4 };
const BOX = { x: 150, y: 400, width: 120, height: 60 };

/** Each drawn kind: its draft, and a restyle that draws it again. */
const KINDS: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
  ['line', { ...LINE, linePoints: { start: at(100, 100), end: at(300, 100) } }, { strokeWidth: 8 }],
  [
    'slanted line',
    { ...LINE, linePoints: { start: at(100, 100), end: at(300, 250) } },
    { strokeWidth: 8 },
  ],
  ...(
    [
      'closed-arrow',
      'open-arrow',
      'r-closed-arrow',
      'r-open-arrow',
      'circle',
      'square',
      'diamond',
      'butt',
      'slash',
    ] as const
  ).map((ending): [string, Record<string, unknown>, Record<string, unknown>] => [
    `line ending ${ending}`,
    {
      ...LINE,
      strokeWidth: 2,
      interiorColor: '#ff0000',
      linePoints: { start: at(100, 150), end: at(260, 190) },
      lineEndings: { start: ending, end: ending },
    },
    { strokeWidth: 3 },
  ]),
  [
    'polyline, mitred knee',
    { ...LINE, subtype: 'polyline', vertices: [at(100, 300), at(150, 250), at(200, 300)] },
    { strokeWidth: 8 },
  ],
  [
    'polyline, bevelled knee',
    { ...LINE, subtype: 'polyline', vertices: [at(100, 300), at(300, 310), at(100, 320)] },
    { strokeWidth: 8 },
  ],
  [
    'polygon',
    { ...LINE, subtype: 'polygon', vertices: [at(350, 100), at(450, 120), at(400, 200)] },
    { strokeWidth: 8 },
  ],
  [
    'cloudy polygon',
    {
      ...LINE,
      strokeWidth: 1,
      subtype: 'polygon',
      cloudyIntensity: 1,
      vertices: [at(350, 250), at(450, 270), at(400, 350)],
    },
    { strokeWidth: 2 },
  ],
  [
    'ink',
    {
      ...LINE,
      subtype: 'ink',
      inkList: [
        [at(100, 500), at(130, 470), at(160, 520)],
        [at(170, 480), at(220, 490)],
      ],
    },
    { strokeWidth: 8 },
  ],
  ['square', { ...LINE, subtype: 'square', box: BOX }, { strokeWidth: 8 }],
  ['turned square', { ...LINE, subtype: 'square', box: BOX, rotation: 30 }, { strokeWidth: 8 }],
  [
    'cloudy square',
    { ...LINE, strokeWidth: 1, subtype: 'square', box: BOX, cloudyIntensity: 1 },
    { strokeWidth: 2 },
  ],
  ['circle', { ...LINE, subtype: 'circle', box: BOX }, { strokeWidth: 8 }],
  [
    'cloudy circle',
    { ...LINE, strokeWidth: 1, subtype: 'circle', box: BOX, cloudyIntensity: 1 },
    { strokeWidth: 2 },
  ],
  [
    'free text',
    { subtype: 'free-text', box: BOX, contents: 'Hello', color: '#000000', strokeWidth: 1 },
    { strokeWidth: 3 },
  ],
  [
    'callout',
    {
      subtype: 'free-text',
      intent: 'free-text-callout',
      box: BOX,
      contents: 'Hello',
      color: '#000000',
      strokeWidth: 1,
      calloutLine: [at(80, 600), at(120, 520), at(150, 430)],
      lineEnding: 'open-arrow',
    },
    { strokeWidth: 3 },
  ],
  [
    'caret',
    { subtype: 'caret', box: { x: 300, y: 600, width: 12, height: 16 }, color: '#0000ff' },
    {
      color: '#ff0000',
    },
  ],
  ...(['highlight', 'underline', 'strikeout', 'squiggly'] as const).map(
    (subtype, i): [string, Record<string, unknown>, Record<string, unknown>] => [
      subtype,
      { subtype, color: '#ffcc00', quadPoints: [quad(350, 450 + i * 40, 120, 14)] },
      { color: '#00cc00' },
    ],
  ),
  // Every caption below sits inside its drawing's box. A caption that sets an
  // edge itself is counted by the glyphs of whatever font the platform draws
  // Helvetica with, so its rect differs between engines: open.
  [
    'distance',
    {
      ...LINE,
      strokeWidth: 1,
      intent: 'line-dimension',
      measure: SCALE,
      linePoints: { start: at(300, 650), end: at(500, 650) },
      lineEndings: { start: 'closed-arrow', end: 'closed-arrow' },
      leader: { length: 30, extension: 5, offset: 0 },
      captionEnabled: true,
      captionPosition: 'inline',
    },
    { strokeWidth: 2 },
  ],
  [
    'distance, caption on top',
    {
      ...LINE,
      strokeWidth: 1,
      intent: 'line-dimension',
      measure: SCALE,
      linePoints: { start: at(300, 720), end: at(500, 720) },
      lineEndings: { start: 'closed-arrow', end: 'closed-arrow' },
      leader: { length: -20, extension: 5, offset: 0 },
      captionEnabled: true,
      captionPosition: 'top',
    },
    { strokeWidth: 2 },
  ],
  [
    'area',
    {
      ...LINE,
      strokeWidth: 1,
      subtype: 'polygon',
      intent: 'polygon-dimension',
      measure: SCALE,
      vertices: [at(450, 550), at(560, 550), at(560, 620), at(450, 620)],
      captionEnabled: true,
    },
    { strokeWidth: 2 },
  ],
  [
    'perimeter',
    {
      ...LINE,
      strokeWidth: 1,
      subtype: 'polyline',
      intent: 'polyline-dimension',
      measure: SCALE,
      vertices: [at(60, 650), at(160, 700), at(260, 650)],
      captionEnabled: true,
    },
    { strokeWidth: 2 },
  ],
];

/**
 * Every edge within 0.005 of a point: the file keeps 32-bit floats, and the
 * engine draws a circle ending as four Bézier curves, a thousandth of a point
 * or so off the true circle the viewer draws.
 */
function expectSameRect(viewer: Rect, engine: Rect): void {
  const edges = (rect: Rect) => ({
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
  });
  const a = edges(viewer);
  const b = edges(engine);
  const off = (['left', 'top', 'right', 'bottom'] as const)
    .map((edge) => [edge, a[edge] - b[edge]] as const)
    .filter(([, difference]) => Math.abs(difference) >= 5e-3)
    .map(([edge, difference]) => `${edge} ${difference > 0 ? '+' : ''}${difference.toFixed(4)}`);
  expect(off, `viewer ${JSON.stringify(a)} vs engine ${JSON.stringify(b)}`).toEqual([]);
}

/** The fields that state where a drawing is, moved by (dx, dy). */
function movedBy(annotation: AnnotationDTO, dx: number, dy: number): AnnotationPatch {
  const move = (point: { x: number; y: number }) => at(point.x + dx, point.y + dy);
  const fields = annotation as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = { subtype: annotation.subtype };
  if (fields.box) {
    const box = fields.box as Rect;
    patch.box = { ...box, x: box.x + dx, y: box.y + dy };
  }
  if (fields.linePoints) {
    const line = fields.linePoints as {
      start: { x: number; y: number };
      end: { x: number; y: number };
    };
    patch.linePoints = { start: move(line.start), end: move(line.end) };
  }
  if (fields.vertices) patch.vertices = (fields.vertices as { x: number; y: number }[]).map(move);
  if (fields.inkList)
    patch.inkList = (fields.inkList as { x: number; y: number }[][]).map((stroke) =>
      stroke.map(move),
    );
  if (fields.calloutLine)
    patch.calloutLine = (fields.calloutLine as { x: number; y: number }[]).map(move);
  if (fields.quadPoints)
    patch.quadPoints = (fields.quadPoints as ReturnType<typeof quad>[]).map((q) => ({
      upperLeft: move(q.upperLeft),
      upperRight: move(q.upperRight),
      lowerLeft: move(q.lowerLeft),
      lowerRight: move(q.lowerRight),
    }));
  if (fields.captionCenter)
    patch.captionCenter = move(fields.captionCenter as { x: number; y: number });
  return patch as unknown as AnnotationPatch;
}

describe.each(['wasm', 'native'] as const)('annotation rect (%s)', (prefer) => {
  let engine: LocalEngine;
  let doc: LocalDocumentHandle;
  let page: LocalPageHandle;
  let opened = 0;

  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer } });
    doc = await engine.open(
      {
        kind: 'bytes',
        id: `rect-${prefer}-${++opened}`,
        bytes: new Uint8Array(
          await readFile(new URL('./fixtures/hello_world.pdf', import.meta.url)),
        ),
      },
      { scope: ['*'] },
    );
    page = doc.page((await doc.pages.list()).pages[0]!.ref);
  });

  afterAll(async () => {
    await doc?.close();
  });

  /** Creates `draft`, and the annotation the viewer shows while the create is on its way. */
  async function create(draft: Record<string, unknown>) {
    const { annotation } = await page.annotations.create(draft as unknown as AnnotationDraft);
    const shown = annotationOfNew({ ...draft, nm: annotation.nm } as unknown as AnnotationDraft, {
      ref: annotation.ref,
      index: annotation.index,
    });
    return { annotation, shown };
  }

  /** Updates `annotation` by `patch`, and the annotation the viewer shows meanwhile. */
  async function update(annotation: AnnotationDTO, patch: AnnotationPatch) {
    const shown = annotationAfter(annotation, patch);
    const result = await page.annotations.update(annotation.ref, patch);
    return { annotation: result.annotation, shown, appearance: result.appearance };
  }

  describe('the viewer shows the rect the engine writes', () => {
    test.each(KINDS)('%s: created', async (_name, draft) => {
      const { annotation, shown } = await create(draft);
      expectSameRect(shown.rect, annotation.rect);
    });

    test.each(KINDS)('%s: moved', async (_name, draft) => {
      const { annotation } = await create(draft);
      const moved = await update(annotation, movedBy(annotation, 30, 20));
      expect(moved.appearance.action).toBe('preserved');
      expectSameRect(moved.shown.rect, moved.annotation.rect);
    });

    test.each(KINDS)('%s: restyled', async (_name, draft, restyle) => {
      const { annotation } = await create(draft);
      const patch = { subtype: annotation.subtype, ...restyle } as unknown as AnnotationPatch;
      const restyled = await update(annotation, patch);
      expect(restyled.appearance.action).toBe('regenerated');
      expectSameRect(restyled.shown.rect, restyled.annotation.rect);
    });
  });
});

/**
 * A page from another app: a line with no appearance and a rect with no
 * height (object 4), and an arrow with its own appearance and its rect padded
 * past it (object 5, drawn by object 6).
 */
function foreignPage(): Uint8Array {
  const drawing = '0 0 1 RG 2 w 100 400 m 250 400 l S 238 394 m 250 400 l 238 406 l S';
  return pdf({
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [4 0 R 5 0 R] >>',
    4: '<< /Type /Annot /Subtype /Line /L [100 600 250 600] /LE [/None /ClosedArrow] /Rect [100 600 250 600] /C [1 0 0] /IC [1 0 0] /BS << /W 2 >> /F 4 >>',
    5: '<< /Type /Annot /Subtype /Line /L [100 400 250 400] /LE [/None /OpenArrow] /Rect [90 385 265 415] /C [0 0 1] /BS << /W 2 >> /F 4 /AP << /N 6 0 R >> >>',
    6: `<< /Type /XObject /Subtype /Form /BBox [90 385 265 415] /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`,
  });
}

/** A page from another app with one annotation of each kind, none with an appearance. */
function bareKindsPage(): Uint8Array {
  return pdf({
    1: '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [7 0 R] /DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv 8 0 R >> >> >> >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [4 0 R 5 0 R 6 0 R 7 0 R 9 0 R 10 0 R] >>',
    4: '<< /Type /Annot /Subtype /Text /Rect [100 700 120 720] /Contents (note) /C [1 1 0] /F 4 >>',
    5: '<< /Type /Annot /Subtype /Caret /Rect [200 700 212 716] /C [0 0 1] /F 4 >>',
    6: '<< /Type /Annot /Subtype /Square /Rect [300 700 360 740] /C [1 0 0] /BS << /W 2 >> /F 4 >>',
    7: '<< /Type /Annot /Subtype /Widget /FT /Tx /T (name) /V (hello) /Rect [100 600 250 620] /DA (/Helv 12 Tf 0 g) /F 4 /P 3 0 R >>',
    8: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    9: '<< /Type /Annot /Subtype /FileAttachment /Rect [400 700 420 720] /FS << /Type /Filespec /F (a.txt) >> /F 4 >>',
    10: '<< /Type /Annot /Subtype /Link /Rect [100 500 200 520] /Border [0 0 1] /C [0 0 1] >>',
  });
}

describe.each(['wasm', 'native'] as const)('annotation rect: from another app (%s)', (prefer) => {
  let engine: LocalEngine;
  let doc: LocalDocumentHandle;
  let page: LocalPageHandle;
  let opened = 0;

  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer } });
  });

  async function open() {
    doc = await engine.open(
      { kind: 'bytes', id: `foreign-${prefer}-${++opened}`, bytes: foreignPage() },
      { scope: ['*'] },
    );
    page = doc.page((await doc.pages.list()).pages[0]!.ref);
    const { annotations } = await page.annotations.list();
    const byObject = (objectNumber: number) =>
      annotations.find(
        (annotation) =>
          annotation.ref.kind === 'objectNumber' && annotation.ref.objectNumber === objectNumber,
      )!;
    return { bare: byObject(4), arrow: byObject(5) };
  }

  /** The annotation's dictionary as the saved file holds it. */
  async function savedBody(objectNumber: number): Promise<string> {
    return lastObjectBody(await doc.download({ mode: 'rewrite' }), objectNumber);
  }

  test('rendering an annotation with no appearance writes nothing', async () => {
    const { bare } = await open();
    await page.render.raw({ viewport: { kind: 'scale', scale: 1 } });
    await page.annotations.renderAppearancesRaw({ viewport: { kind: 'scale', scale: 1 } });
    const body = await savedBody(4);
    expect(body).not.toContain('/AP');
    expect(body).toMatch(/\/Rect\s*\[\s*100\s+600\s+250\s+600\s*\]/);
    expect((await page.annotations.list()).annotations.find((a) => a.nm === bare.nm)?.rect).toEqual(
      bare.rect,
    );
    await doc.close();
  });

  test('showing annotations of every kind with no appearance writes none', async () => {
    doc = await engine.open(
      { kind: 'bytes', id: `bare-${prefer}-${++opened}`, bytes: bareKindsPage() },
      { scope: ['*'] },
    );
    page = doc.page((await doc.pages.list()).pages[0]!.ref);
    await page.annotations.list();
    await page.render.raw({ viewport: { kind: 'scale', scale: 1 } });
    await page.annotations.renderAppearancesRaw({ viewport: { kind: 'scale', scale: 1 } });
    const saved = await doc.download({ mode: 'rewrite' });
    for (const [objectNumber, kind] of [
      [4, 'note'],
      [5, 'caret'],
      [6, 'square'],
      [7, 'text field'],
      [9, 'file attachment'],
      [10, 'link'],
    ] as const) {
      expect(lastObjectBody(saved, objectNumber), kind).not.toContain('/AP');
    }
    await doc.close();
  });

  test('a move keeps no appearance where there was none, and moves the rect as it is', async () => {
    const { bare } = await open();
    const patch = movedBy(bare, 30, 20);
    const shown = annotationAfter(bare, patch);
    const result = await page.annotations.update(bare.ref, patch);
    expect(result.appearance.action).toBe('preserved');
    expect(result.annotation.rect).toEqual({
      ...bare.rect,
      x: bare.rect.x + 30,
      y: bare.rect.y + 20,
    });
    expectSameRect(shown.rect, result.annotation.rect);
    expect(await savedBody(4)).not.toContain('/AP');
    await doc.close();
  });

  test('a move keeps an appearance from another app, and its rect with all its padding', async () => {
    const { arrow } = await open();
    const drawn = await savedBody(6);
    const patch = movedBy(arrow, 30, 20);
    const shown = annotationAfter(arrow, patch);
    const result = await page.annotations.update(arrow.ref, patch);
    expect(result.appearance.action).toBe('preserved');
    expect(result.annotation.rect).toEqual({
      ...arrow.rect,
      x: arrow.rect.x + 30,
      y: arrow.rect.y + 20,
    });
    expectSameRect(shown.rect, result.annotation.rect);
    expect(await savedBody(6)).toBe(drawn);
    await doc.close();
  });

  test('a restyle draws it again: the rect is the box around our drawing', async () => {
    for (const which of ['bare', 'arrow'] as const) {
      const annotations = await open();
      const annotation = annotations[which];
      const patch = { subtype: 'line', strokeWidth: 3 } as unknown as AnnotationPatch;
      const shown = annotationAfter(annotation, patch);
      const result = await page.annotations.update(annotation.ref, patch);
      expect(result.appearance.action).toBe('regenerated');
      expectSameRect(shown.rect, result.annotation.rect);
      await doc.close();
    }
  });
});
