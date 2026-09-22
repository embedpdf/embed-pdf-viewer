/**
 * The act of sealing. One-shot: `sign` (prepare, the signer, complete,
 * through `@embedpdf/core-signature`). Two-phase: `prepareSignature` parks
 * the signing and hands out the digest; `completeSignature` seals it with a
 * detached CMS; `abortPending` cancels. The parked signing, the sealed
 * field's facts and `onSigned` come from the confirmed events the engine
 * publishes for each step (`sync/signatures.ts`), for every session alike.
 */
import { PluginError } from '@embedpdf/core';
import { certificateCommonName, sign as signDocument } from '@embedpdf/core-signature';
import type {
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

  const sign = (input: SignFieldInput): Promise<SignatureCompleteResult> =>
    withBusy(async () => {
      requireSignatures();
      const signer = await resolveSigner(input.signer);
      // The certificate's subject is the default /Name; the caller's facts win.
      const subject =
        signer.kind === 'raw' && signer.certificateChain[0]
          ? certificateCommonName(signer.certificateChain[0])
          : null;
      const attribution = { ...(subject ? { name: subject } : {}), ...input.attribution };
      // The appearance is the mark: its page is drawn into the widget by the engine.
      const appearance = (await appearanceOf(input))!;
      const result = await signDocument(ctx.doc, {
        field: input.field,
        signer,
        attribution,
        certify: input.certify,
        lock: input.lock,
        appearance: { pdf: appearance, pageIndex: 0 },
      });
      target.clearIfTarget(input.field);
      return result;
    });

  const prepareSignature = (input: PrepareSignatureInput): Promise<SignaturePrepared> =>
    withBusy(async () => {
      const signatures = requireSignatures();
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
      return result;
    });

  const completeSignature = (
    signingId: string,
    cms: Uint8Array,
  ): Promise<SignatureCompleteResult> =>
    withBusy(async () => {
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

  const abortPending = async (): Promise<void> => {
    const pending = reads.getPending();
    if (!pending) return;
    const { status } = await requireSignatures().abort(pending.signingId);
    prepared.delete(pending.signingId);
    // An abort or a completion clears the signing through its event; an
    // unknown signing has none.
    if (status === 'unknown') await signatures.disown(pending.signingId);
  };

  return {
    sign,
    api: {
      sign: verb(sign),
      prepareSignature: verb(prepareSignature),
      completeSignature: verb(completeSignature),
      abortPending: verb(abortPending),
    } satisfies Partial<SignatureCapability>,
  };
}
export type SignatureSigning = ReturnType<typeof createSigning>;
