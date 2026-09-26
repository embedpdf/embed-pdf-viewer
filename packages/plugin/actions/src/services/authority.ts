/** Session authority the action plane enforces itself (permission, not preference). */
import { DocumentsToken } from '@embedpdf/core';

import type { ActionsContext } from './context';

export function createAuthority(ctx: ActionsContext) {
  const allowsPrint = (): boolean =>
    ctx.tryGet(DocumentsToken)?.allows('doc.print', ctx.documentId ?? undefined) ?? true;
  return { allowsPrint };
}
