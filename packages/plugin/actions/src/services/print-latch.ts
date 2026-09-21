/**
 * D3's document-print latch: while a print event wrapper is active
 * (`firePrintThroughAdapter`, `runDocumentVerb('print')`), a nested print
 * request is SUPPRESSED (`reentrant-print`) — the adapter opens exactly one
 * dialog per outer request. Read by the script surface, held by the
 * document-events area.
 */
export interface PrintLatch {
  active: boolean;
}

export const createPrintLatch = (): PrintLatch => ({ active: false });
