import { useContext } from '@framework';
import { CoreState } from '@embedpdf/core';
import { PDFContext } from '../context';

/**
 * Hook that provides access to the current core state.
 *
 * Note: This reads from the context which is already subscribed to core state changes
 * in the EmbedPDF component, so there's no additional subscription overhead.
 */
export function useCoreState(): CoreState | null {
  const { coreState } = useContext(PDFContext);
  return coreState;
}
