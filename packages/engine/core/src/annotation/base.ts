import type { AnnotationFlags, AnnotationReplyType, BlendMode } from './primitives';
import type { PdfRect } from '../geometry/primitives';
import type { AnnotationIdentityQuality } from '../identity/AnnotationIdentityQuality';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { PageObjectNumber } from '../identity/PageObjectNumber';
import type { PdfAnnotationActions } from '../dto/PdfAction';

/**
 * Identity + provenance shell every annotation DTO extends.
 *
 * No subtype-specific fields. Each subtype's DTO under `annotation/kinds/`
 * extends this with exactly the fields it needs and the `subtype` literal
 * discriminator. This shell never grows when a new subtype lands.
 */
export interface AnnotationBase {
  ref: AnnotationRef;
  pageObjectNumber: PageObjectNumber;
  /** Display order inside the page; 0-based. */
  index: number;
  identityQuality: AnnotationIdentityQuality;
  /** /NM if present, exposed read-only. The engine never auto-stamps it. */
  nm: string | null;
  flags: AnnotationFlags;
  rect: PdfRect;
  /** /Contents text. */
  contents: string | null;
  /** /T author. */
  author: string | null;
  /** ISO 8601 from /CreationDate. */
  created: string | null;
  /** ISO 8601 from /M. */
  modified: string | null;

  /** Effective blend mode used by the normal appearance stream (`/AP /N`). */
  blendMode: BlendMode;

  /**
   * `/IRT` ("in reply to"), resolved to the parent annotation's
   * {@link AnnotationRef}, or `null` when this is a top-level annotation.
   *
   * The parent is always on the same page (ISO 32000 §12.5.6.2 requires
   * it) and is always an indirect object — `/IRT` is an indirect
   * reference — so the resolved ref is durable (`objectNumber`, or `nm`
   * if the parent carries `/NM`). The engine never auto-stamps the parent
   * on read; it only reports the identity PDFium already exposes.
   *
   * Relationships are NOT nested into the DTO: a reply / group member is
   * itself a first-class annotation in the flat page list. Use
   * `buildThreads()` to compose this flat edge into primary + replies +
   * groupedParts for a comments sidebar.
   */
  inReplyTo: AnnotationRef | null;
  /**
   * `/RT` (reply type) — how this annotation relates to its `/IRT`
   * parent. `null` exactly when {@link inReplyTo} is `null`. When `/IRT`
   * is present but `/RT` is absent, the engine normalizes it to `'reply'`
   * (the ISO 32000 §12.5.6.2 default).
   */
  replyType: AnnotationReplyType | null;

  /**
   * EmbedPDF-namespaced /EMBD_Metadata fields, when present on the
   * annotation. These are written by the cloud annotation pipeline (and
   * by engine-local when an identity is supplied at open time) so the
   * client can resolve collab semantics and author display.
   *
   * Absence means either:
   *   - the annotation was created before EMBD_Metadata was wired up,
   *   - it was created by a non-cloud writer (Acrobat, Foxit, etc.),
   *   - or the writer ran without an actor (anonymous test fixtures).
   *
   * Collab filters in the resolver treat absent userId/groupId as
   * not-self / not-in-group — i.e. deny — so unstamped annotations are
   * invisible to per-record collab rules. They are still visible to
   * `view:all` style reads, since reads aren't filtered (per the v1
   * spec).
   */
  userId?: string;
  groupId?: string;
  createdBy?: string;
  updatedBy?: string;
  /** `/A` and annotation `/AA`, available for every annotation subtype. */
  actions?: PdfAnnotationActions;
}
