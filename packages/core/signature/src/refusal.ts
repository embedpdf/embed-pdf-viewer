import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';

import type { CompletionRefusal } from './gate';

/**
 * A signature that isn't written because what a key or a timestamp authority returned doesn't
 * hold up: `SignatureRefused`, with the reason in `details.reason`.
 */
export function signingRefused(reason: CompletionRefusal, detail: string): EngineError {
  return new EngineError(
    EngineErrorCode.SignatureRefused,
    `signing refused (${reason}): ${detail}`,
    { details: { reason } },
  );
}
