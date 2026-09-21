import { definePlugin } from '@embedpdf/core';
import { FormToken } from '@embedpdf/plugin-form/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { StampToken } from '@embedpdf/plugin-stamp/contract';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';

import { createSignatureCapability } from './capability';
import { createArmedMarkHandler } from './handler';
import { initialSignatureState, signatureReducer } from './reducer';
import { SignatureToken } from './types';
import type {
  SignatureAction,
  SignatureCapability,
  SignatureConfig,
  SignatureState,
} from './types';

/**
 * The signature plugin — the ACT of signing, document-scoped. It owns no
 * mark: marks are stamp-library assets (or bytes the embedder brings), and
 * the mark IS the appearance the engine draws into the field. Signing goes
 * through `@embedpdf/core-signature` with the configured signer port; the
 * engine seals; on the cloud the server publishes the new version.
 *
 * With the interaction hub and the stamp plugin present, an armed mark from
 * a `signatures` library dropped over an unsigned signature field goes into
 * the field (sign / visual fill / ask, by mode) instead of onto the page.
 */
export const signaturePlugin = (config: SignatureConfig = {}) =>
  definePlugin<SignatureState, SignatureAction, SignatureCapability>({
    id: 'signature',
    token: SignatureToken,
    scope: 'document',
    requires: [FormToken],
    optional: [InteractionToken, StampToken, AnnotationToken],
    initialState: initialSignatureState,
    reduce: signatureReducer,
    capability: (ctx) => createSignatureCapability(ctx, config),
    init: (ctx) => {
      const signature = ctx.get(SignatureToken);
      void signature
        .refresh()
        .then((snapshot) =>
          snapshot?.signatures.some((s) => s.signed) ? signature.validate() : null,
        )
        .catch((error) => globalThis.console?.error('[signature] initial read failed:', error));
      const interaction = ctx.tryGet(InteractionToken);
      const stamp = ctx.tryGet(StampToken);
      if (interaction && stamp && ctx.documentId) {
        ctx.cleanup(
          interaction.registerHandler(
            createArmedMarkHandler(ctx.documentId, signature, ctx.get(FormToken), stamp),
          ),
        );
      }
    },
  });
