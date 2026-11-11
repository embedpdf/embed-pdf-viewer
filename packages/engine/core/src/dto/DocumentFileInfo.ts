/**
 * The catalog's `/PageMode`: what a viewer shows next to the pages when the
 * document opens. `'none'` when the file sets none, or a mode PDF doesn't
 * define.
 */
export type DocumentPageMode =
  | 'none'
  | 'outlines'
  | 'thumbnails'
  | 'fullScreen'
  | 'optionalContent'
  | 'attachments';

/**
 * Facts about the file a viewer shows or keys on, read from its header,
 * trailer and catalog as written: no page is loaded.
 */
export interface DocumentFileInfo {
  /** The version the header declares (`%PDF-1.7` reads `'1.7'`); `null` when it declares none. */
  version: string | null;
  /**
   * The trailer's `/ID` pair as lowercase hex: `permanent` is set when the
   * file is made, `changing` on every save. `null` when the file has none.
   */
  identifiers: { permanent: string; changing: string } | null;
  /** The catalog's `/Lang`; `null` when it has none. */
  language: string | null;
  pageMode: DocumentPageMode;
  /** The catalog's XMP metadata packet as text; `null` when it has none or it isn't text. */
  xmp: string | null;
  /**
   * Every entry of the Info dictionary as written: the standard keys and the
   * custom ones, dates unparsed (`D:20240101120000+02'00'`), a name entry
   * (`/Trapped /True`) as its name. `doc.metadata.get()` reads the same
   * dictionary as typed fields.
   */
  info: Record<string, string>;
}
