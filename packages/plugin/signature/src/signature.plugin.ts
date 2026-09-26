import { definePlugin } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';
import { FormToken } from '@embedpdf/plugin-form/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { StampToken } from '@embedpdf/plugin-stamp/contract';

import type { SignatureConfig } from './contract';
import { createSignatureController } from './controller';
import { SignatureToken } from './host-contract';
import type { SignatureHostCapability } from './host-contract';
import { initialSignatureState, signatureReducer } from './model';
import type { SignatureAction, SignatureState } from './model';
import { createArmedMarkHandler } from './tools/armed-mark';

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
  definePlugin<SignatureState, SignatureAction, SignatureHostCapability>({
    id: 'signature',
    token: SignatureToken,
    scope: 'document',
    requires: [FormToken],
    optional: [InteractionToken, StampToken, AnnotationToken],
    initialState: initialSignatureState,
    reduce: signatureReducer,
    create: (ctx) => {
      const { api, connect } = createSignatureController(ctx, config);
      return {
        api,
        connect() {
          connect();
          const interaction = ctx.tryGet(InteractionToken);
          const stamp = ctx.tryGet(StampToken);
          if (interaction && stamp && ctx.documentId) {
            ctx.cleanup(
              interaction.registerHandler(
                createArmedMarkHandler(ctx.documentId, api, ctx.get(FormToken), stamp),
              ),
            );
          }
        },
      };
    },
  });
