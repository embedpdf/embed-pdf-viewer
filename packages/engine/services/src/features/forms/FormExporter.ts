import {
  assertWithinLimit,
  formExportRowsOf,
  manifestBytesOf,
  pageFormSnapshotOf,
  toPageRef,
  type BundleLimits,
  type FormExportSelection,
  type WireFormBundle,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { FormReader } from './FormReader';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import type { FontRegistrar } from '../fonts/FontRegistrar';
import { visibleBoxReader } from '../pages/PagesReader';
import { bundlePagesOf } from '../transfer/bundlePages';

/**
 * `doc.forms.export`: the fields a selection takes, each whole with all of
 * its widgets, as one bundle in page space (see `formExportRowsOf`). It
 * reads the form as `list()` does and writes nothing. A widget is drawn
 * from its data, so the bundle holds no resources. It is checked against
 * `limits` as it is built, so an export never makes one an import refuses.
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
    const rows = {
      pages: bundlePagesOf(this.runtime, this.session, widgets),
      fields: fields.map((data) => ({ data })),
      widgets: widgets.map((data) => ({ data, resources: {} })),
      calculationOrder,
    };
    assertWithinLimit('form', limits, 'pages', rows.pages.length);
    const manifestBytes = manifestBytesOf(rows);
    assertWithinLimit('form', limits, 'manifestBytes', manifestBytes);
    assertWithinLimit('form', limits, 'bundleBytes', manifestBytes);
    return { format: 'embedpdf/form', version: 1, ...rows, resources: {} };
  }
}
