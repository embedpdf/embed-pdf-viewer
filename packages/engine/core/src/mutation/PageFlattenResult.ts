import type { SerializedEngineError } from '../errors/EngineError';
import type { PageRef } from '../identity/PageRef';
import type { MutationMeta } from './MutationMeta';

export type PageFlattenUsage = 'display' | 'print';

/** Options of `pages.flatten()` and `page.annotations.flatten()`. */
export interface FlattenOptions {
  /** Which appearance to bake: what's shown (`'display'`, the default) or what's printed. */
  usage?: PageFlattenUsage;
}
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
  meta: MutationMeta;
}
