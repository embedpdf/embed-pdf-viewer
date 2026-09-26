/**
 * @embedpdf/plugin-redaction/contract: the public redaction vocabulary.
 * Marking is annotation authoring (a mark is a `redact` annotation); applying
 * is the destructive document mutation. The plugin owns no mark state: the
 * pending view is a live projection of the annotation plane.
 */
import type { BatchResult, ChangeOrigin, EventHook, OperationOptions } from '@embedpdf/core';
import type { Rect } from '@embedpdf/core-geometry';
import type {
  AnnotationRef,
  PageRef,
  RedactionApplyResult,
  SearchQuery,
} from '@embedpdf/engine-core';

export { RedactionToken } from './token';
export type { RedactionApplyResult } from '@embedpdf/engine-core';

/** `redactionPlugin(config)`. */
export interface RedactionConfig {
  /**
   * The applied fill and the overlay label's look for marks made by
   * `markArea`, `markPage` and `markMatches`. Selection marks take the
   * annotation plugin's `redact` preset instead.
   */
  overlay?: {
    /** CSS hex colour painted over the region on apply. Default black. */
    fill?: string;
    text?: {
      /** CSS hex colour of the overlay label. Default white. */
      color?: string;
      fontFamily?: string;
      /** Points; 0 = auto-fit. */
      fontSize?: number;
    };
  };
}

/**
 * One pending redaction mark — a live projection of a `redact` annotation on
 * the annotation plane (delete the annotation and the mark is gone).
 */
export interface RedactionMark {
  readonly ref: AnnotationRef;
  readonly page: PageRef;
  /** Display index (0-based) from the page registry — for "page N" labels. */
  readonly pageIndex: number;
  /** `area` = rect-only mark (marquee); `text` = per-line quads (selection). */
  readonly kind: 'area' | 'text';
  /** Page-space bounds of the region. */
  readonly bounds: Rect;
  /** `/OverlayText` label, when set. */
  readonly overlayText: string | null;
}

export interface RedactionMarkFilter {
  readonly page?: PageRef;
}

/** A label edit: `overlayText: null` clears it; `repeat` tiles it. */
export interface RedactionLabelPatch {
  overlayText?: string | null;
  repeat?: boolean;
}

/** Which other annotations an apply would destroy (a client-side estimate; the result is authoritative). */
export interface RedactionCollateral {
  readonly count: number;
  readonly refs: readonly AnnotationRef[];
}

// ── events ──
/** A confirmed apply, from this session or another. */
export interface RedactionAppliedEvent {
  readonly result: RedactionApplyResult;
  readonly origin: ChangeOrigin;
}
/** Marks were created, changed or removed on these pages. */
export interface RedactionPendingChangedEvent {
  readonly pages: readonly PageRef[];
}

export interface RedactionCapability {
  /**
   * Whether marking is allowed. Marking and applying are different powers: a
   * mark is an ordinary `redact` annotation, so this is annotation create
   * authority (matches Acrobat: any reviewer who can annotate can propose
   * redactions). The engine enforces it; this is the UI mirror.
   */
  canMark(): boolean;
  /**
   * Whether applying is allowed: the engine has a redaction service and every
   * capability its apply asserts is granted (`doc.redact`, `doc.pages.modify`,
   * `doc.annotate.modify`). The engine enforces it; this is the UI mirror.
   */
  canApply(): boolean;
  /** An apply of this session is running at the engine. */
  isApplying(): boolean;
  /** The last confirmed apply result, from this session or another. */
  getLastResult(): RedactionApplyResult | null;

  // ── the pending view ──
  /** Pending marks in page order. Reference-stable while unchanged. */
  listPending(filter?: RedactionMarkFilter): readonly RedactionMark[];
  getPending(ref: AnnotationRef): RedactionMark | null;
  getPendingCount(page?: PageRef): number;
  /** Which other annotations applying these marks (default: all) would destroy. */
  estimateCollateral(refs?: readonly AnnotationRef[]): RedactionCollateral;

  // ── marking ──
  // Every marking verb rejects `permission-denied` without annotation create
  // authority (see `canMark`).
  /**
   * Mark the current text selection (one mark per page) and clear it. Empty
   * without a selection; rejects `unsupported` without the selection plugin.
   */
  markSelection(options?: OperationOptions): Promise<readonly AnnotationRef[]>;
  /** Mark a page-space rectangle. */
  markArea(page: PageRef, bounds: Rect, options?: OperationOptions): Promise<AnnotationRef>;
  /** Mark a whole page. Rejects `not-found` for a page of another document. */
  markPage(page: PageRef, options?: OperationOptions): Promise<AnnotationRef>;
  /**
   * Mark every match of a search. Runs the query through the search plugin,
   * so it replaces the user's current search; rejects `unsupported` without
   * the search plugin.
   */
  markMatches(
    query: SearchQuery,
    options?: { pages?: readonly PageRef[] } & OperationOptions,
  ): Promise<readonly AnnotationRef[]>;
  /** Remove marks. Refs that are not pending marks are skipped. */
  unmark(
    refs: readonly AnnotationRef[],
    options?: OperationOptions,
  ): Promise<BatchResult<AnnotationRef, AnnotationRef>>;
  /** Remove every mark. */
  clearPending(options?: OperationOptions): Promise<BatchResult<AnnotationRef, AnnotationRef>>;
  /** Edit a mark's overlay label. Keeps the mark's current `/DA` styling. */
  updateLabel(
    ref: AnnotationRef,
    patch: RedactionLabelPatch,
    options?: OperationOptions,
  ): Promise<void>;

  // ── applying (irreversible) ──
  /**
   * Apply specific pending marks. Per-page outcomes ride the result. Applies
   * run one at a time in call order; when one resolves, `getLastResult()`
   * holds its result and `onApplied` has fired. Rejects with `not-found` when
   * none of the refs is a pending mark, `unsupported` without an engine
   * redaction service, or the engine's `permission-denied`.
   */
  apply(refs: readonly AnnotationRef[], options?: OperationOptions): Promise<RedactionApplyResult>;
  /**
   * Apply every redaction in the document, in pages scope, including marks
   * on pages this client never loaded. Rejects like `apply`, and with
   * `not-ready` when the document has no pages.
   */
  applyAll(options?: OperationOptions): Promise<RedactionApplyResult>;
  /** Apply the marks on some pages. Rejects like `apply`, and with `invalid-input` for no pages. */
  applyPages(pages: readonly PageRef[], options?: OperationOptions): Promise<RedactionApplyResult>;

  // ── events ──
  /** A confirmed apply, from this session or another; fires after `getLastResult()` changed. */
  readonly onApplied: EventHook<RedactionAppliedEvent>;
  /** Marks were created, changed or removed on some pages. */
  readonly onPendingChanged: EventHook<RedactionPendingChangedEvent>;
}
