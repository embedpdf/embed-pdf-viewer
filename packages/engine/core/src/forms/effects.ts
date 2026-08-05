import type { SerializedEngineError } from '../errors/EngineError';
import type { FormFieldRef, FormWidgetRef } from '../identity/FormFieldRef';
import type { MutationMeta } from '../mutation/MutationMeta';
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

export interface FormEffectResult {
  index: number;
  status: FormEffectStatus;
  /** Re-read terminal fields affected by this effect, when available. */
  fields: FormFieldDTO[];
  changedWidgets: FormWidgetRef[];
  error?: SerializedEngineError;
}

/**
 * Result of an ordered, non-rollback-atomic effects batch.
 *
 * `meta` is null only when nothing was applied and no native call had an
 * outcome-indeterminate failure. Such all-no-op/all-preflight-rejected
 * batches produce no artifact, event, or version bump.
 */
export interface FormEffectsResult {
  results: FormEffectResult[];
  changedWidgets: FormWidgetRef[];
  meta: MutationMeta | null;
}
