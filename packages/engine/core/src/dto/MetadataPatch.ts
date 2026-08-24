import type { DocumentMetadataTrapped } from './DocumentMetadata';

/**
 * Three-state metadata patch, consistent with annotation patches
 * ({@link AnnotationPatchBase}):
 *
 *   undefined -> don't touch the field
 *   null      -> clear the field
 *   "..."     -> set the field to this value
 *
 * Standard Info-dict fields map to PDF keys (`title` -> /Title,
 * `created` -> /CreationDate, `modified` -> /ModDate, ...). `created` and
 * `modified` accept ISO 8601 strings; the engine formats them into PDF
 * date syntax (`D:YYYYMMDD...`) on write.
 *
 * `trapped` has no clear-form (it is a tri-valued enum, always present);
 * omit it to leave it untouched.
 *
 * `custom` is a per-key three-state map over non-standard Info entries:
 * a string sets the key, `null` removes it, an absent key leaves it
 * untouched. Reserved standard keys are rejected by the engine.
 */
export interface MetadataPatch {
  title?: string | null;
  author?: string | null;
  subject?: string | null;
  keywords?: string | null;
  producer?: string | null;
  creator?: string | null;
  /** ISO 8601 string for /CreationDate; engine formats to PDF date syntax. */
  created?: string | null;
  /** ISO 8601 string for /ModDate; engine formats to PDF date syntax. */
  modified?: string | null;
  trapped?: DocumentMetadataTrapped;
  custom?: Record<string, string | null>;
}
