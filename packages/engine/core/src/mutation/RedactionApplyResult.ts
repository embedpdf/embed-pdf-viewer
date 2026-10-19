import type { MutationMeta } from './MutationMeta';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { PageRef } from '../identity/PageRef';

/** Whether a page was redacted, or had nothing to apply. A page that fails fails the whole call. */
export type RedactionApplyStatus = 'applied' | 'unchanged';

/**
 * What to apply. `pages` applies every redact annotation on each listed
 * page; `annotations` applies exactly the referenced redact annotations
 * (every `AnnotationRef` carries its page, so no separate page list is
 * needed). Referencing a non-redact annotation fails that page with
 * `InvalidArg` before anything is written.
 */
export type RedactionApplyScope = { pages: PageRef[] } | { annotations: AnnotationRef[] };

export interface RedactionApplyItemResult {
  page: PageRef;
  status: RedactionApplyStatus;
  /**
   * Annotations other than redact ones removed on this page as a side
   * effect (popup cascades and detached form widgets included). The
   * consumed redact annotations themselves are never counted — this is
   * the "collateral" signal for confirm dialogs and audit logs.
   */
  removedAnnotationCount: number;
}

/**
 * Apply is a content + annotation mutation, never a layout mutation:
 * content under each redacted region is destroyed, the configured overlay
 * (`/RO`, else `/IC` + `/OverlayText`) is painted into page content, and
 * the consumed redact annotations (plus intersecting collateral) are
 * removed. All or nothing: a page that fails, or a cancel, leaves every page
 * as it was.
 */
export interface RedactionApplyResult {
  /** The original request, retained for audit/event replay. */
  scope: RedactionApplyScope;
  results: RedactionApplyItemResult[];
  /** Total {@link RedactionApplyItemResult.removedAnnotationCount} across all pages. */
  removedAnnotationCount: number;
  meta: MutationMeta;
}
