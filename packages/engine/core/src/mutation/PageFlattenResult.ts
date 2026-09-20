import type { SerializedEngineError } from '../errors/EngineError';
import type { PageRef } from '../identity/PageRef';
import type { MutationMeta } from './MutationMeta';

export type PageFlattenUsage = 'display' | 'print';
export type PageFlattenStatus = 'applied' | 'unchanged' | 'failed' | 'skipped';

export interface PageFlattenInput {
  pages: PageRef[];
  usage: PageFlattenUsage;
}

export interface PageFlattenItemResult {
  page: PageRef;
  status: PageFlattenStatus;
  error?: SerializedEngineError;
}

/** Flatten is a content + annotation mutation, never a layout mutation. */
export interface PageFlattenResult {
  /** The original ordered request, retained for audit/event replay. */
  pages: PageRef[];
  usage: PageFlattenUsage;
  results: PageFlattenItemResult[];
  meta: MutationMeta | null;
}
