import type { DocumentMetadataTrapped } from './DocumentMetadata';
import type { DateInput } from './IsoDateTime';

/**
 * Three-state metadata patch, consistent with annotation patches
 * ({@link AnnotationPatchBase}):
 *
 *   undefined -> don't touch the field
 *   null      -> clear the field
 *   "..."     -> set the field to this value
 *
 * Standard Info-dict fields map to PDF keys (`title` -> /Title,
 * `createdAt` -> /CreationDate, `modifiedAt` -> /ModDate, ...). The dates
 * take an ISO 8601 string or a `Date`; the engine writes them as PDF dates
 * (`D:YYYYMMDD...`), keeping a string's offset.
 *
 * `trapped` has no clear-form (it is a tri-valued enum, always present);
 * omit it to leave it untouched. `''` is a value everywhere: it reads back
 * `''`, not `null`. The dict's other keys change through
 * {@link CustomMetadataPatch}.
 */
export interface MetadataPatch {
  title?: string | null;
  author?: string | null;
  subject?: string | null;
  keywords?: string | null;
  producer?: string | null;
  creator?: string | null;
  /** `/CreationDate`. */
  createdAt?: DateInput | null;
  /** `/ModDate`. */
  modifiedAt?: DateInput | null;
  trapped?: DocumentMetadataTrapped;
}
