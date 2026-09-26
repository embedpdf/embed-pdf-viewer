import type { IsoDateTime } from './IsoDateTime';

export type DocumentMetadataTrapped = 'true' | 'false' | 'unknown';

export interface DocumentMetadata {
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string | null;
  producer: string | null;
  creator: string | null;
  /** `/CreationDate`. */
  createdAt: IsoDateTime | null;
  /** `/ModDate`. */
  modifiedAt: IsoDateTime | null;
  trapped: DocumentMetadataTrapped;
  custom: Record<string, string>;
}
