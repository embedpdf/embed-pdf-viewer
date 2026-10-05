/**
 * Judging the signatures. The viewer judges the working copy by default
 * (unsaved edits count), so the verdict is the one the file a save produces
 * will get. Verdicts are session state: each validation commits its own, and
 * `onValidated` fires where one completes. Re-judging after an edit waits
 * for a pause: a pen stroke is many events, one analysis.
 */
import { validateSignatures, type SignatureVerdict } from '@embedpdf/core-signature';

import type { SignatureValidateOptions } from '../contract';
import { setVerdicts } from '../model';
import type { SignatureContext, SignatureServices } from '../services';

const REVALIDATE_DELAY_MS = 300;

export function createValidation(
  ctx: SignatureContext,
  { events }: Pick<SignatureServices, 'events'>,
) {
  const { validated } = events;
  const settings = ctx.settings();

  const validate = async (
    options?: SignatureValidateOptions,
  ): Promise<readonly SignatureVerdict[]> => {
    if (!ctx.doc.signatures) return [];
    const verdicts = await ctx.cancellable(
      options?.signal,
      validateSignatures(ctx.doc, {
        trust: settings.get().trust,
        at: options?.at,
        until: options?.until ?? 'working-copy',
      }),
    );
    ctx.state.update(setVerdicts, verdicts);
    validated.emit({ verdicts });
    return verdicts;
  };

  let cancelRevalidate: (() => void) | null = null;
  const cancelScheduled = (): void => {
    cancelRevalidate?.();
    cancelRevalidate = null;
  };
  const validateInBackground = (): void => {
    void validate().catch((error) =>
      globalThis.console?.error('[signature] validation failed:', error),
    );
  };

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
      cancelRevalidate = ctx.clock.after(REVALIDATE_DELAY_MS, () => {
        cancelRevalidate = null;
        validateInBackground();
      });
    },
  };
}
export type SignatureValidation = ReturnType<typeof createValidation>;
