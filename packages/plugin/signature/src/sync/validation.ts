/**
 * Judging the signatures. The viewer judges the working copy by default
 * (unsaved edits count), so the verdict is the one the file a save produces
 * will get. Verdicts are session state: each validation commits its own, and
 * `onValidated` fires where one completes. Re-judging after an edit waits
 * for a pause: a pen stroke is many events, one analysis.
 */
import {
  validateSignatures,
  type SignatureVerdict,
  type ValidationTime,
} from '@embedpdf/core-signature';

import type { SignatureConfig } from '../contract';
import { setVerdicts } from '../model';
import type { SignatureContext, SignatureServices } from '../services';

const REVALIDATE_DELAY_MS = 300;

export interface ValidateOptions {
  readonly at?: ValidationTime;
  readonly until?: 'persisted' | 'working-copy';
}

export function createValidation(
  ctx: SignatureContext,
  { events }: Pick<SignatureServices, 'events'>,
  config: SignatureConfig,
) {
  const { validated } = events;

  const validate = async (options?: ValidateOptions): Promise<readonly SignatureVerdict[]> => {
    if (!ctx.doc.signatures) return [];
    const verdicts = await validateSignatures(ctx.doc, {
      trust: config.trust ?? null,
      at: options?.at,
      until: options?.until ?? 'working-copy',
    });
    ctx.state.update(setVerdicts, verdicts);
    validated.emit({ verdicts });
    return verdicts;
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancelScheduled = (): void => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };
  const validateInBackground = (): void => {
    void validate().catch((error) =>
      globalThis.console?.error('[signature] validation failed:', error),
    );
  };
  ctx.cleanup(cancelScheduled);

  return {
    validate,
    /** Judge now; a scheduled re-judgement is superseded. */
    validateNow: (): void => {
      cancelScheduled();
      validateInBackground();
    },
    /** Judge once the edits pause. */
    revalidateSoon: (): void => {
      cancelScheduled();
      timer = setTimeout(() => {
        timer = null;
        validateInBackground();
      }, REVALIDATE_DELAY_MS);
    },
  };
}
export type SignatureValidation = ReturnType<typeof createValidation>;
