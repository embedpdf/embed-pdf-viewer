import type { MutationMeta } from './MutationMeta';
import type { PageRef } from '../identity/PageRef';

export type PageFlattenUsage = 'display' | 'print';

/** Options of `pages.flatten()` and `page.annotations.flatten()`. */
export interface FlattenOptions {
  /** Which appearance to bake: what's shown (`'display'`, the default) or what's printed. */
  usage?: PageFlattenUsage;
}
/** Whether a page was flattened, or had nothing to flatten. A page that fails fails the whole call. */
export type PageFlattenStatus = 'applied' | 'unchanged';

export interface PageFlattenInput {
  pages: PageRef[];
  usage: PageFlattenUsage;
}

export interface PageFlattenItemResult {
  page: PageRef;
  status: PageFlattenStatus;
}

/**
 * Flatten is a content + annotation mutation, never a layout mutation, and
 * all or nothing: a page that fails, or a cancel, leaves every page as it
 * was.
 */
export interface PageFlattenResult {
  /** The original ordered request, retained for audit/event replay. */
  pages: PageRef[];
  usage: PageFlattenUsage;
  results: PageFlattenItemResult[];
  meta: MutationMeta;
}
