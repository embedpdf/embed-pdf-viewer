export type DocumentMetadataTrapped = 'true' | 'false' | 'unknown';

export interface DocumentMetadata {
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string | null;
  producer: string | null;
  creator: string | null;
  /** ISO 8601 string from /CreationDate. Date parsing is the caller's job. */
  created: string | null;
  /** ISO 8601 string from /ModDate. Date parsing is the caller's job. */
  modified: string | null;
  trapped: DocumentMetadataTrapped;
  custom: Record<string, string>;
}
