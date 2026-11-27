import {
  annotationKey,
  assertWithinLimit,
  formExportRowsOf,
  manifestBytesOf,
  pageFormSnapshotOf,
  toPageRef,
  type BundleLimits,
  type FormExportSelection,
  type ResourceId,
  type WidgetAnnotation,
  type WireFormBundle,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { FormReader } from './FormReader';
import { readWidgetIcon } from './internal/buttonImage';
import { appearanceBytesOf } from '../annotations/internal/read/annotationResourceBytes';
import { openAnnotRaw } from '../annotations/internal/identity/resolveAnnotIndexRaw';
import { BundleResources } from '../transfer/BundleResources';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import type { FontRegistrar } from '../fonts/FontRegistrar';
import { visibleBoxReader } from '../pages/PagesReader';
import { bundlePagesOf } from '../transfer/bundlePages';

/**
 * `doc.forms.export`: the fields a selection takes, each whole with all of
 * its widgets, as one bundle in page space (see `formExportRowsOf`). It
 * reads the form as `list()` does and writes nothing. A widget is drawn
 * from its data, so its only resource is a push button's image: the
 * drawing its icon names, as a one-page PDF (`image`), once however many
 * widgets show it, and none for a field the form doesn't export. It is
 * checked against `limits` as it is built, so an export never makes one an
 * import refuses.
 */
export class FormExporter {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    /** This thread's font registry, for the widget rows. */
    private readonly fonts?: FontRegistrar,
  ) {}

  export(
    selection: FormExportSelection,
    limits: BundleLimits,
    signal: AbortSignal,
  ): WireFormBundle {
    throwIfAborted(signal);
    const form = new FormReader(this.runtime, this.session, this.fonts).snapshot(signal);
    const snapshot = pageFormSnapshotOf(form, visibleBoxReader(this.runtime, this.session));
    const { fields, widgets, calculationOrder } = formExportRowsOf(
      snapshot,
      selection,
      this.session.allRecords().map((record) => toPageRef(record.pageObjectNumber)),
    );
    assertWithinLimit('form', limits, 'items', fields.length + widgets.length);
    const images = new ButtonImageCollector(this.runtime, this.session, limits);
    // A widget's picture goes with its field's: none for a field the export
    // takes without one, as one the form doesn't export.
    const withoutPicture = new Set(
      fields.flatMap((field) =>
        field.kind === 'pushbutton' && !field.hasImage
          ? field.widgets.flatMap((widget) => (widget.ref ? [annotationKey(widget.ref)] : []))
          : [],
      ),
    );
    const rows = {
      pages: bundlePagesOf(this.runtime, this.session, widgets),
      fields: fields.map((data) => ({ data })),
      widgets: widgets.map((data) => ({
        data,
        resources: withoutPicture.has(annotationKey(data.ref)) ? {} : images.of(data),
      })),
      calculationOrder,
    };
    assertWithinLimit('form', limits, 'pages', rows.pages.length);
    const manifestBytes = manifestBytesOf(rows);
    assertWithinLimit('form', limits, 'manifestBytes', manifestBytes);
    assertWithinLimit('form', limits, 'bundleBytes', manifestBytes + images.totalBytes);
    return { format: 'embedpdf/form', version: 1, ...rows, resources: images.byId };
  }
}

/** The images an export's push buttons show: each drawing once, as a one-page PDF. */
class ButtonImageCollector extends BundleResources {
  /** The id each drawing (by object number) was exported under. */
  private readonly drawings = new Map<number, ResourceId>();

  constructor(
    runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    limits: BundleLimits,
  ) {
    super(runtime, 'form', limits);
  }

  /** The resources a widget row names: `{ image }` for a push button's that shows one. */
  of(row: Pick<WidgetAnnotation, 'fieldKind' | 'ref'>): Record<string, ResourceId> {
    if (row.fieldKind !== 'pushbutton') return {};
    const drawing = readWidgetIcon(this.runtime, this.session, row.ref);
    if (drawing === 0) return {};
    const known = this.drawings.get(drawing);
    if (known) return { image: known };
    const annotPtr = openAnnotRaw(this.runtime, this.session, row.ref);
    let bytes: ArrayBuffer | null;
    try {
      bytes = appearanceBytesOf(this.runtime, this.session.requireDocPtr(), annotPtr, drawing);
    } finally {
      this.runtime.fn.FPDFPage_CloseAnnot(annotPtr);
    }
    if (!bytes) return {};
    const id = this.keep(bytes);
    this.drawings.set(drawing, id);
    return { image: id };
  }
}
