import type { DocumentFontSettings } from './DocumentFontSettings';
import type { DocumentHandle } from './DocumentHandle';
import { hasLocalEngineBrand } from './localEngineBrand';
import type { LocalPageHandle } from './LocalPageHandle';
import type { PieceInfoService } from './PieceInfoService';
import type { DownloadOptions } from '../dto/PdfSaveMode';
import type { PageRef } from '../identity/PageRef';
import { AbortablePromise } from '../promise/AbortablePromise';
import type { BaseVersionInfo } from '../signature/types';

/**
 * A document the local engine opened: the shared {@link DocumentHandle} and
 * what only an engine running PDFium itself can do. Code that takes any
 * document checks with {@link isLocalDocument}.
 */
export interface LocalDocumentHandle extends DocumentHandle {
  /** Font embedding and text layout settings of this document (session state). */
  readonly fonts: DocumentFontSettings;
  /**
   * Catalog-level `/PieceInfo` private application data (ISO 32000 §14.5),
   * such as a stamp library's display name. Per-page piece data lives on
   * `page(ref).pieceInfo`.
   */
  readonly pieceInfo: PieceInfoService;
  page(ref: PageRef): LocalPageHandle;
  /**
   * Node only: write the document to a local file without moving its bytes
   * through JS. An untouched session (no unsaved edits, incremental mode) is
   * streamed out verbatim; for a signed document, exactly as sealed.
   */
  downloadToFile(path: string, options?: DownloadOptions): AbortablePromise<void>;
  /**
   * The saved version this session is on: SHA-256 and length of the loaded
   * bytes (for a layer session, of its base). Changes only when a signature
   * completes.
   */
  version(): AbortablePromise<BaseVersionInfo>;
  /**
   * Export just this document's layer as a self-contained artifact (the small
   * overlay diff over the unchanged base), which `open()` takes back with
   * `{ kind: 'artifact', bytes }`. Rejects on a session opened with
   * `sessionKind: 'plain'`.
   */
  downloadLayer(): AbortablePromise<Uint8Array>;
}

/**
 * Whether `doc` is a local engine's document, with its fonts, `/PieceInfo`,
 * layers, raw pixels and files.
 */
export function isLocalDocument(doc: DocumentHandle): doc is LocalDocumentHandle {
  return hasLocalEngineBrand(doc);
}
