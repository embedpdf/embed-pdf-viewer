import { type PdfEngineContextState } from '../context/pdf-engine-context';
/**
 * Composable to access the PDF engine from context.
 * @returns The PDF engine context state
 * @throws Error if used outside of PdfEngineProvider
 */
export declare function useEngineContext(): PdfEngineContextState;
/**
 * Composable to access the PDF engine, with a more convenient API.
 * @returns The PDF engine or null if loading/error
 */
export declare function useEngine(): import("@embedpdf/models").PdfEngine<Blob> | null;
