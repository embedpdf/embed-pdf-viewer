/** The shipped locale codes, in the package's order. */
export declare const LOCALES: readonly string[];
/**
 * The library PDF for `locale`, loaded as a lazy module of your build (a
 * shipped code; anything else falls back to `en`). Hand the bytes to
 * `importLibraryPdf` of `@embedpdf/plugin-stamp`.
 */
export declare function loadDefaultLibrary(locale: string): Promise<Uint8Array>;
