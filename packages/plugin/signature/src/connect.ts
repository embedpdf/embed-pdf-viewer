/**
 * Wiring to sibling plugins. With the interaction hub and the stamp plugin
 * present, an armed mark from a `signatures` library dropped over an
 * unsigned signature field goes into the field instead of onto the page.
 */
import { FormToken } from '@embedpdf/plugin-form/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { StampToken } from '@embedpdf/plugin-stamp/contract';

import type { SignatureCapability } from './contract';
import type { SignatureContext } from './services';
import { createArmedMarkHandler } from './tools/armed-mark';

export function connectSiblings(ctx: SignatureContext, signature: SignatureCapability): void {
  const interaction = ctx.tryGet(InteractionToken);
  const stamp = ctx.tryGet(StampToken);
  const documentId = ctx.documentId;
  if (!interaction || !stamp || !documentId) return;
  ctx.cleanup(
    interaction.registerHandler(
      createArmedMarkHandler(documentId, signature, ctx.get(FormToken), stamp),
    ),
  );
}
