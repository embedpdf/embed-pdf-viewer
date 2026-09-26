export type PdfSaveMode = 'incremental' | 'rewrite';

export const DEFAULT_PDF_SAVE_MODE: PdfSaveMode = 'incremental';

/** Options of `doc.download()`. */
export interface DownloadOptions {
  /** `'incremental'` (the default) appends the changes; `'rewrite'` writes a new file. */
  mode?: PdfSaveMode;
}
