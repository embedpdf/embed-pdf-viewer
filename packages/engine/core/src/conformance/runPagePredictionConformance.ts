import { pdfOf } from './pdfOf';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { PageLayout } from '../dto/PageLayout';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { toPageRef, type PageRef } from '../identity/PageRef';
import {
  pagesAfter,
  pagesAfterRestore,
  reorderBackOf,
  restoredPagesOf,
  rotateBackOf,
  type PredictablePageOp,
} from '../pages/predict';

/**
 * Four pages that read differently: a Letter page; an A4 page turned a
 * quarter; a page with a crop box, a user unit and a tab order; and a square
 * page with a trim box, turned three quarters. No page labels.
 */
export const PAGE_PREDICTION_FIXTURE_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R 6 0 R] /Count 4 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Rotate 90 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /CropBox [10 10 390 290] ' +
    '/UserUnit 2 /Tabs /R >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 500] /TrimBox [20 20 480 480] /Rotate 270 >>',
]);

export interface PagePredictionConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open {@link PAGE_PREDICTION_FIXTURE_PDF}. Called once: every case undoes what it did. */
  open: (engine: Engine) => Promise<DocumentHandle>;
}

/** An op made from the pages as they are, with names for any pages it makes. */
interface PredictionCase {
  readonly name: string;
  /** How many fresh object numbers the op needs. */
  readonly numbers?: number;
  readonly op: (pages: readonly PageLayout[], numbers: readonly number[]) => PredictablePageOp;
}

/** The pages at these display positions. */
const at = (pages: readonly PageLayout[], ...indexes: number[]): PageRef[] =>
  indexes.map((index) => pages[index]!.ref);

const CASES: readonly PredictionCase[] = [
  {
    name: 'rotate pages with different turns',
    op: (pages) => ({ type: 'pages.rotate', pages: at(pages, 1, 2), rotation: 180 }),
  },
  {
    name: 'rotate a page to the turn it has',
    op: (pages) => ({ type: 'pages.rotate', pages: at(pages, 0), rotation: pages[0]!.rotation }),
  },
  {
    name: 'move pages after a neighbour, in the order given',
    op: (pages) => ({
      type: 'pages.reorder',
      pages: at(pages, 3, 0),
      position: { after: pages[1]!.ref },
    }),
  },
  {
    name: 'move a page to the start',
    op: (pages) => ({ type: 'pages.reorder', pages: at(pages, 2), position: 'start' }),
  },
  {
    name: 'move a page to the end',
    op: (pages) => ({ type: 'pages.reorder', pages: at(pages, 0), position: 'end' }),
  },
  {
    name: 'move pages before a neighbour',
    op: (pages) => ({
      type: 'pages.reorder',
      pages: at(pages, 2, 3),
      position: { before: pages[0]!.ref },
    }),
  },
  {
    name: 'move a page to where it is',
    op: (pages) => ({
      type: 'pages.reorder',
      pages: at(pages, 1),
      position: { after: pages[0]!.ref },
    }),
  },
  {
    name: 'delete a page in the middle',
    op: (pages) => ({ type: 'pages.delete', pages: at(pages, 1) }),
  },
  {
    name: 'delete pages apart from each other, named out of order',
    op: (pages) => ({ type: 'pages.delete', pages: at(pages, 3, 0) }),
  },
  {
    name: 'delete pages next to each other, the first among them',
    op: (pages) => ({ type: 'pages.delete', pages: at(pages, 0, 1) }),
  },
  {
    name: 'insert blank pages after a neighbour',
    numbers: 2,
    op: (pages, numbers) => ({
      type: 'pages.insertBlank',
      spec: { size: { width: 300, height: 200 }, count: 2 },
      position: { after: pages[1]!.ref },
      objectNumbers: numbers,
    }),
  },
  {
    name: 'insert a blank page at the start',
    numbers: 1,
    op: (_pages, numbers) => ({
      type: 'pages.insertBlank',
      spec: { size: { width: 612, height: 792 } },
      position: 'start',
      objectNumbers: numbers,
    }),
  },
  {
    name: 'insert a blank page with no position (the end)',
    numbers: 1,
    op: (_pages, numbers) => ({
      type: 'pages.insertBlank',
      spec: { size: { width: 841.89, height: 595.28 }, count: 1 },
      objectNumbers: numbers,
    }),
  },
];

/** An op the engine refuses: the prediction leaves the pages as they are. */
const REFUSALS: readonly PredictionCase[] = [
  {
    name: 'rotate a page the document does not have',
    op: () => ({ type: 'pages.rotate', pages: [toPageRef(9_999)], rotation: 90 }),
  },
  {
    name: 'rotate a page named twice',
    op: (pages) => ({ type: 'pages.rotate', pages: at(pages, 0, 0), rotation: 90 }),
  },
  {
    name: 'rotate no pages',
    op: () => ({ type: 'pages.rotate', pages: [], rotation: 90 }),
  },
  {
    name: 'move pages after one of them',
    op: (pages) => ({
      type: 'pages.reorder',
      pages: at(pages, 0, 1),
      position: { after: pages[1]!.ref },
    }),
  },
  {
    name: 'move a page next to a page the document does not have',
    op: (pages) => ({
      type: 'pages.reorder',
      pages: at(pages, 0),
      position: { before: toPageRef(9_999) },
    }),
  },
  {
    name: 'delete every page',
    op: (pages) => ({ type: 'pages.delete', pages: pages.map((page) => page.ref) }),
  },
  {
    name: 'insert a blank page under the number of a page',
    op: (pages) => ({
      type: 'pages.insertBlank',
      spec: { size: { width: 100, height: 100 } },
      objectNumbers: [pages[0]!.ref.objectNumber],
    }),
  },
  {
    name: 'insert two blank pages with one number',
    numbers: 1,
    op: (_pages, numbers) => ({
      type: 'pages.insertBlank',
      spec: { size: { width: 100, height: 100 }, count: 2 },
      objectNumbers: numbers,
    }),
  },
];

/**
 * What undoing `op` shows, from the pages before it and after it: what the
 * page-edit plugin stages as the change's `undo`.
 */
function undoneOf(
  before: readonly PageLayout[],
  after: readonly PageLayout[],
  op: PredictablePageOp,
): readonly PageLayout[] {
  switch (op.type) {
    case 'pages.rotate':
      return rotateBackOf(before, op.pages).reduce<readonly PageLayout[]>(pagesAfter, after);
    case 'pages.reorder':
      return reorderBackOf(before, op.pages).reduce<readonly PageLayout[]>(pagesAfter, after);
    case 'pages.delete':
      return pagesAfterRestore(after, restoredPagesOf(before, op.pages));
    case 'pages.insertBlank':
      return pagesAfter(after, {
        type: 'pages.delete',
        pages: (op.objectNumbers ?? []).map(toPageRef),
      });
  }
}

export function runPagePredictionConformance(
  runner: ConformanceTestRunner,
  opts: PagePredictionConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`page prediction conformance: ${opts.label}`, () => {
    let engine: Engine;
    let doc: DocumentHandle;

    beforeAll(async () => {
      engine = await opts.makeEngine();
      doc = await opts.open(engine);
    });

    afterAll(async () => {
      if (doc) await doc.close();
      if (engine) await engine.destroy();
    });

    const read = async (): Promise<readonly PageLayout[]> => (await doc.pages.list()).pages;
    const take = async (count: number): Promise<number[]> => {
      if (count === 0) return [];
      await doc.objectNumbers.reserve(count);
      return Array.from({ length: count }, () => doc.objectNumbers.take()!);
    };

    for (const scenario of CASES) {
      test(scenario.name, async () => {
        const before = await read();
        const op = scenario.op(before, await take(scenario.numbers ?? 0));

        const predicted = pagesAfter(before, op);
        const applied = await doc.apply({ ops: [op] });
        const after = await read();
        expect(differences(predicted, after)).toEqual([]);

        // What the history shows for an undo and a redo of it, until the engine answers.
        const undone = undoneOf(before, after, op);
        const undo = await doc.apply({ undoOf: applied.meta.opId });
        const afterUndo = await read();
        expect(differences(undone, afterUndo)).toEqual([]);

        const redone = pagesAfter(afterUndo, op);
        const redo = await doc.apply({ undoOf: undo.meta.opId });
        expect(differences(redone, await read())).toEqual([]);

        // The next case starts from the pages this one started from.
        await doc.apply({ undoOf: redo.meta.opId });
      });
    }

    for (const scenario of REFUSALS) {
      test(`refused: ${scenario.name}`, async () => {
        const before = await read();
        const op = scenario.op(before, await take(scenario.numbers ?? 0));
        expect(pagesAfter(before, op)).toBe(before);
        const outcome = await doc.apply({ ops: [op] }).then(
          () => 'applied',
          () => 'refused',
        );
        expect(outcome).toBe('refused');
        expect(differences(before, await read())).toEqual([]);
      });
    }
  });
}

/** Where the prediction and the read differ, by path; numbers within a thousandth of a point. */
function differences(
  predicted: readonly PageLayout[],
  actual: readonly PageLayout[],
): { path: string; predicted: unknown; actual: unknown }[] {
  const found: { path: string; predicted: unknown; actual: unknown }[] = [];
  const walk = (left: unknown, right: unknown, path: string): void => {
    if (typeof left === 'number' && typeof right === 'number') {
      if (Math.abs(left - right) > 1e-3) found.push({ path, predicted: left, actual: right });
      return;
    }
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
      if (left !== right) found.push({ path, predicted: left, actual: right });
      return;
    }
    if (Array.isArray(left) !== Array.isArray(right)) {
      found.push({ path, predicted: left, actual: right });
      return;
    }
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      walk(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
    }
  };
  walk(predicted, actual, '');
  return found;
}
