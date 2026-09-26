/** Session authority the action plane enforces itself (permission, not preference). */
import { DocumentsToken, type PluginContext } from '@embedpdf/core';

export function createAuthority(ctx: PluginContext<void>) {
  const allowsPrint = (): boolean =>
    ctx.tryGet(DocumentsToken)?.allows('doc.print', ctx.documentId) ?? true;
  return { allowsPrint };
}
