import type { FormFieldDTO } from './field';
import type { FormFieldRef } from '../identity/FormFieldRef';

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
 * tree flattened to terminal fields with fully qualified names.
 *
 * Snapshots are detached and immutable — any mutation (a value write, an
 * annotation edit, a page operation) makes previously returned snapshots
 * stale. Re-read after mutating; the engine caches the underlying model
 * per document version, so repeated reads between mutations are cheap.
 */
export interface FormSnapshot {
  formKind: FormKind;
  /**
   * Whether the /AcroForm sets /NeedAppearances (viewer-generated widget
   * appearances). The engine bakes appearances on every write regardless;
   * `repair({ bakeAppearances: true })` can clear the flag document-wide.
   */
  needsAppearances: boolean;
  fields: FormFieldDTO[];
  /** `/AcroForm /CO` order; null preserves each malformed/unresolved slot. */
  calculationOrder: Array<FormFieldRef | null>;
}
