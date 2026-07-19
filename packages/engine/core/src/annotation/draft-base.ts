import type { AnnotationFlags, AnnotationReplyType, BlendMode } from './primitives';
import type { AnnotationRef } from '../identity/AnnotationRef';

/**
 * Generic fields every annotation Draft carries. These are not specific
 * to any subtype family; they map to PDF dictionary entries that exist
 * on every annotation per ISO 32000 §12.5.2 and may be authored at
 * create time.
 *
 * `nm` is here (and not in AnnotationPatchBase) because /NM seeds the
 * stable identity of a new annotation; it cannot be changed afterwards
 * without changing which annotation is being targeted.
 *
 * Authorial identity (/T author display, /EMBD_Metadata UserID and
 * GroupID) is set by the server from the caller's JWT identity at
 * creation — the worker writes /T from the caller's `display_name`
 * claim and /EMBD_Metadata from the caller's `user_id` / `group_id`
 * claims. The `doc.annotate.create` capability is the gate.
 */
export interface AnnotationDraftBase {
  contents?: string | null;
  /** Blend mode to bake into the normal appearance. Omit for the subtype default. */
  blendMode?: BlendMode;
  /** Optional /NM the caller wants to assign on creation. */
  nm?: string;
  /**
   * Optional `/F` (Annotation Flags) to set on creation. Only the keys
   * provided are set; omitted keys default to `false` (the dict starts at
   * 0). E.g. `{ print: true }` or `{ readOnly: true, hidden: true }`.
   */
  flags?: Partial<AnnotationFlags>;

  /**
   * Link this new annotation to an existing parent via `/IRT`. The parent
   * must be on the SAME page as this draft — the engine throws
   * `InvalidArg` otherwise (ISO 32000 §12.5.6.2). Resolving + writing the
   * link promotes a weak/direct parent to an indirect object; the
   * parent's strengthened stable id is reported in the create result's
   * `meta.changed`, and the read-back DTO's `inReplyTo` carries its
   * durable ref.
   */
  inReplyTo?: AnnotationRef;
  /**
   * `/RT` to write when {@link inReplyTo} is set. Defaults to `'reply'`
   * (the ISO default) when omitted. Ignored when `inReplyTo` is absent.
   */
  replyType?: AnnotationReplyType;
}
