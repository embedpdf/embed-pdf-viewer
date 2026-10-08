import { pdfOf } from './pdfOf';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { annotationKey } from '../identity/annotationKey';
import { toPageRef, type PageRef } from '../identity/PageRef';

/**
 * Where the form finds a widget, in files that store it the awkward ways real
 * PDFs do. A page's `/Annots` decides where a widget is shown; the field tree
 * and a widget's `/P` don't. The subtype decides the family: a widget is the
 * form's, listed with `field: null` when no field claims it.
 *
 * Every case gives the same answer in the form read (`forms.list()`), the
 * annotation read (which never holds a widget) and the pictures (each
 * family's appearances).
 */

const FONT_RESOURCES =
  '/DR << /Font << /Helv << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>';
const PAGE = '/Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << >>';
const WIDGET = '/Type /Annot /Subtype /Widget /Rect [20 20 120 40]';
const LOOK =
  '<< /Type /XObject /Subtype /Form /BBox [0 0 100 20] /Length 26 >>\nstream\n0 0 1 rg 0 0 100 20 re f\nendstream';

export interface WidgetFindingCase {
  /** What the file does. */
  readonly does: string;
  readonly pdf: Uint8Array;
  /** The page whose `/Annots` holds the widget, or `null` when no page shows it. */
  readonly page: number | null;
  /** The name of the field the form reads the widget into, or `null` for a widget in no field. */
  readonly field: string | null;
}

/** The cases, by name. Object 3 is the first page in each. */
export const WIDGET_FINDING_CASES = {
  'annots-only': {
    does: "a merged field/widget in a page's /Annots that the field tree doesn't list",
    pdf: pdfOf([
      `<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [] /DA (/Helv 0 Tf 0 g) ${FONT_RESOURCES} >> >>`,
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< ${PAGE} /Annots [4 0 R] >>`,
      `<< ${WIDGET} /FT /Tx /T (orphan) /V (hi) /P 3 0 R /AP << /N 5 0 R >> >>`,
      LOOK,
    ]),
    page: 3,
    field: 'orphan',
  },
  inline: {
    does: "a widget written straight into a page's /Annots, as no object of its own",
    pdf: pdfOf([
      `<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [] /DA (/Helv 0 Tf 0 g) ${FONT_RESOURCES} >> >>`,
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< ${PAGE} /Annots [<< ${WIDGET} /FT /Tx /T (inline) /AP << /N 4 0 R >> >>] >>`,
      LOOK,
    ]),
    page: 3,
    field: null,
  },
  'no-acroform': {
    does: 'a field widget in a file that has no /AcroForm at all',
    pdf: pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< ${PAGE} /Annots [4 0 R] >>`,
      `<< ${WIDGET} /FT /Tx /T (lonely) /P 3 0 R /AP << /N 5 0 R >> >>`,
      LOOK,
    ]),
    page: 3,
    field: 'lonely',
  },
  'stale-p': {
    does: "a widget in the second page's /Annots whose /P names the first page",
    pdf: pdfOf([
      `<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [5 0 R] /DA (/Helv 0 Tf 0 g) ${FONT_RESOURCES} >> >>`,
      '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
      `<< ${PAGE} >>`,
      `<< ${PAGE} /Annots [5 0 R] >>`,
      `<< ${WIDGET} /FT /Tx /T (moved) /P 3 0 R /AP << /N 6 0 R >> >>`,
      LOOK,
    ]),
    page: 4,
    field: 'moved',
  },
  'deleted-page': {
    does: 'a field whose widget was on a page the document no longer has',
    pdf: pdfOf([
      `<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R] /DA (/Helv 0 Tf 0 g) ${FONT_RESOURCES} >> >>`,
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< ${PAGE} >>`,
      '<< /FT /Tx /T (gone) /Kids [5 0 R] >>',
      `<< ${WIDGET} /Parent 4 0 R /P 6 0 R /AP << /N 7 0 R >> >>`,
      `<< ${PAGE} /Annots [5 0 R] >>`,
      LOOK,
    ]),
    page: null,
    field: 'gone',
  },
  'no-field-type': {
    does: 'a widget with no field type anywhere on its /Parent chain',
    pdf: pdfOf([
      `<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [] /DA (/Helv 0 Tf 0 g) ${FONT_RESOURCES} >> >>`,
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< ${PAGE} /Annots [4 0 R] >>`,
      `<< ${WIDGET} /P 3 0 R /AP << /N 5 0 R >> >>`,
      LOOK,
    ]),
    page: 3,
    field: null,
  },
} as const satisfies Record<string, WidgetFindingCase>;

export type WidgetFindingCaseName = keyof typeof WIDGET_FINDING_CASES;

export interface WidgetFindingConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open `pdf` with every right, as a document of its own. */
  open: (engine: Engine, pdf: Uint8Array, name: WidgetFindingCaseName) => Promise<DocumentHandle>;
}

export function runWidgetFindingConformance(
  runner: ConformanceTestRunner,
  opts: WidgetFindingConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`widget finding conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    for (const [name, found] of Object.entries(WIDGET_FINDING_CASES) as [
      WidgetFindingCaseName,
      WidgetFindingCase,
    ][]) {
      test(`${name}: ${found.does}`, async () => {
        const doc = await opts.open(engine, found.pdf.slice(), name);
        try {
          const { pages } = await doc.pages.list();
          const form = await doc.forms.list();
          const rows = form.widgets;

          // The form read: one row, on the page whose /Annots holds it.
          if (found.page === null) {
            expect(rows).toEqual([]);
          } else {
            expect(rows.map((row) => row.page.objectNumber)).toEqual([found.page]);
          }
          const field =
            found.field === null ? undefined : form.fields.find((f) => f.name === found.field);
          if (found.field !== null) {
            expect(field?.name).toBe(found.field);
            expect(field?.widgets.map((w) => w.page?.objectNumber ?? null)).toEqual([found.page]);
          }
          for (const row of rows) {
            expect(row.field === null).toBe(found.field === null);
          }

          // The annotation read never holds a widget, on any page.
          for (const { ref } of pages) {
            const { annotations } = await doc.page(ref).annotations.list();
            expect(annotations.some((annotation) => annotation.subtype === 'widget')).toBe(false);
          }

          // The pictures: the widget's appearance is the form's, on its page, and only there.
          const shown = (page: PageRef) => doc.page(page).forms.renderAppearances();
          for (const { ref } of pages) {
            const forms = (await shown(ref)).appearances.map((a) => annotationKey(a.ref));
            const annotations = (await doc.page(ref).annotations.renderAppearances()).appearances;
            expect(annotations).toEqual([]);
            const here = ref.objectNumber === found.page;
            expect(forms).toEqual(here ? rows.map((row) => annotationKey(row.ref)) : []);
          }
          if (found.page !== null) {
            expect(pages.some((page) => page.ref.objectNumber === found.page)).toBe(true);
            expect(toPageRef(found.page)).toEqual(rows[0]!.page);
          }
        } finally {
          await doc.close();
        }
      });
    }
  });
}
