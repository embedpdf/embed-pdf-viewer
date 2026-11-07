/**
 * The kernel's print, where the document's own print requests go (the Named Print verb, a
 * script's `print()`) when the host gave the kernel a printer. The kernel prints the
 * document's pages, and runs the document's /WP and /DP around the dialog through the wrap
 * this plugin registers (`ctx.aroundPrint`). Without a printer, requests fall back to the UI
 * adapter's `print`.
 */
import { DocumentsToken } from '@embedpdf/core';

import type { ActionsContext } from './context';

export function createDocumentPrint(ctx: ActionsContext) {
  const documents = () => ctx.get(DocumentsToken);
  return {
    /** Whether the kernel prints this document: `doc.print`, and the host gave a printer. */
    available: (): boolean => documents().canPrint(),
    /** Print the document through the kernel. */
    start: (): Promise<void> => documents().print(),
  };
}
