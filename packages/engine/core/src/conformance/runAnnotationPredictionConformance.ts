import type { ConformanceTestRunner } from './runMetadataConformance';
import { pdfOf } from './pdfOf';
import { iconRect, PNG_1X1 } from './creatables';
import type { AnnotationDraft, AnnotationDTO, AnnotationPatch } from '../annotation/kinds';
import type { AnnotationResources } from '../annotation/resources';
import { DRAWN_RECT_KINDS } from '../annotation/shapeForRect';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { PageHandle } from '../engine/PageHandle';
import type { Engine } from '../engine/Engine';
import type { PageBox } from '../geometry/pageSpace';
import { toPageRef } from '../identity/PageRef';
import { measureFromRatio } from '../measure/calibrate';
import { applyAnnotationPatch } from '../pageSpace/helpers';

/** One blank US Letter page. */
export const PREDICTION_FIXTURE_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
]);

export interface AnnotationPredictionConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open {@link PREDICTION_FIXTURE_PDF}. Called once; every case adds its own annotation. */
  open: (engine: Engine) => Promise<DocumentHandle>;
}

/** An update whose outcome is predicted: a fresh annotation, then one patch. */
interface PredictionCase {
  name: string;
  draft: AnnotationDraft;
  resources?: AnnotationResources;
  /** The patch, or a patch made from the created annotation. */
  patch: AnnotationPatch | ((created: AnnotationDTO) => AnnotationPatch);
  updateResources?: AnnotationResources;
}

const BOX: PageBox = { x: 72, y: 72, width: 120, height: 80 };

const MEASURE = measureFromRatio(1, 100, 'cm');

const FREE_TEXT: AnnotationDraft = {
  subtype: 'free-text',
  box: BOX,
  intent: 'free-text',
  fontFamily: 'helvetica',
  fontSize: 12,
  textAlign: 'left',
  contents: 'Hello there',
};

const CALLOUT: AnnotationDraft = {
  subtype: 'free-text',
  box: { x: 220, y: 600, width: 120, height: 60 },
  intent: 'free-text-callout',
  fontFamily: 'helvetica',
  fontSize: 12,
  textAlign: 'left',
  contents: 'Look here',
  calloutLine: [
    { x: 80, y: 700 },
    { x: 150, y: 640 },
    { x: 220, y: 630 },
  ],
  lineEnding: 'open-arrow',
};

const TRIANGLE = [
  { x: 100, y: 300 },
  { x: 220, y: 300 },
  { x: 160, y: 200 },
];

const CASES: PredictionCase[] = [
  {
    name: 'square: a new color',
    draft: { subtype: 'square', box: BOX },
    patch: { color: '#1a2b3c' },
  },
  {
    name: 'square: moved by its box',
    draft: { subtype: 'square', box: BOX },
    patch: { box: { ...BOX, x: BOX.x + 30 } },
  },
  { name: 'square: turned', draft: { subtype: 'square', box: BOX }, patch: { rotation: 30 } },
  {
    name: 'square: straightened',
    draft: { subtype: 'square', box: BOX, rotation: 30 },
    patch: { rotation: null },
  },
  {
    name: 'square: moved by its rect',
    draft: { subtype: 'square', box: BOX },
    patch: (created) => ({ rect: { ...created.rect, x: created.rect.x + 40 } }),
  },
  {
    name: 'square: the whole read sent back with one change',
    draft: { subtype: 'square', box: BOX, interiorColor: '#ff0000' },
    patch: (created) => ({ ...created, contents: 'kept' }) as AnnotationPatch,
  },
  {
    name: 'line: new points',
    draft: { subtype: 'line', linePoints: { start: { x: 80, y: 400 }, end: { x: 300, y: 450 } } },
    patch: { linePoints: { start: { x: 90, y: 410 }, end: { x: 310, y: 470 } } },
  },
  {
    name: 'line: new endings',
    draft: { subtype: 'line', linePoints: { start: { x: 80, y: 400 }, end: { x: 300, y: 450 } } },
    patch: { lineEndings: { start: 'none', end: 'closed-arrow' } },
  },
  {
    name: 'distance: new points relabel it',
    draft: {
      subtype: 'line',
      linePoints: { start: { x: 80, y: 500 }, end: { x: 280, y: 500 } },
      intent: 'line-dimension',
      measure: MEASURE,
      captionEnabled: true,
    },
    patch: { linePoints: { start: { x: 80, y: 500 }, end: { x: 380, y: 500 } } },
  },
  {
    name: 'distance: a new scale relabels it',
    draft: {
      subtype: 'line',
      linePoints: { start: { x: 80, y: 520 }, end: { x: 280, y: 520 } },
      intent: 'line-dimension',
      measure: MEASURE,
    },
    patch: { measure: measureFromRatio(1, 50, 'mm') },
  },
  {
    name: 'area: moved whole, its caption follows',
    draft: {
      subtype: 'polygon',
      vertices: TRIANGLE,
      intent: 'polygon-dimension',
      measure: MEASURE,
      captionEnabled: true,
      captionCenter: { x: 160, y: 270 },
    },
    patch: { vertices: TRIANGLE.map((point) => ({ x: point.x + 20, y: point.y + 10 })) },
  },
  {
    name: 'area: one vertex moved relabels it',
    draft: {
      subtype: 'polygon',
      vertices: TRIANGLE,
      intent: 'polygon-dimension',
      measure: MEASURE,
    },
    patch: { vertices: [TRIANGLE[0]!, TRIANGLE[1]!, { x: 160, y: 150 }] },
  },
  {
    name: 'ink: turned',
    draft: {
      subtype: 'ink',
      inkList: [
        [
          { x: 300, y: 100 },
          { x: 350, y: 140 },
          { x: 400, y: 110 },
        ],
      ],
    },
    patch: { rotation: 45 },
  },
  { name: 'free text: new contents', draft: FREE_TEXT, patch: { contents: 'Goodbye' } },
  {
    name: 'free text: new contents over two lines',
    draft: FREE_TEXT,
    patch: { contents: 'First line\nSecond line' },
  },
  { name: 'free text: a new font size', draft: FREE_TEXT, patch: { fontSize: 18 } },
  { name: 'free text: a new font', draft: FREE_TEXT, patch: { fontFamily: 'times-bold' } },
  {
    name: 'free text: new contents and a new size together',
    draft: FREE_TEXT,
    patch: { contents: 'Bigger', fontSize: 20 },
  },
  { name: 'free text: a new color', draft: FREE_TEXT, patch: { color: '#0000ff' } },
  {
    name: 'free text: the text color handed back to color',
    draft: { ...FREE_TEXT, fontColor: '#ff0000' } as AnnotationDraft,
    patch: { fontColor: null },
  },
  { name: 'free text: a new alignment', draft: FREE_TEXT, patch: { textAlign: 'center' } },
  {
    name: 'free text: new rich text',
    draft: FREE_TEXT,
    patch: {
      richText: {
        paragraphs: [{ runs: [{ text: 'Rich ' }, { text: 'text', style: { weight: 700 } }] }],
      },
    },
  },
  {
    name: 'callout: moved by its box, its line stays attached',
    draft: CALLOUT,
    patch: { box: { x: 260, y: 600, width: 120, height: 60 } },
  },
  {
    name: 'callout: turned, its line meets the turned box',
    draft: CALLOUT,
    patch: { rotation: 30 },
  },
  {
    name: 'callout: a line given with the box is kept as given',
    draft: CALLOUT,
    patch: {
      box: { x: 260, y: 600, width: 120, height: 60 },
      calloutLine: [
        { x: 80, y: 700 },
        { x: 150, y: 640 },
        { x: 262, y: 610 },
      ],
    },
  },
  {
    name: 'note: a standard review state',
    draft: { subtype: 'text', rect: iconRect(400, 72) },
    patch: { state: 'accepted' },
  },
  {
    name: 'link: a new target',
    draft: { subtype: 'link', rect: BOX, target: { kind: 'uri', uri: 'https://example.com' } },
    patch: { target: { kind: 'uri', uri: 'https://embedpdf.com' } },
  },
  {
    name: 'link: its target cleared',
    draft: { subtype: 'link', rect: BOX, target: { kind: 'uri', uri: 'https://example.com' } },
    patch: { target: null },
  },
  {
    name: 'link: moved by its rect',
    draft: { subtype: 'link', rect: BOX, target: { kind: 'uri', uri: 'https://example.com' } },
    patch: { rect: { ...BOX, y: BOX.y + 50 } },
  },
  {
    name: 'redaction: a new label',
    draft: { subtype: 'redact', rect: BOX },
    patch: { overlayText: 'CONFIDENTIAL', repeat: true },
  },
  {
    name: 'stamp: a new drawing and nothing else',
    draft: { subtype: 'stamp', box: BOX },
    resources: { appearance: PNG_1X1 },
    patch: {},
    updateResources: { appearance: PNG_1X1 },
  },
  {
    name: 'file attachment: a new description',
    draft: {
      subtype: 'file-attachment',
      rect: iconRect(450, 72),
      file: { name: 'note.txt', mimeType: 'text/plain', description: 'A note' },
    },
    resources: { file: new TextEncoder().encode('attached') },
    patch: { file: { name: 'note.txt', description: 'Another note' } },
  },
];

/**
 * Fields a prediction leaves as they were: the engine works them out from its
 * drawing, or stamps them on every write.
 */
function unpredicted(annotation: AnnotationDTO): Set<string> {
  const names = new Set(['modifiedAt', 'modifiedBy']);
  if (DRAWN_RECT_KINDS.has(annotation.subtype)) names.add('rect');
  return names;
}

/** Values equal within the file's precision: numbers to a thousandth of a point. */
function sameValue(left: unknown, right: unknown): boolean {
  if (typeof left === 'number' && typeof right === 'number') return Math.abs(left - right) <= 1e-3;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object')
    return left === right;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) =>
    sameValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
  );
}

/** The fields where the engine's answer differs from the prediction. */
function differences(predicted: AnnotationDTO, actual: AnnotationDTO) {
  const skip = unpredicted(actual);
  const names = new Set([...Object.keys(predicted), ...Object.keys(actual)]);
  return [...names]
    .filter((name) => !skip.has(name))
    .filter(
      (name) =>
        !sameValue(
          (predicted as unknown as Record<string, unknown>)[name],
          (actual as unknown as Record<string, unknown>)[name],
        ),
    )
    .map((name) => ({
      field: name,
      predicted: (predicted as unknown as Record<string, unknown>)[name],
      actual: (actual as unknown as Record<string, unknown>)[name],
    }));
}

/**
 * What a patch does, predicted: `applyAnnotationPatch(read, patch)` equals the
 * annotation the engine reads back after `update(ref, patch)`, on every field
 * but the ones the engine works out from its drawing or stamps on each write.
 * A viewer shows a pending change this way, so the prediction is what the
 * user sees until the engine answers.
 */
export function runAnnotationPredictionConformance(
  runner: ConformanceTestRunner,
  opts: AnnotationPredictionConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`annotation prediction conformance: ${opts.label}`, () => {
    let engine: Engine;
    let doc: DocumentHandle;
    let page: PageHandle;

    beforeAll(async () => {
      engine = await opts.makeEngine();
      doc = await opts.open(engine);
      const { pages } = await doc.pages.list();
      page = doc.page(toPageRef(pages[0]!.ref.pageObjectNumber));
    });

    afterAll(async () => {
      if (doc) await doc.close();
      if (engine) await engine.destroy();
    });

    for (const scenario of CASES) {
      test(scenario.name, async () => {
        const { annotation: created } = await page.annotations.create(
          scenario.draft,
          scenario.resources,
        );
        const patch =
          typeof scenario.patch === 'function' ? scenario.patch(created) : scenario.patch;
        const predicted = applyAnnotationPatch(created, patch);
        const { annotation: actual } = await page.annotations.update(
          created.ref,
          patch,
          scenario.updateResources,
        );
        expect(differences(predicted, actual)).toEqual([]);
      });
    }
  });
}
