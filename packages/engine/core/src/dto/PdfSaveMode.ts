export type PdfSaveMode = 'incremental' | 'rewrite';

export const DEFAULT_PDF_SAVE_MODE: PdfSaveMode = 'incremental';

/** Options of `doc.download()`. */
export interface DownloadOptions {
  /** `'incremental'` (the default) appends the changes; `'rewrite'` writes a new file. */
  mode?: PdfSaveMode;
  /**
   * With `'incremental'`: fold the changes into the file's last update
   * section instead of appending a new one, so repeated saves keep one
   * section and the bytes before it unchanged. Falls back to a plain append
   * when the file has no update yet, its structure cannot be proven (e.g.
   * linearized), or the last section holds a signature. Ignored by
   * `'rewrite'`.
   */
  mergeLastUpdate?: boolean;
}
