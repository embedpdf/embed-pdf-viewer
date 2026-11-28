/**
 * Wiring to sibling plugins. With the interaction hub and the stamp plugin
 * present, an armed mark from a `signatures` library dropped over an
 * unsigned signature field the user signs, or an image field the user fills
 * in, goes into the field instead of onto the page. With the annotation
 * plugin, its preview over such a field shows in the field.
 */
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
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
      createArmedMarkHandler(
        documentId,
        signature,
        ctx.get(FormToken),
        stamp,
        ctx.tryGet(AnnotationHostToken),
        interaction,
      ),
    ),
  );
}
