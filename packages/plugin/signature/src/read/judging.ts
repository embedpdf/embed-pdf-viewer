/**
 * The judging verbs: re-reading the facts, validating, and the byte-level
 * questions a verdict rests on (what changed after a signature, the exact
 * revision it covers).
 */
import { PluginError, type Mirror } from '@embedpdf/core';
import type { AnalyzeInput } from '@embedpdf/engine-core/runtime';

import type { SignatureCapability, SignatureFieldAddress } from '../contract';
import type { SignatureRecord } from '../model';
import type { SignatureServices } from '../services';
import { verb } from '../services/errors';
import type { SignatureValidation, ValidateOptions } from '../sync/validation';
import type { SignatureReads } from './signatures';

export function createJudging(
  { store }: Pick<SignatureServices, 'store'>,
  { validate }: Pick<SignatureValidation, 'validate'>,
  signatures: Mirror<SignatureRecord>,
  { getSignature, getVerdict }: Pick<SignatureReads, 'getSignature' | 'getVerdict'>,
) {
  const { requireSignatures } = store;

  return {
    api: {
      refresh: verb(async () => {
        await signatures.refresh();
        return signatures.get().snapshot;
      }),
      validate: verb(validate),
      validateField: verb(async (field: SignatureFieldAddress, options?: ValidateOptions) => {
        await validate(options);
        const verdict = getVerdict(field);
        if (!verdict) {
          throw new PluginError('not-found', 'signature', 'no signed field at that address');
        }
        return verdict;
      }),
      analyzeChanges: verb(async (input: AnalyzeInput) => requireSignatures().analyze(input)),
      readRevision: verb(async (target: SignatureFieldAddress | { revisionIndex: number }) => {
        const service = requireSignatures();
        if ('revisionIndex' in target) return service.downloadRevision(target.revisionIndex);
        const signature = getSignature(target);
        if (!signature?.signed || signature.revisionIndex === null) {
          throw new PluginError('not-found', 'signature', 'no signed revision at that address');
        }
        return service.downloadRevision(signature.revisionIndex);
      }),
    } satisfies Partial<SignatureCapability>,
  };
}
