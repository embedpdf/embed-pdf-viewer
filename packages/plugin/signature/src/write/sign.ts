/**
 * The act of sealing. One-shot: `sign` (prepare, the key, complete,
 * through `@embedpdf/core-signature`). Two-phase: `prepareSignature` parks
 * the signing and hands out the digest; `completeSignature` seals it with a
 * detached CMS; `cancelPending` cancels. The parked signing, the sealed
 * field's facts and `onSigned` come from the confirmed events the engine
 * publishes for each step (`sync/signatures.ts`), for every session alike.
 */
import { PluginError, type OperationOptions } from '@embedpdf/core';
import { certificateCommonName, sign as signDocument } from '@embedpdf/core-signature';
import type {
  DocumentHandle,
  FormFieldRef,
  SignatureCompleteResult,
  SignaturePrepared,
} from '@embedpdf/engine-core/runtime';

import type { PrepareSignatureInput, SignatureCapability, SignFieldInput } from '../contract';
import type { SignatureReads } from '../read/signatures';
import type { SignatureContext, SignatureServices } from '../services';
import { verb } from '../services/errors';
import type { SignaturesMirror } from '../sync/signatures';

export function createSigning(
  ctx: SignatureContext,
  { store, authority, marks }: Pick<SignatureServices, 'store' | 'authority' | 'marks'>,
  { api: reads }: Pick<SignatureReads, 'api'>,
  target: { clearIfTarget(field: FormFieldRef): void },
  signatures: Pick<SignaturesMirror, 'disown'>,
) {
  const { withBusy, requireSignatures } = store;
  const { resolveKey, assertAllowedField } = authority;
  const { bytesOf, markBytes } = marks;

  /** Two-phase signings this session prepared: the version each one must complete against. */
  const prepared = new Map<string, SignaturePrepared>();

  const cancelled = (signal: AbortSignal): PluginError =>
    new PluginError('operation-cancelled', 'signature', 'signing cancelled', {
      cause: signal.reason,
    });

  /**
   * The document as one-shot signing sees it, with the caller's signal checked
   * right before the seal: a signal that fired by then leaves nothing signed
   * (the signing gives the prepared candidate up), and after it the seal is
   * done.
   */
  const sealUnlessCancelled = (signal: AbortSignal | undefined): DocumentHandle => {
    const signatures = requireSignatures();
    if (!signal) return ctx.doc;
    return {
      signatures: {
        prepare: (input: Parameters<typeof signatures.prepare>[0]) => signatures.prepare(input),
        cancel: (signingId: string) => signatures.cancel(signingId),
        complete: (input: Parameters<typeof signatures.complete>[0]) => {
          if (signal.aborted) return Promise.reject(cancelled(signal));
          return signatures.complete(input);
        },
      },
    } as unknown as DocumentHandle;
  };

  /**
   * Refused before anything starts: signing the field (`doc.sign`, or
   * `fields:sign` for its group), and `doc.sign.certify` for a certification.
   */
  const assertMaySign = (
    input: { field: FormFieldRef; certify?: unknown },
    operation: string,
  ): void => {
    assertAllowedField('sign', input.field, operation);
    if (input.certify) ctx.assertAllowed('doc.sign.certify', operation);
  };

  const appearanceOf = async (input: {
    mark?: SignFieldInput['mark'];
    appearance?: SignFieldInput['appearance'];
  }) => {
    if (input.appearance) return bytesOf(input.appearance);
    if (input.mark) return markBytes(input.mark);
    return null;
  };

  const sign = async (
    input: SignFieldInput,
    options?: OperationOptions,
  ): Promise<SignatureCompleteResult> => {
    assertMaySign(input, 'signature.sign');
    if (options?.signal?.aborted) throw cancelled(options.signal);
    return withBusy(async () => {
      const doc = sealUnlessCancelled(options?.signal);
      const key = await resolveKey(input.key);
      // The certificate's subject is the default /Name; the caller's facts win.
      const subject =
        key.kind === 'raw' && key.certificateChain[0]
          ? certificateCommonName(key.certificateChain[0])
          : null;
      const signer = { ...(subject ? { name: subject } : {}), ...input.signer };
      // The appearance is the mark: its page is drawn into the widget by the engine.
      const appearance = (await appearanceOf(input))!;
      const result = await signDocument(doc, {
        field: input.field,
        key,
        signer,
        certify: input.certify,
        lock: input.lock,
        appearance: { pdf: appearance },
      });
      target.clearIfTarget(input.field);
      return result;
    });
  };

  const prepareSignature = async (
    input: PrepareSignatureInput,
    options?: OperationOptions,
  ): Promise<SignaturePrepared> => {
    assertMaySign(input, 'signature.prepareSignature');
    return withBusy(async () => {
      const signatures = requireSignatures();
      const appearance = await appearanceOf(input);
      const pending = signatures.prepare({
        field: input.field,
        signer: input.signer,
        certify: input.certify,
        lock: input.lock,
        subFilter: input.subFilter,
        digest: input.digest,
        ...(appearance ? { appearance: { pdf: appearance } } : {}),
      });
      const result = await ctx.cancellable(options?.signal, pending);
      prepared.set(result.signingId, result);
      return result;
    });
  };

  const completeSignature = async (
    signingId: string,
    cms: Uint8Array,
    options?: OperationOptions,
  ): Promise<SignatureCompleteResult> => {
    // Its field was checked when it was prepared; the engine checks it again.
    if (options?.signal?.aborted) throw cancelled(options.signal);
    return withBusy(async () => {
      const signatures = requireSignatures();
      const parked = prepared.get(signingId);
      if (!parked) {
        throw new PluginError(
          'not-found',
          'signature',
          `no signing '${signingId}' was prepared in this session`,
        );
      }
      const result = await signatures.complete({
        signingId,
        cms,
        expectedVersion: parked.expectedVersion,
      });
      prepared.delete(signingId);
      target.clearIfTarget(result.signature.field);
      return result;
    });
  };

  const cancelPending = async (options?: OperationOptions): Promise<void> => {
    const pending = reads.getPending();
    if (!pending) return;
    assertAllowedField('sign', pending.field, 'signature.cancelPending');
    const { status } = await ctx.cancellable(
      options?.signal,
      requireSignatures().cancel(pending.signingId),
    );
    prepared.delete(pending.signingId);
    // A cancel or a completion clears the signing through its event; an
    // unknown signing has none.
    if (status === 'unknown') await signatures.disown(pending.signingId);
  };

  return {
    sign,
    api: {
      sign: verb(sign),
      prepareSignature: verb(prepareSignature),
      completeSignature: verb(completeSignature),
      cancelPending: verb(cancelPending),
    } satisfies Partial<SignatureCapability>,
  };
}
export type SignatureSigning = ReturnType<typeof createSigning>;
