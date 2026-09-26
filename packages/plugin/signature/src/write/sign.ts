/**
 * The act of sealing. One-shot: `sign` (prepare → the signer → complete,
 * through `@embedpdf/core-signature`). Two-phase: `prepareSignature` parks
 * the signing and hands out the digest; `completeSignature` seals it with a
 * detached CMS; `abortPending` cancels.
 */
import { PluginError } from '@embedpdf/core';
import { certificateCommonName, sign as signDocument } from '@embedpdf/core-signature';
import type {
  FormFieldRef,
  SignatureCompleteResult,
  SignaturePrepared,
} from '@embedpdf/engine-core/runtime';

import type { PrepareSignatureInput, SignatureCapability, SignFieldInput } from '../contract';
import type { SignatureContext, SignatureServices } from '../services';
import { ORIGIN_API } from '../services/events';
import { sameRef } from '../services/store';
import type { SignatureHydration } from '../sync/hydration';

export function createSigning(
  ctx: SignatureContext,
  {
    events,
    store,
    authority,
    marks,
  }: Pick<SignatureServices, 'events' | 'store' | 'authority' | 'marks'>,
  { refresh, validate }: Pick<SignatureHydration, 'refresh' | 'validate'>,
  target: { clearIfTarget(field: FormFieldRef): void },
) {
  const { signed } = events;
  const { state, withBusy, requireSignatures } = store;
  const { resolveSigner } = authority;
  const { bytesOf, markBytes } = marks;

  /** Two-phase signings this session prepared: the version each one must complete against. */
  const prepared = new Map<string, SignaturePrepared>();

  const appearanceOf = async (input: {
    mark?: SignFieldInput['mark'];
    appearance?: SignFieldInput['appearance'];
  }) => {
    if (input.appearance) return bytesOf(input.appearance);
    if (input.mark) return markBytes(input.mark);
    return null;
  };

  const settle = async (field: FormFieldRef, result: SignatureCompleteResult) => {
    target.clearIfTarget(field);
    await refresh();
    void validate().catch((error) =>
      globalThis.console?.error('[signature] validation after signing failed:', error),
    );
    signed.emit({ field, result, origin: ORIGIN_API });
    return result;
  };

  const sign = (input: SignFieldInput): Promise<SignatureCompleteResult> =>
    withBusy(async () => {
      const { doc } = requireSignatures();
      const signer = await resolveSigner(input.signer);
      // The certificate's subject is the default /Name; the caller's facts win.
      const subject =
        signer.kind === 'raw' && signer.certificateChain[0]
          ? certificateCommonName(signer.certificateChain[0])
          : null;
      const attribution = { ...(subject ? { name: subject } : {}), ...input.attribution };
      // The appearance IS the mark: its page is drawn into the widget by the engine.
      const appearance = (await appearanceOf(input))!;
      const result = await signDocument(doc, {
        field: input.field,
        signer,
        attribution,
        certify: input.certify,
        lock: input.lock,
        appearance: { pdf: appearance, pageIndex: 0 },
      });
      return settle(input.field, result);
    });

  const prepareSignature = (input: PrepareSignatureInput): Promise<SignaturePrepared> =>
    withBusy(async () => {
      const { signatures } = requireSignatures();
      const appearance = await appearanceOf(input);
      const result = await signatures.prepare({
        field: input.field,
        attribution: input.attribution,
        certify: input.certify,
        lock: input.lock,
        subFilter: input.subFilter,
        digest: input.digest,
        ...(appearance ? { appearance: { pdf: appearance, pageIndex: 0 } } : {}),
      });
      prepared.set(result.signingId, result);
      ctx.dispatch({
        type: 'PENDING',
        pending: { signingId: result.signingId, field: input.field },
      });
      return result;
    });

  const completeSignature = (
    signingId: string,
    cms: Uint8Array,
  ): Promise<SignatureCompleteResult> =>
    withBusy(async () => {
      const { signatures } = requireSignatures();
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
      ctx.dispatch({ type: 'PENDING', pending: null });
      return settle(result.signature.field, result);
    });

  const abortPending = async (): Promise<void> => {
    const pending = state().pending;
    if (!pending) return;
    const { signatures } = requireSignatures();
    await signatures.abort(pending.signingId);
    prepared.delete(pending.signingId);
    ctx.dispatch({ type: 'PENDING', pending: null });
  };

  return {
    sign,
    api: {
      sign,
      prepareSignature,
      completeSignature,
      abortPending,
    } satisfies Partial<SignatureCapability>,
  };
}
export type SignatureSigning = ReturnType<typeof createSigning>;

/** Whether `field` is the sign-here target. */
export const isTarget = (target: FormFieldRef | null, field: FormFieldRef): boolean =>
  target !== null && sameRef(target, field);
