import type { PieceInfoPatch, PieceInfoSnapshot } from '../dto/PieceInfo';
import { AbortablePromise } from '../promise/AbortablePromise';

/**
 * Access to `/PieceInfo` private application data (ISO 32000 §14.5). The
 * SAME interface serves both levels — `DocumentHandle.pieceInfo?` reads and
 * writes the catalog's `/PieceInfo`, `PageHandle.pieceInfo?` the page's —
 * mirroring the native API's doc/page symmetry.
 *
 * Optional on the contract while the cloud endpoints ship (the
 * `downloadLayer?` pattern): the local engine implements it; the cloud
 * engine omits it until a cloud consumer exists (writes there also need an
 * authorization-scope decision — currently they ride `doc.metadata.modify`
 * locally). Feature-detect with `handle.pieceInfo !== undefined`.
 *
 * Writes are engine-managed for spec bookkeeping: every update refreshes
 * the application dict's `/LastModified`, the page's `/LastModified`
 * (required once `/PieceInfo` is present), and — for catalog writes — the
 * document `/Info` `/ModDate`. No document event is published: piece data
 * is private app state, not rendered document state.
 */
export interface PieceInfoService {
  /**
   * The application's data, or null when the holder has no well-formed
   * entry for it. Unknown value types arrive as `{ type: 'unknown' }` and
   * survive sibling writes untouched.
   */
  read(application: string): AbortablePromise<PieceInfoSnapshot | null>;
  /**
   * Merge-write entries into the application's `/Private` dictionary:
   * strings/numbers/booleans/string-arrays write as the corresponding PDF
   * types, `{ name }` writes a PDF name, `null` deletes the key. One call
   * is one worker job — atomic with respect to every other engine
   * operation on this document.
   */
  update(application: string, patch: PieceInfoPatch): AbortablePromise<void>;
  /** Application names present under this holder's `/PieceInfo`. */
  applications(): AbortablePromise<string[]>;
  /** Remove the application's entire entry (sibling applications survive). */
  clear(application: string): AbortablePromise<void>;
}
