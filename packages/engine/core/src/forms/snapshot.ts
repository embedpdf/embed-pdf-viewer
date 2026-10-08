import type { FormFieldDTO } from './field';
import type { WidgetAnnotation } from '../annotation/kinds/widget';
import type { FormFieldRef } from '../identity/FormFieldRef';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * What kind of interactive form the document declares.
 *
 * - `none` — no /AcroForm dictionary. Recovered fields may still exist
 *   (see {@link FormFieldOrigin}); `repair()` can bootstrap the dictionary.
 * - `acroform` — a standard AcroForm.
 * - `xfa` — the /AcroForm carries an /XFA entry. The engine serves the
 *   AcroForm shell read-only and never executes XFA.
 */
export type FormKind = 'none' | 'acroform' | 'xfa';

/**
 * The document's complete form state at one instant: the reconciled field
 * tree flattened to terminal fields with fully qualified names, and every
 * widget with its place, look and state.
 *
 * A form field's widgets come with the form, never with the annotations:
 * `doc.annotations.list()` holds every annotation except widgets.
 *
 * Snapshots are detached and immutable — any mutation (a value write, an
 * annotation edit, a page operation) makes previously returned snapshots
 * stale. Re-read after mutating; the engine caches the underlying model
 * per document version, so repeated reads between mutations are cheap.
 */
export interface FormSnapshot<C extends Coordinates = PageCoordinates> {
  formKind: FormKind;
  /**
   * Whether the /AcroForm sets /NeedAppearances (viewer-generated widget
   * appearances). The engine bakes appearances on every write regardless;
   * `repair({ bakeAppearances: true })` can clear the flag document-wide.
   */
  needsAppearances: boolean;
  fields: FormFieldDTO<C>[];
  /**
   * Every widget the document's pages show, in page order and `/Annots`
   * order within a page: the annotation rows of the form, each with its
   * `field`. A widget that belongs to no field (no field type anywhere on its
   * `/Parent` chain) is here with `field: null`, never fillable. Join a
   * field's widgets to their rows by `ref`.
   */
  widgets: WidgetAnnotation<C>[];
  /** `/AcroForm /CO` order; null preserves each malformed/unresolved slot. */
  calculationOrder: Array<FormFieldRef | null>;
}
