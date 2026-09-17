import type { PDFContextState } from '../../../src/svelte';

/**
 * Fixture components push the context they resolve here so tests can compare
 * identities across component boundaries. Reset between tests.
 */
export const resolved: { label: string; context: PDFContextState }[] = [];

export const resetSink = () => {
  resolved.length = 0;
};
