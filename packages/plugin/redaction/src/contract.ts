/**
 * @embedpdf/plugin-redaction/contract — the PUBLIC redaction vocabulary.
 * Marking is annotation authoring (a mark IS a `redact` annotation); applying
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
  /** Defaults for marks created through this plugin's verbs: the applied fill and the overlay label's look. */
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

/** Which OTHER annotations an apply would destroy (a client-side estimate; the result is authoritative). */
export interface RedactionCollateral {
  readonly count: number;
  readonly refs: readonly AnnotationRef[];
}

// ── events ──
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
   * The twins (permissions.md). Marking and applying are DIFFERENT powers:
   * a mark is an ordinary `redact` annotation, so `canMark()` is annotation
   * create authority (any reviewer who can annotate can propose redactions —
   * Acrobat parity); `canApply()` is the destructive rewrite — engine support
   * present AND every capability the engine's apply asserts (`doc.redact`,
   * `doc.pages.modify`, `doc.annotate.modify`). The engine enforces both
   * independently — these are the UI mirrors.
   */
  canMark(): boolean;
  canApply(): boolean;
  /** An apply is in flight. */
  isApplying(): boolean;
  /** The last apply result seen (own or remote). */
  getLastResult(): RedactionApplyResult | null;

  // ── the pending view ──
  /** Pending marks in page order. Reference-stable while unchanged. */
  listPending(filter?: RedactionMarkFilter): readonly RedactionMark[];
  getPending(ref: AnnotationRef): RedactionMark | null;
  getPendingCount(page?: PageRef): number;
  /** Which other annotations applying these marks (default: all) would destroy. */
  estimateCollateral(refs?: readonly AnnotationRef[]): RedactionCollateral;

  // ── marking ──
  /** Mark the current text selection (one mark per page) and clear it. Empty without a selection. */
  markSelection(options?: OperationOptions): Promise<readonly AnnotationRef[]>;
  /** Mark a page-space rectangle. */
  markArea(page: PageRef, bounds: Rect, options?: OperationOptions): Promise<AnnotationRef>;
  /** Mark a whole page. */
  markPage(page: PageRef, options?: OperationOptions): Promise<AnnotationRef>;
  /** Mark every match of a search (needs the search plugin). */
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
  /** Apply specific pending marks. Per-page outcomes ride the result. */
  apply(refs: readonly AnnotationRef[], options?: OperationOptions): Promise<RedactionApplyResult>;
  /** Apply every redaction in the document (pages scope — including marks on pages this client never loaded). */
  applyAll(options?: OperationOptions): Promise<RedactionApplyResult>;
  /** Apply the marks on some pages. */
  applyPages(pages: readonly PageRef[], options?: OperationOptions): Promise<RedactionApplyResult>;

  // ── events ──
  /** After ANY confirmed apply — own or a remote collaborator's. */
  readonly onApplied: EventHook<RedactionAppliedEvent>;
  readonly onPendingChanged: EventHook<RedactionPendingChangedEvent>;
}
