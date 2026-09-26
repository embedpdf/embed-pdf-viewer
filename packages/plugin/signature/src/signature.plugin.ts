import { definePlugin } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';
import { FormToken } from '@embedpdf/plugin-form/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { StampToken } from '@embedpdf/plugin-stamp/contract';

import { SignatureToken, type SignatureCapability, type SignatureConfig } from './contract';
import { createSignatureController } from './controller';
import { initialSignatureState, type SignatureState } from './model';

/**
 * The signature plugin: the act of signing, document-scoped. It owns no
 * mark: marks are stamp-library assets (or bytes the embedder brings), and
 * the mark is the appearance the engine draws into the field. Signing goes
 * through `@embedpdf/core-signature` with the configured signer port; the
 * engine seals; on the cloud the server publishes the new version.
 *
 * With the interaction hub and the stamp plugin present, an armed mark from
 * a `signatures` library dropped over an unsigned signature field goes into
 * the field (sign, visual fill or ask, by mode) instead of onto the page.
 */
export const signaturePlugin = (config: SignatureConfig = {}) =>
  definePlugin<SignatureState, SignatureCapability>({
    id: 'signature',
    token: SignatureToken,
    scope: 'document',
    requires: [FormToken],
    optional: [InteractionToken, StampToken, AnnotationToken],
    state: initialSignatureState,
    create: (ctx) => createSignatureController(ctx, config),
  });
