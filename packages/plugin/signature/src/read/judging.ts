/**
 * The judging verbs: re-reading the facts, validating, and the byte-level
 * questions a verdict rests on (what changed after a signature, the exact
 * revision it covers).
 */
import { PluginError, type Mirror, type OperationOptions } from '@embedpdf/core';
import type { AnalyzeInput } from '@embedpdf/engine-core/runtime';

import type {
  SignatureCapability,
  SignatureFieldAddress,
  SignatureValidateOptions,
} from '../contract';
import type { SignatureRecord } from '../model';
import type { SignatureContext, SignatureServices } from '../services';
import { verb } from '../services/errors';
import type { SignatureValidation } from '../sync/validation';
import type { SignatureReads } from './signatures';

export function createJudging(
  ctx: SignatureContext,
  { store }: Pick<SignatureServices, 'store'>,
  { validate }: Pick<SignatureValidation, 'validate'>,
  signatures: Mirror<SignatureRecord>,
  { getSignature, getVerdict }: Pick<SignatureReads, 'getSignature' | 'getVerdict'>,
) {
  const { requireSignatures } = store;

  return {
    api: {
      refresh: verb(async (options?: OperationOptions) => {
        await ctx.cancellable(options?.signal, signatures.refresh());
        return signatures.get().snapshot;
      }),
      validate: verb(validate),
      validateField: verb(async (field: SignatureFieldAddress, options?: SignatureValidateOptions) => {
        await validate(options);
        const verdict = getVerdict(field);
        if (!verdict) {
          throw new PluginError('not-found', 'signature', 'no signed field at that address');
        }
        return verdict;
      }),
      analyzeChanges: verb(async (input: AnalyzeInput, options?: OperationOptions) =>
        ctx.cancellable(options?.signal, requireSignatures().analyze(input)),
      ),
      readRevision: verb(
        async (
          target: SignatureFieldAddress | { revisionIndex: number },
          options?: OperationOptions,
        ) => {
          ctx.assertAllowed('doc.download', 'signature.readRevision');
          const service = requireSignatures();
          let revisionIndex: number;
          if ('revisionIndex' in target) {
            revisionIndex = target.revisionIndex;
          } else {
            const signature = getSignature(target);
            if (!signature?.signed || signature.revisionIndex === null) {
              throw new PluginError('not-found', 'signature', 'no signed revision at that address');
            }
            revisionIndex = signature.revisionIndex;
          }
          return ctx.cancellable(options?.signal, service.downloadRevision(revisionIndex));
        },
      ),
    } satisfies Partial<SignatureCapability>,
  };
}
