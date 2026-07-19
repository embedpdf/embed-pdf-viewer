import type { SerializedEngineError } from '../errors/EngineError';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { PageObjectNumber } from '../identity/PageObjectNumber';
import type { MutationMeta } from './MutationMeta';

export type RedactionApplyStatus = 'applied' | 'unchanged' | 'failed' | 'skipped';

/**
 * What to apply. `pages` applies every REDACT annotation on each listed
 * page; `annotations` applies exactly the referenced REDACT annotations
 * (every `AnnotationRef` carries its page, so no separate page list is
 * needed). Referencing a non-REDACT annotation fails that page with
 * `InvalidArg` before anything is written.
 */
export type RedactionApplyScope =
  | { kind: 'pages'; pageObjectNumbers: PageObjectNumber[] }
  | { kind: 'annotations'; refs: AnnotationRef[] };

export interface RedactionApplyItemResult {
  pageObjectNumber: PageObjectNumber;
  status: RedactionApplyStatus;
  /**
   * Annotations OTHER than REDACT ones removed on this page as a side
   * effect (popup cascades and detached form widgets included). The
   * consumed REDACT annotations themselves are never counted — this is
   * the "collateral" signal for confirm dialogs and audit logs.
   */
  removedAnnotationCount: number;
  error?: SerializedEngineError;
}

/**
 * Apply is a content + annotation mutation, never a layout mutation:
 * content under each redacted region is destroyed, the configured overlay
 * (`/RO`, else `/IC` + `/OverlayText`) is painted into page content, and
 * the consumed REDACT annotations (plus intersecting collateral) are
 * removed.
 */
export interface RedactionApplyResult {
  /** The original request, retained for audit/event replay. */
  scope: RedactionApplyScope;
  results: RedactionApplyItemResult[];
  /** Total {@link RedactionApplyItemResult.removedAnnotationCount} across all pages. */
  removedAnnotationCount: number;
  meta: MutationMeta | null;
}
