import type { SerializedEngineError } from '../errors/EngineError';
import type { PageObjectNumber } from '../identity/PageObjectNumber';
import type { MutationMeta } from './MutationMeta';

export type PageFlattenUsage = 'display' | 'print';
export type PageFlattenStatus = 'applied' | 'unchanged' | 'failed' | 'skipped';

export interface PageFlattenInput {
  pageObjectNumbers: PageObjectNumber[];
  usage: PageFlattenUsage;
}

export interface PageFlattenItemResult {
  pageObjectNumber: PageObjectNumber;
  status: PageFlattenStatus;
  error?: SerializedEngineError;
}

/** Flatten is a content + annotation mutation, never a layout mutation. */
export interface PageFlattenResult {
  /** The original ordered request, retained for audit/event replay. */
  pageObjectNumbers: PageObjectNumber[];
  usage: PageFlattenUsage;
  results: PageFlattenItemResult[];
  meta: MutationMeta | null;
}
