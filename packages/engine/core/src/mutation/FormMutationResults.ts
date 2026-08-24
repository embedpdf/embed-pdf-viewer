import type { FormFieldDTO } from '../forms/field';
import type { FormSnapshot } from '../forms/snapshot';
import type { FormWidgetRef } from '../identity/FormFieldRef';
import type { MutationMeta } from './MutationMeta';

/**
 * Result of a value write (`setValue` / `reset`).
 *
 * `changedWidgets` lists every widget annotation whose appearance changed —
 * a field's widgets can live on several pages, so use it to invalidate
 * page renders and annotation appearance caches. Idempotent writes (same
 * value again) succeed with an empty list.
 */
export interface FormSetValueResult {
  /** The field read back after the write. */
  field: FormFieldDTO;
  changedWidgets: FormWidgetRef[];
  meta: MutationMeta;
}

/**
 * Result of applying an FDF/XFDF payload. Import is per-field: one bad
 * entry (unknown name, family mismatch, failed validation) is counted in
 * `fieldsSkipped` and never poisons the rest.
 */
export interface FormImportResult {
  fieldsTotal: number;
  fieldsApplied: number;
  fieldsSkipped: number;
  /** Total widgets whose appearance changed across all applied fields. */
  widgetsChanged: number;
  /** The complete form state after the import — no second round trip. */
  snapshot: FormSnapshot;
  meta: MutationMeta;
}

/** Serialized form data produced by `exportData`. */
export interface FormDataExport {
  format: 'fdf' | 'xfdf';
  bytes: Uint8Array;
}

/** Result of `createField`: the field read back, widgets included. */
export interface FormFieldCreateResult {
  field: FormFieldDTO;
  meta: MutationMeta;
}

/** Result of `updateField`. */
export interface FormFieldUpdateResult {
  field: FormFieldDTO;
  meta: MutationMeta;
}

/**
 * Result of `deleteField`. The field's widgets are deleted from their
 * pages as part of the cascade; they are reported so annotation caches
 * can invalidate.
 */
export interface FormFieldDeleteResult {
  deletedFieldObjectNumber: number;
  removedWidgets: FormWidgetRef[];
  meta: MutationMeta;
}

/** Result of `attachWidget` / `detachWidget`: the field read back. */
export interface FormWidgetLinkResult {
  field: FormFieldDTO;
  meta: MutationMeta;
}

/**
 * Result of a repair pass. Repair is validate-then-apply and idempotent:
 * when there is nothing to fix, every counter is zero and the document is
 * untouched.
 */
export interface FormRepairResult {
  /** A missing /AcroForm dictionary was created (with /DR and /DA). */
  acroformCreated: boolean;
  /** Recovered field roots appended to /AcroForm /Fields. */
  fieldsLinked: number;
  /** Stray widgets appended to their parent field's /Kids. */
  widgetsLinked: number;
  /** Direct-object fields that cannot be referenced and stay recovered. */
  fieldsUnrepairable: number;
  /** Widgets whose appearance stream was (re)generated. */
  appearancesBaked: number;
  /** /NeedAppearances was cleared after re-baking. */
  needAppearancesCleared: boolean;
  meta: MutationMeta;
}
