/**
 * Keeping a signature checkable with no network: the validation data the `revocation` setting
 * asks for, and the document timestamp after it. One routine serves two doors.
 * `addValidationInfo()` rejects when a signature can't be covered. The follow-up to a seal
 * never does: the signature is already in the document, so its result carries the failure.
 */
import { PluginError, toPluginError, type OperationOptions } from '@embedpdf/core';
import type { FormFieldRef, SignatureCompleteResult } from '@embedpdf/engine-core/runtime';

import type {
  SignatureCapability,
  SignatureFieldAddress,
  SignFieldResult,
  ValidationInfoAdded,
} from '../contract';
import { sameFieldRef } from '../model';
import type { SignatureReads } from '../read/signatures';
import type { SignatureContext, SignatureServices } from '../services';
import { verb } from '../services/errors';
import type { SignatureValidation } from '../sync/validation';

export function createValidationInfo(
  ctx: SignatureContext,
  { store, authority }: Pick<SignatureServices, 'store' | 'authority'>,
  { findSignature }: Pick<SignatureReads, 'findSignature'>,
  { validateNow }: Pick<SignatureValidation, 'validateNow'>,
) {
  const settings = ctx.settings();
  const { withBusy } = store;
  const { timestampTrust } = authority;

  /** The settings both steps need, or the reason nothing can be added. */
  const requireSettings = () => {
    ctx.assertAllowed('doc.sign', 'signature.addValidationInfo');
    const { revocation, trust, documentTimestamp, timestampAuthority } = settings.get();
    if (!revocation || !trust) {
      throw new PluginError(
        'invalid-input',
        'signature',
        'adding validation data needs the `revocation` and `trust` settings',
      );
    }
    if (documentTimestamp && !timestampAuthority) {
      throw new PluginError(
        'invalid-input',
        'signature',
        'the `documentTimestamp` setting needs the `timestampAuthority` setting',
      );
    }
    return { revocation, trust, stampWith: documentTimestamp ? timestampAuthority : null };
  };

  /**
   * The two steps, in order: ask for the answers `fields` lack (every signature's without
   * `fields`) and store them, then timestamp the document when that is set and the answers
   * aren't covered by a timestamp. `stored` hears of the first step when it is done, so a
   * caller knows what is in the file when the second one fails.
   */
  const add = async (
    fields: readonly FormFieldRef[] | undefined,
    signal: AbortSignal | undefined,
    stored?: (added: ValidationInfoAdded) => void,
  ): Promise<ValidationInfoAdded> => {
    const { revocation, trust, stampWith } = requireSettings();
    // The cryptography loads the first time it is needed.
    const core = await ctx.cancellable(signal, import('@embedpdf/core-signature'));
    const { added, verdicts } = await ctx.cancellable(
      signal,
      core.addValidationInfo(ctx.doc, { trust, revocation, ...(fields ? { fields } : {}) }),
    );
    stored?.({ added, documentTimestamp: null });
    if (!stampWith) return { added, documentTimestamp: null };

    // The signatures the answers are for: each one named, or every one that isn't itself a
    // document timestamp.
    const covered = verdicts.filter(({ signature }) =>
      fields
        ? fields.some((field) =>
            field.kind === 'fqn'
              ? signature.fieldName === field.name
              : sameFieldRef(signature.field, field),
          )
        : signature.kind === 'signature',
    );
    // New answers have no timestamp over them yet, and neither has a signature that never had
    // one. Otherwise the last timestamp still covers everything, and another proves no more.
    const uncovered =
      added.certificates + added.ocspResponses + added.crls > 0 ||
      covered.some((verdict) => verdict.longTerm.documentTimestampedAt === null);
    if (!uncovered) return { added, documentTimestamp: null };
    const result = await ctx.cancellable(
      signal,
      core.sign(ctx.doc, { kind: 'timestamp', key: stampWith, timestampTrust: timestampTrust() }),
    );
    return { added, documentTimestamp: result.signature.field };
  };

  const addValidationInfo = async (
    field?: SignatureFieldAddress,
    options?: OperationOptions,
  ): Promise<ValidationInfoAdded> => {
    let fields: FormFieldRef[] | undefined;
    if (field) {
      const signature = findSignature(field);
      if (!signature?.signed) {
        throw new PluginError('not-found', 'signature', 'no signed field at that address');
      }
      fields = [signature.field];
    }
    return withBusy(async () => {
      try {
        return await add(fields, options?.signal);
      } finally {
        // Whatever was stored changes what the verdicts say: read them again at once.
        validateNow();
      }
    });
  };

  /**
   * What follows a seal: the validation data for the signature just made, when the settings
   * ask for it and the session may add it. It never rejects.
   */
  const afterSeal = async (
    result: SignatureCompleteResult,
    signal: AbortSignal | undefined,
  ): Promise<SignFieldResult> => {
    if (!settings.get().revocation || !ctx.allows('doc.sign')) {
      return { ...result, validationInfo: null, validationInfoError: null };
    }
    let validationInfo: ValidationInfoAdded | null = null;
    try {
      validationInfo = await add([result.signature.field], signal, (stored) => {
        validationInfo = stored;
      });
      return { ...result, validationInfo, validationInfoError: null };
    } catch (error) {
      return { ...result, validationInfo, validationInfoError: toPluginError('signature', error) };
    } finally {
      validateNow();
    }
  };

  return {
    afterSeal,
    api: {
      addValidationInfo: verb(addValidationInfo),
    } satisfies Partial<SignatureCapability>,
  };
}
export type SignatureValidationInfo = ReturnType<typeof createValidationInfo>;
