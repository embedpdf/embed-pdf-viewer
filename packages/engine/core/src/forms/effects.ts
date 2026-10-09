import type { SerializedEngineError } from '../errors/EngineError';
import type { FormFieldRef, FormWidget } from '../identity/FormFieldRef';
import type { FormMutationMeta, FormWidgetRows } from '../mutation/FormMutationResults';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';
import type { FormFieldDTO } from './field';
import type { FormFieldValue } from './value';

export type FormFieldDisplay = 'visible' | 'hidden' | 'noPrint' | 'noView';

/** Ordered, committed outputs of one client-side form script run. */
export type FormEffect =
  | { kind: 'setValue'; ref: FormFieldRef; value: FormFieldValue }
  | { kind: 'setDisplay'; ref: FormFieldRef; display: FormFieldDisplay }
  | { kind: 'setAppearanceText'; ref: FormFieldRef; text: string }
  | { kind: 'reset'; refs: FormFieldRef[] };

export type FormEffectStatus = 'applied' | 'unchanged' | 'rejected' | 'failed' | 'skipped';

export interface FormEffectResult<C extends Coordinates = PageCoordinates> {
  index: number;
  status: FormEffectStatus;
  /** Re-read terminal fields affected by this effect, when available. */
  fields: FormFieldDTO<C>[];
  changedWidgets: FormWidget[];
  error?: SerializedEngineError;
}

/**
 * Result of an ordered, non-rollback-atomic effects batch: one result per
 * effect, `meta` naming every field written and widget changed across the
 * batch, and `widgets`, those widgets' rows read back. A batch where nothing
 * was applied (and no native call had an outcome-indeterminate failure)
 * changes nothing: no artifact, event, or version bump, and `meta` lists
 * nothing.
 */
export interface FormEffectsResult<
  C extends Coordinates = PageCoordinates,
> extends FormWidgetRows<C> {
  results: FormEffectResult<C>[];
  meta: FormMutationMeta;
}
